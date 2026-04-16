import { Pool } from '@neondatabase/serverless';
import { Resend } from 'resend';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const resend = new Resend(process.env.ACUMBAMAIL_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, payload } = req.body;

    switch (action) {
      case 'welcome_sequence':
        return await createWelcomeSequence(req, res);
      case 'nurture_campaign':
        return await manageNurtureCampaign(req, res);
      case 'list_hygiene':
        return await cleanListHygiene(req, res);
      case 'ab_subject':
        return await testSubjectLines(req, res);
      case 'seasonal_schedule':
        return await scheduleSeasonalCampaigns(req, res);
      case 'segment_audience':
        return await segmentAudience(req, res);
      case 'lifecycle_trigger':
        return await manageLicecycleTriggers(req, res);
      case 'campaign_report':
        return await reportCampaignPerformance(req, res);
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function createWelcomeSequence(req, res) {
  const client = await pool.connect();
  try {
    const { leadId, email } = req.body;

    if (!leadId || !email) {
      return res.status(400).json({ error: 'leadId and email required' });
    }

    // Day 0: Welcome email
    await resend.emails.send({
      from: 'welcome@deputy.local',
      to: email,
      subject: 'Welcome to Deputy Services!',
      html: `
        <h2>Welcome!</h2>
        <p>Thanks for signing up. Get started with these resources:</p>
        <ul>
          <li><a href="https://deputy.local/onboarding">Quick Start Guide</a></li>
          <li><a href="https://deputy.local/docs">Documentation</a></li>
          <li><a href="https://deputy.local/support">Get Support</a></li>
        </ul>
      `
    });

    // Schedule Day 3: Value email
    await client.query(
      `INSERT INTO email_sequences (lead_id, email, sequence_type, day_number, status, scheduled_at)
       VALUES ($1, $2, 'welcome', 3, 'scheduled', NOW() + interval '3 days')`,
      [leadId, email]
    );

    // Schedule Day 7: Feature highlight
    await client.query(
      `INSERT INTO email_sequences (lead_id, email, sequence_type, day_number, status, scheduled_at)
       VALUES ($1, $2, 'welcome', 7, 'scheduled', NOW() + interval '7 days')`,
      [leadId, email]
    );

    res.status(201).json({
      success: true,
      leadId,
      sequenceCreated: true,
      emailsSent: 1,
      emailsScheduled: 2
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function manageNurtureCampaign(req, res) {
  const client = await pool.connect();
  try {
    const { campaignId, segmentId, emailTemplates = [] } = req.body;

    if (!campaignId || !segmentId || emailTemplates.length === 0) {
      return res.status(400).json({ error: 'campaignId, segmentId, and emailTemplates required' });
    }

    // Get segment contacts
    const segmentResult = await client.query(
      `SELECT id, email FROM contacts WHERE segment_id = $1`,
      [segmentId]
    );

    const contacts = segmentResult.rows;
    const scheduled = [];

    // Schedule emails with delays
    for (let i = 0; i < emailTemplates.length; i++) {
      const daysDelay = (i + 1) * 3; // Send every 3 days
      const template = emailTemplates[i];

      for (const contact of contacts) {
        const scheduledTime = new Date();
        scheduledTime.setDate(scheduledTime.getDate() + daysDelay);

        await client.query(
          `INSERT INTO email_campaigns (campaign_id, contact_id, email, template, scheduled_at, status)
           VALUES ($1, $2, $3, $4, $5, 'scheduled')`,
          [campaignId, contact.id, contact.email, template, scheduledTime]
        );
      }

      scheduled.push({
        template,
        dayOffset: daysDelay,
        recipientCount: contacts.length
      });
    }

    res.status(201).json({
      success: true,
      campaignId,
      segmentId,
      totalEmailsScheduled: contacts.length * emailTemplates.length,
      schedule: scheduled
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function cleanListHygiene(req, res) {
  const client = await pool.connect();
  try {
    // Remove hard bounces
    const bounceResult = await client.query(
      `SELECT COUNT(*) as count FROM contacts 
       WHERE bounce_type = 'hard' AND created_at < NOW() - interval '30 days'`
    );

    const hardBounceCount = parseInt(bounceResult.rows[0].count) || 0;

    await client.query(
      `DELETE FROM contacts 
       WHERE bounce_type = 'hard' AND created_at < NOW() - interval '30 days'`
    );

    // Mark unsubscribes
    const unsubResult = await client.query(
      `SELECT COUNT(*) as count FROM contacts WHERE unsubscribed = true AND suppressed = false`
    );

    const unsubCount = parseInt(unsubResult.rows[0].count) || 0;

    await client.query(
      `UPDATE contacts SET suppressed = true WHERE unsubscribed = true`
    );

    // Remove inactive (no opens/clicks in 180 days)
    const inactiveResult = await client.query(
      `SELECT COUNT(*) as count FROM contacts 
       WHERE last_engagement < NOW() - interval '180 days'
       AND list_status != 'inactive'`
    );

    const inactiveCount = parseInt(inactiveResult.rows[0].count) || 0;

    await client.query(
      `UPDATE contacts SET list_status = 'inactive'
       WHERE last_engagement < NOW() - interval '180 days'
       AND list_status != 'inactive'`
    );

    const report = {
      hardBouncesRemoved: hardBounceCount,
      unsubscribesSuppressed: unsubCount,
      inactivesMarked: inactiveCount,
      totalCleaned: hardBounceCount + unsubCount + inactiveCount
    };

    await client.query(
      `INSERT INTO list_hygiene_reports (data, created_at)
       VALUES ($1, NOW())`,
      [JSON.stringify(report)]
    );

    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function testSubjectLines(req, res) {
  const client = await pool.connect();
  try {
    const { campaignId, subjectLineA, subjectLineB, testSize = 0.1 } = req.body;

    if (!campaignId || !subjectLineA || !subjectLineB) {
      return res.status(400).json({ error: 'campaignId and both subject lines required' });
    }

    // Get segment size
    const countResult = await client.query(
      `SELECT COUNT(*) as total FROM contacts WHERE segment_id = (
        SELECT segment_id FROM email_campaigns WHERE id = $1 LIMIT 1
      )`,
      [campaignId]
    );

    const totalContacts = parseInt(countResult.rows[0].total) || 0;
    const testGroupSize = Math.max(100, Math.ceil(totalContacts * testSize));

    // Split test
    const groupAResult = await client.query(
      `SELECT id, email FROM contacts WHERE segment_id = (
        SELECT segment_id FROM email_campaigns WHERE id = $1 LIMIT 1
      ) ORDER BY RANDOM() LIMIT $2`,
      [campaignId, testGroupSize]
    );

    const groupA = groupAResult.rows;

    const groupBResult = await client.query(
      `SELECT id, email FROM contacts WHERE segment_id = (
        SELECT segment_id FROM email_campaigns WHERE id = $1 LIMIT 1
      ) AND id NOT IN (${groupA.map(g => g.id).join(',')}) LIMIT $2`,
      [campaignId, testGroupSize]
    );

    const groupB = groupBResult.rows;

    // Create test records
    await client.query(
      `INSERT INTO subject_line_tests (campaign_id, variant, subject_line, recipient_count, created_at)
       VALUES ($1, 'A', $2, $3, NOW()),
              ($1, 'B', $4, $5, NOW())`,
      [campaignId, subjectLineA, groupA.length, subjectLineB, groupB.length]
    );

    res.status(201).json({
      success: true,
      campaignId,
      testConfig: {
        variantA: { subject: subjectLineA, recipients: groupA.length },
        variantB: { subject: subjectLineB, recipients: groupB.length }
      },
      testDurationDays: 5,
      message: 'Subject line A/B test created. Winner will be determined in 5 days.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function scheduleSeasonalCampaigns(req, res) {
  const client = await pool.connect();
  try {
    const seasonalCampaigns = [
      { holiday: 'New Year', date: '2026-01-01', template: 'newyear_promotion' },
      { holiday: 'Valentine\'s Day', date: '2026-02-14', template: 'valentines_special' },
      { holiday: 'Easter', date: '2026-04-05', template: 'easter_promotion' },
      { holiday: 'Mother\'s Day', date: '2026-05-10', template: 'mothers_day' },
      { holiday: 'Summer', date: '2026-06-21', template: 'summer_campaign' },
      { holiday: 'Back to School', date: '2026-08-01', template: 'backtoschool' },
      { holiday: 'Thanksgiving', date: '2026-11-26', template: 'thanksgiving' },
      { holiday: 'Christmas', date: '2026-12-25', template: 'christmas_holiday' }
    ];

    const scheduled = [];

    for (const campaign of seasonalCampaigns) {
      const scheduleDate = new Date(campaign.date);
      scheduleDate.setDate(scheduleDate.getDate() - 3); // Schedule 3 days before

      await client.query(
        `INSERT INTO scheduled_campaigns (name, template, scheduled_at, status)
         VALUES ($1, $2, $3, 'scheduled')`,
        [campaign.holiday, campaign.template, scheduleDate]
      );

      scheduled.push({
        holiday: campaign.holiday,
        template: campaign.template,
        scheduledFor: scheduleDate
      });
    }

    res.status(201).json({
      success: true,
      campaignsScheduled: scheduled.length,
      campaigns: scheduled
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function segmentAudience(req, res) {
  const client = await pool.connect();
  try {
    const { segmentName, criteria } = req.body;

    if (!segmentName || !criteria) {
      return res.status(400).json({ error: 'segmentName and criteria required' });
    }

    let query = 'SELECT COUNT(*) as count FROM contacts WHERE 1=1';

    if (criteria.minSpend) {
      query += ` AND total_spend >= ${criteria.minSpend}`;
    }
    if (criteria.jobStatus) {
      query += ` AND last_job_status = '${criteria.jobStatus}'`;
    }
    if (criteria.daysInactive) {
      query += ` AND last_engagement < NOW() - interval '${criteria.daysInactive} days'`;
    }
    if (criteria.location) {
      query += ` AND location = '${criteria.location}'`;
    }

    const result = await client.query(query);
    const segmentSize = parseInt(result.rows[0].count) || 0;

    const segmentResult = await client.query(
      `INSERT INTO segments (name, criteria, size, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id`,
      [segmentName, JSON.stringify(criteria), segmentSize]
    );

    const segmentId = segmentResult.rows[0].id;

    res.status(201).json({
      success: true,
      segmentId,
      segmentName,
      size: segmentSize,
      criteria
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function manageLicecycleTriggers(req, res) {
  const client = await pool.connect();
  try {
    const { leadId, event, email } = req.body;

    if (!leadId || !event) {
      return res.status(400).json({ error: 'leadId and event required' });
    }

    let emailTemplate = '';
    let delayDays = 0;

    switch (event) {
      case 'signup':
        emailTemplate = 'welcome';
        delayDays = 0;
        break;
      case 'first_purchase':
        emailTemplate = 'thank_you_purchase';
        delayDays = 1;
        break;
      case 'abandoned_cart':
        emailTemplate = 'cart_recovery';
        delayDays = 0;
        break;
      case 'job_completed':
        emailTemplate = 'post_service_followup';
        delayDays = 3;
        break;
      case 'renewal_due':
        emailTemplate = 'renewal_reminder';
        delayDays = 0;
        break;
      case 'churn_risk':
        emailTemplate = 'win_back_campaign';
        delayDays = 0;
        break;
      default:
        return res.status(400).json({ error: 'Unknown event type' });
    }

    const sendTime = new Date();
    sendTime.setDate(sendTime.getDate() + delayDays);

    await client.query(
      `INSERT INTO lifecycle_emails (lead_id, event_type, email, template, send_at, status)
       VALUES ($1, $2, $3, $4, $5, 'scheduled')`,
      [leadId, event, email, emailTemplate, sendTime]
    );

    res.status(201).json({
      success: true,
      leadId,
      event,
      template: emailTemplate,
      scheduledFor: sendTime
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function reportCampaignPerformance(req, res) {
  const client = await pool.connect();
  try {
    const { campaignId } = req.body;

    if (!campaignId) {
      return res.status(400).json({ error: 'campaignId required' });
    }

    const result = await client.query(
      `SELECT COUNT(*) as sent, 
       SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opens,
       SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicks,
       SUM(CASE WHEN bounced = true THEN 1 ELSE 0 END) as bounces,
       SUM(CASE WHEN converted = true THEN 1 ELSE 0 END) as conversions
       FROM email_campaigns
       WHERE campaign_id = $1`,
      [campaignId]
    );

    const row = result.rows[0];
    const sent = parseInt(row.sent) || 0;
    const opens = parseInt(row.opens) || 0;
    const clicks = parseInt(row.clicks) || 0;
    const bounces = parseInt(row.bounces) || 0;
    const conversions = parseInt(row.conversions) || 0;

    const metrics = {
      sent,
      opens,
      clicks,
      bounces,
      conversions,
      openRate: (opens / Math.max(1, sent - bounces) * 100).toFixed(2),
      clickRate: (clicks / Math.max(1, sent - bounces) * 100).toFixed(2),
      bounceRate: (bounces / Math.max(1, sent) * 100).toFixed(2),
      conversionRate: (conversions / Math.max(1, clicks) * 100).toFixed(2)
    };

    await client.query(
      `INSERT INTO campaign_performance_reports (campaign_id, data, created_at)
       VALUES ($1, $2, NOW())`,
      [campaignId, JSON.stringify(metrics)]
    );

    res.status(200).json({
      success: true,
      campaignId,
      metrics
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}