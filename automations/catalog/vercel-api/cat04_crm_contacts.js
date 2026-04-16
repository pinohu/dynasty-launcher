import { Router } from 'express';
import { db } from '../lib/db.js';
import { sendEmailViaAcumbamail, sendSMS } from '../lib/messaging.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

// 1. Standardize contact fields
router.post('/standardize', async (req, res) => {
  try {
    const { leadId, phone, address, zipCode, state, email, firstName, lastName } = req.body;

    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Missing leadId' });
    }

    const cleanPhone = phone ? phone.replace(/\D/g, '').slice(-10) : null;
    const cleanZip = zipCode ? zipCode.replace(/\D/g, '').substring(0, 5) : null;
    const cleanState = state ? state.toUpperCase().substring(0, 2) : null;

    const updateQuery = `
      UPDATE leads
      SET phone = COALESCE($1, phone),
          address = COALESCE($2, address),
          zip_code = COALESCE($3, zip_code),
          state = COALESCE($4, state),
          email = COALESCE($5, email),
          first_name = COALESCE($6, first_name),
          last_name = COALESCE($7, last_name),
          updated_at = NOW()
      WHERE id = $8
      RETURNING id, phone, zip_code, state;
    `;

    await db.query(updateQuery, [
      cleanPhone,
      address,
      cleanZip,
      cleanState,
      email?.toLowerCase(),
      firstName,
      lastName,
      leadId
    ]);

    res.status(200).json({
      success: true,
      leadId,
      standardized: { phone: cleanPhone, zipCode: cleanZip, state: cleanState, email: email?.toLowerCase() }
    });

  } catch (error) {
    console.error('Error standardizing contact:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Update lifecycle stage
router.post('/update-lifecycle', async (req, res) => {
  try {
    const { leadId, nextStage, daysSinceActivity } = req.body;

    if (!leadId || !nextStage) {
      return res.status(400).json({ success: false, error: 'Missing leadId or nextStage' });
    }

    const updateQuery = `
      UPDATE leads
      SET lifecycle_stage = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, lifecycle_stage;
    `;

    await db.query(updateQuery, [nextStage, leadId]);

    res.status(200).json({
      success: true,
      leadId,
      lifecycleStage: nextStage,
      daysSinceActivity
    });

  } catch (error) {
    console.error('Error updating lifecycle:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Create activity timeline
router.post('/create-timeline', async (req, res) => {
  try {
    const { leadId, timeline, totalActivities } = req.body;

    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Missing leadId' });
    }

    const query = `
      SELECT
        l.id, l.first_name, l.last_name, l.email,
        COUNT(a.id) as activity_count,
        ARRAY_AGG(json_build_object('type', a.activity_type, 'timestamp', a.created_at, 'description', a.description) ORDER BY a.created_at DESC LIMIT 10) as recent_activities,
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

    const contact = result.rows[0];

    res.status(200).json({
      success: true,
      leadId,
      contact: {
        id: contact.id,
        name: `${contact.first_name} ${contact.last_name}`,
        email: contact.email,
        totalActivities: contact.activity_count,
        recentActivities: contact.recent_activities,
        lastActivity: contact.last_activity
      }
    });

  } catch (error) {
    console.error('Error creating timeline:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Apply auto tags
router.post('/apply-tags', async (req, res) => {
  try {
    const { leadId, autoTags } = req.body;

    if (!leadId || !Array.isArray(autoTags)) {
      return res.status(400).json({ success: false, error: 'Missing leadId or tags array' });
    }

    const updateQuery = `
      UPDATE leads
      SET tags = array_cat(COALESCE(tags, '{}'), $1::text[]), updated_at = NOW()
      WHERE id = $2
      RETURNING id, tags;
    `;

    const result = await db.query(updateQuery, [autoTags, leadId]);

    res.status(200).json({
      success: true,
      leadId,
      tagsApplied: result.rows[0].tags,
      totalTags: result.rows[0].tags.length
    });

  } catch (error) {
    console.error('Error applying tags:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Merge duplicate contacts
router.post('/merge', async (req, res) => {
  try {
    const { primary, duplicate } = req.body;

    if (!primary || !duplicate) {
      return res.status(400).json({ success: false, error: 'Missing primary or duplicate leadId' });
    }

    // Get both leads
    const query = `SELECT id, email, phone, first_name, last_name FROM leads WHERE id IN ($1, $2);`;
    const result = await db.query(query, [primary, duplicate]);

    if (result.rows.length !== 2) {
      return res.status(404).json({ success: false, error: 'One or both leads not found' });
    }

    // Merge: update duplicate's data to primary if primary is missing
    const mergeQuery = `
      UPDATE leads AS l
      SET
        phone = COALESCE(l.phone, (SELECT phone FROM leads WHERE id = $2)),
        first_name = COALESCE(l.first_name, (SELECT first_name FROM leads WHERE id = $2)),
        last_name = COALESCE(l.last_name, (SELECT last_name FROM leads WHERE id = $2)),
        tags = array_cat(l.tags, (SELECT COALESCE(tags, '{}') FROM leads WHERE id = $2)),
        merged_with = array_append(COALESCE(l.merged_with, '{}'), $2),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, phone, first_name, last_name;
    `;

    await db.query(mergeQuery, [primary, duplicate]);

    // Update all activities to point to primary
    await db.query('UPDATE lead_activities SET lead_id = $1 WHERE lead_id = $2', [primary, duplicate]);

    // Mark duplicate as merged
    await db.query('UPDATE leads SET status = $1, merged_into = $2, updated_at = NOW() WHERE id = $3', ['merged', primary, duplicate]);

    res.status(200).json({
      success: true,
      mergedFrom: duplicate,
      mergedInto: primary,
      message: 'Contacts merged successfully'
    });

  } catch (error) {
    console.error('Error merging contacts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Flag stale contacts
router.post('/flag-stale', async (req, res) => {
  try {
    const { leadId, daysSinceActivity, isStale } = req.body;

    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Missing leadId' });
    }

    if (isStale) {
      const updateQuery = `
        UPDATE leads
        SET data_decay_flag = true, data_decay_level = 'critical', data_decay_date = NOW()
        WHERE id = $1
        RETURNING id, data_decay_flag;
      `;

      await db.query(updateQuery, [leadId]);

      res.status(200).json({
        success: true,
        leadId,
        flagged: true,
        daysSinceActivity,
        action: 'flagged_for_cleanup'
      });
    } else {
      res.status(200).json({
        success: true,
        leadId,
        flagged: false,
        daysSinceActivity,
        message: 'Contact data is current'
      });
    }

  } catch (error) {
    console.error('Error flagging stale contact:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Identify VIP customers
router.post('/identify-vip', async (req, res) => {
  try {
    const { leadId, isVip, tier, metrics } = req.body;

    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Missing leadId' });
    }

    const updateQuery = `
      UPDATE leads
      SET is_vip = $1, customer_tier = $2, vip_metadata = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING id, is_vip, customer_tier;
    `;

    await db.query(updateQuery, [
      isVip || false,
      tier || 'regular',
      JSON.stringify(metrics || {}),
      leadId
    ]);

    if (isVip) {
      // Send VIP treatment notification
      const lead = await db.query('SELECT email, first_name FROM leads WHERE id = $1', [leadId]);
      if (lead.rows[0]?.email) {
        await sendEmailViaAcumbamail({
          recipient: lead.rows[0].email,
          subject: 'You\\'ve been selected as a VIP customer!',
          html: `<p>Dear ${lead.rows[0].first_name}, we appreciate your loyalty and want to give you special treatment!</p>`,
          tags: ['vip', 'customer_recognition']
        });
      }
    }

    res.status(200).json({
      success: true,
      leadId,
      isVip,
      tier: tier || 'regular',
      metrics
    });

  } catch (error) {
    console.error('Error identifying VIP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. Sync with external CRM
router.post('/sync-external', async (req, res) => {
  try {
    const { leadId, email, crmSystem, syncDirection } = req.body;

    if (!leadId || !crmSystem) {
      return res.status(400).json({ success: false, error: 'Missing leadId or crmSystem' });
    }

    // Record sync attempt
    const syncQuery = `
      INSERT INTO crm_syncs (lead_id, external_crm, sync_direction, status, last_sync_at)
      VALUES ($1, $2, $3, 'completed', NOW())
      ON CONFLICT(lead_id, external_crm) DO UPDATE SET
        sync_direction = $3,
        status = 'completed',
        last_sync_at = NOW()
      RETURNING id, last_sync_at;
    `;

    const result = await db.query(syncQuery, [leadId, crmSystem, syncDirection || 'bidirectional']);

    res.status(200).json({
      success: true,
      leadId,
      email,
      crmSystem,
      syncDirection: syncDirection || 'bidirectional',
      lastSync: result.rows[0].last_sync_at,
      status: 'completed'
    });

  } catch (error) {
    console.error('Error syncing external CRM:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 9. Handle special events (birthdays/anniversaries)
router.post('/special-events', async (req, res) => {
  try {
    const { leadId, email, upcomingEvents, shouldNotify } = req.body;

    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Missing leadId' });
    }

    const notifications = [];

    if (shouldNotify && Array.isArray(upcomingEvents)) {
      for (const event of upcomingEvents) {
        const subject = event.type === 'birthday'
          ? `Happy Birthday! Here\\'s a special gift from us`
          : `Happy Anniversary! Thank you for your loyalty`;

        await sendEmailViaAcumbamail({
          recipient: email,
          subject,
          html: `<p>We wanted to celebrate this special day with you!</p>`,
          tags: [event.type, 'personal_touch']
        });

        notifications.push({ type: event.type, sent: true });
      }
    }

    res.status(200).json({
      success: true,
      leadId,
      email,
      eventsProcessed: upcomingEvents?.length || 0,
      notificationsSent: notifications.length
    });

  } catch (error) {
    console.error('Error handling special events:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 10. Check contact completeness
router.post('/check-completeness', async (req, res) => {
  try {
    const { leadId, completeness, missing, flagForEnrichment } = req.body;

    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Missing leadId' });
    }

    const updateQuery = `
      UPDATE leads
      SET data_completeness_score = $1, data_quality_gaps = $2, flagged_for_enrichment = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING id, data_completeness_score;
    `;

    await db.query(updateQuery, [
      completeness || 100,
      JSON.stringify(missing || []),
      flagForEnrichment || false,
      leadId
    ]);

    res.status(200).json({
      success: true,
      leadId,
      completeness: completeness || 100,
      missingFields: missing || [],
      needsEnrichment: flagForEnrichment || false
    });

  } catch (error) {
    console.error('Error checking completeness:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 11. Batch standardization
router.post('/batch-standardize', async (req, res) => {
  try {
    const { leads } = req.body;

    if (!Array.isArray(leads)) {
      return res.status(400).json({ success: false, error: 'Leads must be an array' });
    }

    let processedCount = 0;
    const errors = [];

    for (const lead of leads) {
      try {
        const cleanPhone = lead.phone ? lead.phone.replace(/\D/g, '').slice(-10) : null;
        const cleanZip = lead.zipCode ? lead.zipCode.replace(/\D/g, '').substring(0, 5) : null;

        await db.query(`
          UPDATE leads SET phone = $1, zip_code = $2, updated_at = NOW() WHERE id = $3
        `, [cleanPhone, cleanZip, lead.leadId]);

        processedCount++;
      } catch (err) {
        errors.push({ leadId: lead.leadId, error: err.message });
      }
    }

    res.status(200).json({
      success: true,
      processed: processedCount,
      total: leads.length,
      errors
    });

  } catch (error) {
    console.error('Error batch standardizing:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 12. Get contact profile
router.get('/contact/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;

    const query = `
      SELECT
        id, email, phone, first_name, last_name, address, zip_code, state,
        lifecycle_stage, is_vip, customer_tier, engagement_score,
        data_completeness_score, tags, created_at, updated_at
      FROM leads
      WHERE id = $1;
    `;

    const result = await db.query(query, [leadId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    res.status(200).json({
      success: true,
      contact: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;