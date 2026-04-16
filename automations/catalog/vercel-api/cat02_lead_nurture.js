import { Router } from 'express';
import { db } from '../lib/db.js';
import { sendEmailViaAcumbamail, sendSMS } from '../lib/messaging.js';
import { getEmailTemplate, renderTemplate } from '../lib/templates.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

// 1. Send welcome drip sequence
router.post('/send-welcome-drip', async (req, res) => {
  try {
    const { leadId, email, firstName, startDate, emails } = req.body;

    if (!leadId || !email) {
      return res.status(400).json({ success: false, error: 'Missing leadId or email' });
    }

    const emailSequence = emails || [
      { day: 0, subject: 'Welcome!', template: 'welcome_1' },
      { day: 2, subject: 'Here\\'s what we can do for you', template: 'welcome_2' },
      { day: 4, subject: 'See our success stories', template: 'welcome_3' },
      { day: 7, subject: 'Your free consultation', template: 'welcome_4' },
      { day: 10, subject: 'Limited-time offer', template: 'welcome_5' }
    ];

    // Schedule emails
    const schedules = [];
    for (const email_ of emailSequence) {
      const scheduleDate = new Date(startDate);
      scheduleDate.setDate(scheduleDate.getDate() + email_.day);

      const insertQuery = `
        INSERT INTO email_schedules (lead_id, email, subject, template_name, scheduled_time, sequence_name, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
        RETURNING id;
      `;

      const result = await db.query(insertQuery, [
        leadId,
        email,
        email_.subject,
        email_.template,
        scheduleDate.toISOString(),
        'welcome_drip'
      ]);

      schedules.push({
        emailId: result.rows[0].id,
        scheduledDate: scheduleDate.toISOString(),
        template: email_.template
      });
    }

    res.status(200).json({
      success: true,
      leadId,
      email,
      sequenceName: 'welcome_drip',
      emailsScheduled: schedules.length,
      details: schedules
    });

    await logAudit({
      action: 'welcome_drip_scheduled',
      leadId,
      emailCount: schedules.length
    });

  } catch (error) {
    console.error('Error scheduling welcome drip:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Deliver educational content
router.post('/deliver-content', async (req, res) => {
  try {
    const { leadId, email, serviceType, contentPieces } = req.body;

    if (!leadId || !email) {
      return res.status(400).json({ success: false, error: 'Missing leadId or email' });
    }

    const content = contentPieces || ['general_tips', 'industry_guide'];
    const sentContent = [];

    for (const piece of content) {
      const template = await getEmailTemplate(`content_${piece}`);
      if (!template) continue;

      const rendered = renderTemplate(template.html, {
        firstName: email.split('@')[0],
        serviceType,
        contentTitle: piece
      });

      // Send via email
      await sendEmailViaAcumbamail({
        recipient: email,
        subject: `Here's a useful guide: ${piece.replace(/_/g, ' ')}`,
        html: rendered,
        tags: ['nurture', serviceType, 'educational_content']
      });

      sentContent.push({ piece, sent: true, timestamp: new Date().toISOString() });
    }

    res.status(200).json({
      success: true,
      leadId,
      email,
      contentDelivered: sentContent.length,
      items: sentContent
    });

  } catch (error) {
    console.error('Error delivering content:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Send case study
router.post('/send-case-study', async (req, res) => {
  try {
    const { leadId, email, caseStudies } = req.body;

    if (!leadId || !email) {
      return res.status(400).json({ success: false, error: 'Missing leadId or email' });
    }

    const studies = caseStudies || ['enterprise_case_study_1'];
    const delivered = [];

    for (const study of studies) {
      const template = await getEmailTemplate(`case_study_${study}`);
      if (!template) continue;

      const rendered = renderTemplate(template.html, {
        firstName: email.split('@')[0],
        caseStudyTitle: study
      });

      await sendEmailViaAcumbamail({
        recipient: email,
        subject: `Success Story: ${study.replace(/_/g, ' ')}`,
        html: rendered,
        tags: ['nurture', 'case_study']
      });

      delivered.push({ study, deliveredAt: new Date().toISOString() });
    }

    res.status(200).json({
      success: true,
      leadId,
      email,
      caseStudiesDelivered: delivered.length,
      details: delivered
    });

  } catch (error) {
    console.error('Error sending case study:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Send objection handling sequence
router.post('/send-objection-sequence', async (req, res) => {
  try {
    const { leadId, email, objectionType, sequence, startDate } = req.body;

    if (!leadId || !email) {
      return res.status(400).json({ success: false, error: 'Missing leadId or email' });
    }

    const objectionSequences = {
      'too_expensive': [
        { day: 0, subject: 'Why our pricing is competitive', template: 'objection_price_1' },
        { day: 3, subject: 'See the ROI breakdown', template: 'objection_price_2' },
        { day: 6, subject: 'Payment options available', template: 'objection_price_3' }
      ],
      'budget_constraints': [
        { day: 0, subject: 'Flexible payment plans', template: 'objection_budget_1' },
        { day: 3, subject: 'Start small, scale up', template: 'objection_budget_2' },
        { day: 6, subject: 'Zero-interest financing', template: 'objection_budget_3' }
      ],
      'alternative_quotes': [
        { day: 0, subject: 'Why we\\'re different', template: 'objection_alt_1' },
        { day: 3, subject: 'Quality vs price comparison', template: 'objection_alt_2' },
        { day: 6, subject: 'Customer testimonials', template: 'objection_alt_3' }
      ],
      'timing_uncertain': [
        { day: 0, subject: 'Why now matters', template: 'objection_timing_1' },
        { day: 2, subject: 'Limited-time offer ends soon', template: 'objection_timing_2' },
        { day: 4, subject: 'Urgency: prices increase next month', template: 'objection_timing_3' }
      ]
    };

    const sequences = objectionSequences[objectionType] || objectionSequences['too_expensive'];
    const scheduled = [];

    for (const email_ of sequences) {
      const scheduleDate = new Date(startDate || new Date());
      scheduleDate.setDate(scheduleDate.getDate() + email_.day);

      const insertQuery = `
        INSERT INTO email_schedules (lead_id, email, subject, template_name, scheduled_time, sequence_name, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
        RETURNING id;
      `;

      const result = await db.query(insertQuery, [
        leadId,
        email,
        email_.subject,
        email_.template,
        scheduleDate.toISOString(),
        `objection_${objectionType}`
      ]);

      scheduled.push({ emailId: result.rows[0].id, scheduledDate: scheduleDate.toISOString() });
    }

    res.status(200).json({
      success: true,
      leadId,
      email,
      objectionType,
      emailsScheduled: scheduled.length
    });

  } catch (error) {
    console.error('Error sending objection sequence:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Send seasonal campaign
router.post('/send-seasonal-campaign', async (req, res) => {
  try {
    const { leadId, email, serviceType, campaign, startDate } = req.body;

    if (!leadId || !email) {
      return res.status(400).json({ success: false, error: 'Missing leadId or email' });
    }

    const campaignName = campaign || 'seasonal_offer';
    const rendered = renderTemplate(
      await getEmailTemplate(`campaign_${campaignName}`),
      { firstName: email.split('@')[0], serviceType }
    );

    await sendEmailViaAcumbamail({
      recipient: email,
      subject: `${serviceType.toUpperCase()}: Seasonal Special Offer`,
      html: rendered,
      tags: ['seasonal', serviceType, 'campaign']
    });

    // Also send SMS if phone exists
    const leadQuery = `SELECT phone FROM leads WHERE id = $1;`;
    const leadResult = await db.query(leadQuery, [leadId]);
    const lead = leadResult.rows[0];

    if (lead?.phone) {
      await sendSMS({
        to: lead.phone,
        message: `${serviceType} seasonal offer! Limited time only. Click: {{ campaign_url }}`
      });
    }

    res.status(200).json({
      success: true,
      leadId,
      email,
      campaign: campaignName,
      emailSent: true,
      smsSent: !!lead?.phone
    });

  } catch (error) {
    console.error('Error sending seasonal campaign:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Send re-engagement sequence
router.post('/send-reengagement', async (req, res) => {
  try {
    const { leadId, email, daysSinceContact, startDate } = req.body;

    if (!leadId || !email) {
      return res.status(400).json({ success: false, error: 'Missing leadId or email' });
    }

    const reengagementSequence = [
      { day: 0, subject: 'We miss you!', template: 'reeng_1' },
      { day: 3, subject: 'Quick question about your needs', template: 'reeng_2' },
      { day: 6, subject: 'Last chance: special offer inside', template: 'reeng_3' }
    ];

    const scheduled = [];
    for (const email_ of reengagementSequence) {
      const scheduleDate = new Date(startDate || new Date());
      scheduleDate.setDate(scheduleDate.getDate() + email_.day);

      const insertQuery = `
        INSERT INTO email_schedules (lead_id, email, subject, template_name, scheduled_time, sequence_name, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
        RETURNING id;
      `;

      const result = await db.query(insertQuery, [
        leadId,
        email,
        email_.subject,
        email_.template,
        scheduleDate.toISOString(),
        'reengagement'
      ]);

      scheduled.push(result.rows[0].id);
    }

    res.status(200).json({
      success: true,
      leadId,
      email,
      sequenceName: 'reengagement',
      emailsScheduled: scheduled.length,
      daysSinceContact
    });

  } catch (error) {
    console.error('Error sending re-engagement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Escalate warm lead
router.post('/escalate-warm-lead', async (req, res) => {
  try {
    const { leadId, email, engagementScore, notifyOwner, assignToRep } = req.body;

    if (!leadId || !email) {
      return res.status(400).json({ success: false, error: 'Missing leadId or email' });
    }

    // Update lead status to warm
    const updateQuery = `
      UPDATE leads
      SET status = 'warm', engagement_score = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, status;
    `;

    await db.query(updateQuery, [engagementScore || 75, leadId]);

    // Create sales handoff task if assignToRep
    if (assignToRep) {
      const taskQuery = `
        INSERT INTO sales_tasks (lead_id, task_type, priority, status, created_at)
        VALUES ($1, 'warm_lead_followup', 'high', 'pending', NOW())
        RETURNING id;
      `;
      await db.query(taskQuery, [leadId]);
    }

    res.status(200).json({
      success: true,
      leadId,
      email,
      escalationStatus: 'warm_lead',
      assigned: assignToRep,
      notified: notifyOwner
    });

  } catch (error) {
    console.error('Error escalating warm lead:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. Setup multi-channel nurture
router.post('/setup-multichannel', async (req, res) => {
  try {
    const { leadId, email, phone, channels, emailFreq, smsFreq } = req.body;

    if (!leadId || !email) {
      return res.status(400).json({ success: false, error: 'Missing leadId or email' });
    }

    const enabledChannels = channels || ['email'];
    const updateQuery = `
      UPDATE leads
      SET nurture_channels = $1, email_frequency = $2, sms_frequency = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING id;
    `;

    await db.query(updateQuery, [
      JSON.stringify(enabledChannels),
      emailFreq || 'weekly',
      smsFreq || 'every_3_days',
      leadId
    ]);

    const channelSetup = {
      email: enabledChannels.includes('email') ? { frequency: emailFreq || 'weekly', status: 'active' } : null,
      sms: enabledChannels.includes('sms') ? { frequency: smsFreq || 'every_3_days', status: 'active' } : null,
      pushNotification: enabledChannels.includes('push_notification') ? { frequency: 'twice_weekly', status: 'active' } : null
    };

    res.status(200).json({
      success: true,
      leadId,
      email,
      channels: channelSetup,
      campaignName: 'multi_channel_nurture'
    });

  } catch (error) {
    console.error('Error setting up multi-channel:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 9. Start service-specific path
router.post('/start-service-path', async (req, res) => {
  try {
    const { leadId, email, serviceType, contentPath, timeline, startDate } = req.body;

    if (!leadId || !email || !serviceType) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const path = contentPath || ['general_service_path'];
    const emailCount = 5;
    const days = timeline || 21;

    const scheduled = [];
    for (let i = 0; i < emailCount; i++) {
      const scheduleDate = new Date(startDate || new Date());
      scheduleDate.setDate(scheduleDate.getDate() + Math.floor((days / emailCount) * i));

      const insertQuery = `
        INSERT INTO email_schedules (lead_id, email, subject, template_name, scheduled_time, sequence_name, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
        RETURNING id;
      `;

      const result = await db.query(insertQuery, [
        leadId,
        email,
        `${serviceType.toUpperCase()} - Email ${i + 1}`,
        `service_path_${serviceType}_${i + 1}`,
        scheduleDate.toISOString(),
        `service_path_${serviceType}`
      ]);

      scheduled.push(result.rows[0].id);
    }

    res.status(200).json({
      success: true,
      leadId,
      email,
      serviceType,
      sequenceName: `service_path_${serviceType}`,
      emailsScheduled: scheduled.length,
      timeline
    });

  } catch (error) {
    console.error('Error starting service path:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 10. Recalculate lead scores
router.post('/recalculate-scores', async (req, res) => {
  try {
    const query = `
      UPDATE leads
      SET engagement_score = (
        COALESCE((SELECT COUNT(*) * 5 FROM lead_activities WHERE lead_id = leads.id AND created_at > NOW() - INTERVAL '30 days'), 0) +
        COALESCE((SELECT COUNT(*) * 2 FROM email_opens WHERE lead_id = leads.id AND opened_at > NOW() - INTERVAL '30 days'), 0) +
        COALESCE((SELECT COUNT(*) * 3 FROM email_clicks WHERE lead_id = leads.id AND clicked_at > NOW() - INTERVAL '30 days'), 0) +
        (CASE WHEN email_verified THEN 10 ELSE 0 END) +
        (CASE WHEN phone_verified THEN 10 ELSE 0 END)
      ),
      updated_at = NOW()
      WHERE status != 'disqualified'
      RETURNING id, engagement_score;
    `;

    const result = await db.query(query);

    res.status(200).json({
      success: true,
      leadsUpdated: result.rows.length,
      message: 'Lead scores recalculated successfully',
      timestamp: new Date().toISOString()
    });

    await logAudit({
      action: 'lead_scores_recalculated',
      recordsUpdated: result.rows.length
    });

  } catch (error) {
    console.error('Error recalculating scores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 11. Get nurture metrics
router.get('/metrics', async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const query = `
      SELECT
        COUNT(DISTINCT lead_id) as leads_in_sequences,
        COUNT(*) as total_scheduled_emails,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as emails_sent,
        SUM(CASE WHEN status = 'opened' THEN 1 ELSE 0 END) as emails_opened,
        SUM(CASE WHEN status = 'clicked' THEN 1 ELSE 0 END) as emails_clicked,
        ROUND(SUM(CASE WHEN status = 'opened' THEN 1 ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END), 0) * 100, 2) as open_rate,
        ROUND(SUM(CASE WHEN status = 'clicked' THEN 1 ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN status = 'opened' THEN 1 ELSE 0 END), 0) * 100, 2) as click_rate
      FROM email_schedules
      WHERE created_at > NOW() - INTERVAL '${parseInt(days)} days';
    `;

    const result = await db.query(query);

    res.status(200).json({
      success: true,
      period: `${days}_days`,
      metrics: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;