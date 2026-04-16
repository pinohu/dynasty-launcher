import { Router } from 'express';
import { db } from '../lib/db.js';
import { sendOwnerNotification, sendLeadEmail } from '../lib/email.js';
import { validateEmail, validatePhone, formatPhone } from '../lib/validation.js';
import { getLeadOwner, assignLeadToOwner } from '../lib/crm.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

// Utility: Check for duplicate leads
async function checkDuplicate(email, phone) {
  if (!email && !phone) return null;

  const query = email
    ? `SELECT id, email, phone, source FROM leads WHERE LOWER(email) = LOWER($1) LIMIT 1`
    : `SELECT id, email, phone, source FROM leads WHERE phone = $1 LIMIT 1`;

  const params = email ? [email] : [phone];
  const result = await db.query(query, params);
  return result.rows[0] || null;
}

// 1. Upsert lead (create or update)
router.post('/upsert-lead', async (req, res) => {
  try {
    const { type, email, phone, firstName, lastName, name, serviceType, pageUrl, platform, campaignId, campaignName, referralCode, eventName, qrCodeId, callerId, source } = req.body;

    const cleanPhone = phone ? formatPhone(phone) : null;
    const cleanEmail = email ? email.toLowerCase().trim() : null;
    const firstName_ = firstName || name?.split(' ')[0] || null;
    const lastName_ = lastName || name?.split(' ')[1] || null;

    // Check for duplicates
    const existing = await checkDuplicate(cleanEmail, cleanPhone);

    let leadId;
    if (existing) {
      // Update existing lead
      const updateQuery = `
        UPDATE leads
        SET phone = COALESCE($1, phone),
            first_name = COALESCE($2, first_name),
            last_name = COALESCE($3, last_name),
            source = CASE WHEN source IS NULL THEN $4 ELSE source END,
            service_type = COALESCE($5, service_type),
            attributes = attributes || $6,
            updated_at = NOW()
        WHERE id = $7
        RETURNING id, email, phone, first_name, last_name, source;
      `;

      const result = await db.query(updateQuery, [
        cleanPhone,
        firstName_,
        lastName_,
        type,
        serviceType || null,
        JSON.stringify({ lastActivityType: type, lastActivityTime: new Date().toISOString() }),
        existing.id
      ]);

      leadId = result.rows[0].id;
    } else {
      // Create new lead
      const insertQuery = `
        INSERT INTO leads (email, phone, first_name, last_name, source, service_type, attributes, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id, email, phone, first_name, last_name, source;
      `;

      const result = await db.query(insertQuery, [
        cleanEmail,
        cleanPhone,
        firstName_,
        lastName_,
        type,
        serviceType || null,
        JSON.stringify({
          captureChannel: type,
          pageUrl,
          platform,
          campaignName,
          referralCode,
          eventName,
          qrCodeId,
          callerId
        })
      ]);

      leadId = result.rows[0].id;
    }

    res.status(200).json({
      success: true,
      leadId,
      action: existing ? 'updated' : 'created',
      email: cleanEmail,
      phone: cleanPhone
    });

    await logAudit({
      action: existing ? 'lead_updated' : 'lead_created',
      leadId,
      source: type,
      details: req.body
    });

  } catch (error) {
    console.error('Error upserting lead:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Log lead activity
router.post('/log-activity', async (req, res) => {
  try {
    const { leadId, type, source } = req.body;

    if (!leadId || !type) {
      return res.status(400).json({ success: false, error: 'Missing leadId or type' });
    }

    const query = `
      INSERT INTO lead_activities (lead_id, activity_type, description, source_data, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id;
    `;

    const result = await db.query(query, [
      leadId,
      type,
      `${type} capture: ${source?.pageUrl || source?.platform || source?.eventName || 'unknown'}`,
      JSON.stringify(source)
    ]);

    res.status(200).json({
      success: true,
      activityId: result.rows[0].id
    });

  } catch (error) {
    console.error('Error logging activity:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Notify business owner
router.post('/notify-owner', async (req, res) => {
  try {
    const { leadId, type, priority } = req.body;

    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Missing leadId' });
    }

    // Get lead details
    const leadQuery = `
      SELECT id, email, phone, first_name, last_name, source, service_type
      FROM leads WHERE id = $1;
    `;
    const leadResult = await db.query(leadQuery, [leadId]);
    const lead = leadResult.rows[0];

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    // Get owner for this lead
    const owner = await getLeadOwner(lead.service_type);

    if (owner) {
      // Send email notification
      await sendOwnerNotification({
        ownerEmail: owner.email,
        ownerName: owner.name,
        lead: {
          name: `${lead.first_name} ${lead.last_name}`,
          email: lead.email,
          phone: lead.phone,
          service: lead.service_type,
          source: lead.source
        },
        priority: priority ? 'high' : 'normal',
        captureType: type
      });

      // Assign lead to owner in CRM
      await assignLeadToOwner(leadId, owner.id);

      res.status(200).json({
        success: true,
        notified: owner.email,
        assignedTo: owner.id
      });
    } else {
      res.status(200).json({
        success: true,
        message: 'No owner assigned for this service type'
      });
    }

  } catch (error) {
    console.error('Error notifying owner:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Get lead by ID
router.get('/lead/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;

    const query = `
      SELECT l.*,
             COUNT(a.id) as activity_count,
             MAX(a.created_at) as last_activity
      FROM leads l
      LEFT JOIN lead_activities a ON l.id = a.lead_id
      WHERE l.id = $1
      GROUP BY l.id;
    `;

    const result = await db.query(query, [leadId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    res.status(200).json({
      success: true,
      lead: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Search leads by email or phone
router.post('/search-leads', async (req, res) => {
  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ success: false, error: 'Provide email or phone' });
    }

    let query = `SELECT id, email, phone, first_name, last_name, source, created_at FROM leads WHERE `;
    const params = [];

    if (email) {
      query += `LOWER(email) = LOWER($1)`;
      params.push(email);
    }

    if (phone) {
      const cleanPhone = formatPhone(phone);
      if (email) query += ` OR `;
      query += `phone = $${params.length + 1}`;
      params.push(cleanPhone);
    }

    const result = await db.query(query, params);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      leads: result.rows
    });

  } catch (error) {
    console.error('Error searching leads:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Get recent captures (last 24 hours)
router.get('/recent-captures', async (req, res) => {
  try {
    const query = `
      SELECT source, COUNT(*) as count, MAX(created_at) as latest
      FROM leads
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY source
      ORDER BY count DESC;
    `;

    const result = await db.query(query);

    res.status(200).json({
      success: true,
      period: 'last_24_hours',
      summary: result.rows
    });

  } catch (error) {
    console.error('Error fetching captures:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Get capture source attribution
router.get('/attribution-report', async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const query = `
      SELECT
        source,
        COUNT(*) as total_leads,
        COUNT(DISTINCT email) as unique_emails,
        COUNT(CASE WHEN source IN ('phone_call_tracking', 'chat_capture') THEN 1 END) as qualified_leads,
        MAX(created_at) as latest_lead
      FROM leads
      WHERE created_at > NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY source
      ORDER BY total_leads DESC;
    `;

    const result = await db.query(query);

    res.status(200).json({
      success: true,
      period: `${days}_days`,
      attribution: result.rows,
      total_leads: result.rows.reduce((sum, row) => sum + parseInt(row.total_leads), 0)
    });

  } catch (error) {
    console.error('Error generating attribution report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. Validate webhook payload
router.post('/validate-webhook', async (req, res) => {
  try {
    const { payload, captureType } = req.body;

    const validations = {
      website_visitor: ['visitorId', 'pageUrl'],
      form_submission: ['firstName', 'lastName', 'email', 'serviceType'],
      chat_capture: ['visitorEmail', 'visitorPhone'],
      social_lead_ads: ['leadId', 'platform'],
      referral_tracking: ['referralCode'],
      qr_scan: ['qrCodeId', 'scannedUrl'],
      phone_call_tracking: ['callId', 'callerId', 'receivedPhone'],
      event_scan: ['scanId', 'badgeId']
    };

    const required = validations[captureType] || [];
    const missing = required.filter(field => !payload[field]);

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        valid: false,
        missingFields: missing
      });
    }

    res.status(200).json({
      success: true,
      valid: true,
      message: 'Payload is valid'
    });

  } catch (error) {
    console.error('Error validating webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 9. Bulk import leads from CSV/JSON
router.post('/bulk-import', async (req, res) => {
  try {
    const { leads } = req.body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid leads array' });
    }

    const insertedLeads = [];
    const errors = [];

    for (let i = 0; i < leads.length; i++) {
      try {
        const lead = leads[i];
        const cleanEmail = lead.email ? lead.email.toLowerCase().trim() : null;
        const cleanPhone = lead.phone ? formatPhone(lead.phone) : null;

        // Check duplicate
        const existing = await checkDuplicate(cleanEmail, cleanPhone);

        if (!existing) {
          const query = `
            INSERT INTO leads (email, phone, first_name, last_name, source, service_type, attributes, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            RETURNING id;
          `;

          const result = await db.query(query, [
            cleanEmail,
            cleanPhone,
            lead.firstName || null,
            lead.lastName || null,
            'bulk_import',
            lead.serviceType || null,
            JSON.stringify(lead)
          ]);

          insertedLeads.push({ row: i, leadId: result.rows[0].id });
        }
      } catch (err) {
        errors.push({ row: i, error: err.message });
      }
    }

    res.status(200).json({
      success: true,
      inserted: insertedLeads.length,
      skipped: errors.length,
      details: { insertedLeads, errors }
    });

  } catch (error) {
    console.error('Error bulk importing:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 10. Export leads by source
router.get('/export/:source', async (req, res) => {
  try {
    const { source } = req.params;
    const { format = 'json' } = req.query;

    const query = `
      SELECT id, email, phone, first_name, last_name, service_type, source, created_at, updated_at, attributes
      FROM leads
      WHERE source = $1
      ORDER BY created_at DESC;
    `;

    const result = await db.query(query, [source]);

    if (format === 'csv') {
      const csv = [
        'ID,Email,Phone,First Name,Last Name,Service Type,Source,Created At',
        ...result.rows.map(r =>
          `${r.id},"${r.email}","${r.phone}","${r.first_name}","${r.last_name}","${r.service_type}","${r.source}","${r.created_at}"`
        )
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="leads_${source}.csv"`);
      res.send(csv);
    } else {
      res.status(200).json({
        success: true,
        count: result.rows.length,
        source,
        leads: result.rows
      });
    }

  } catch (error) {
    console.error('Error exporting leads:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;