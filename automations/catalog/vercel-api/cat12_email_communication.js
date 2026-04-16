import { Router } from 'express';
import { pool } from '../db/pool.js';
import { logger } from '../logger.js';
import { AcumbamailClient } from '../integrations/acumbamail.js';

const router = Router();
const acumbamail = new AcumbamailClient(process.env.ACUMBAMAIL_API_KEY);

// 1. Transactional Email Engine
router.post('/transactional', async (req, res) => {
  try {
    const { recipient, emailType, data } = req.body;
    logger.info('Sending transactional email', { recipient, emailType });

    const emailTemplates = {
      receipt: {
        subject: `Receipt for ${data.orderNumber}`,
        html: `<h2>Thank you for your order</h2><p>Order: ${data.orderNumber}</p><p>Amount: $${data.amount}</p>`
      },
      confirmation: {
        subject: `Appointment Confirmed - ${data.serviceName}`,
        html: `<h2>Your appointment is confirmed</h2><p>Date: ${data.dateTime}</p><p>Service: ${data.serviceName}</p>`
      },
      status_update: {
        subject: `Update: ${data.status}`,
        html: `<h2>Job Status Update</h2><p>Job ID: ${data.jobId}</p><p>Status: ${data.status}</p>`
      }
    };

    const template = emailTemplates[emailType];
    if (!template) throw new Error(`Unknown email type: ${emailType}`);

    // Send via Acumbamail
    const result = await acumbamail.sendTransactional({
      to: recipient,
      subject: template.subject,
      html: template.html
    });

    // Log email
    const logResult = await pool.query(
      'INSERT INTO emails (recipient, type, subject, status, external_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [recipient, emailType, template.subject, 'sent', result.id]
    );

    res.json({
      success: true,
      emailId: logResult.rows[0].id,
      externalId: result.id,
      message: 'Transactional email sent'
    });
  } catch (error) {
    logger.error('Transactional email error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Email Template Management System
router.post('/templates', async (req, res) => {
  try {
    const { templateName, action, templateContent, subject } = req.body;
    logger.info('Template management', { templateName, action });

    if (action === 'create' || action === 'update') {
      const result = await pool.query(
        'INSERT INTO email_templates (name, subject, content, version, created_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (name) DO UPDATE SET content = $3, subject = $2, version = version + 1 RETURNING *',
        [templateName, subject, templateContent, 1]
      );

      // Version tracking
      await pool.query(
        'INSERT INTO template_versions (template_id, version, content) VALUES ($1, $2, $3)',
        [result.rows[0].id, result.rows[0].version, templateContent]
      );

      res.json({
        success: true,
        templateId: result.rows[0].id,
        version: result.rows[0].version,
        message: `Template ${action}d successfully`
      });
    } else if (action === 'list') {
      const result = await pool.query('SELECT id, name, version, created_at FROM email_templates');
      res.json({
        success: true,
        templates: result.rows
      });
    } else if (action === 'get') {
      const result = await pool.query(
        'SELECT * FROM email_templates WHERE name = $1',
        [templateName]
      );
      res.json({
        success: true,
        template: result.rows[0]
      });
    }
  } catch (error) {
    logger.error('Template management error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Open/Click Tracking Aggregator
router.post('/tracking', async (req, res) => {
  try {
    const { emailId, event } = req.body;
    logger.info('Tracking event', { emailId, event });

    const trackingResult = await pool.query(
      'INSERT INTO email_tracking (email_id, event_type, timestamp) VALUES ($1, $2, NOW()) RETURNING id',
      [emailId, event]
    );

    // Aggregate stats for email
    const statsResult = await pool.query(
      'SELECT event_type, COUNT(*) as count FROM email_tracking WHERE email_id = $1 GROUP BY event_type',
      [emailId]
    );

    const stats = {};
    statsResult.rows.forEach(row => {
      stats[row.event_type] = row.count;
    });

    res.json({
      success: true,
      trackingId: trackingResult.rows[0].id,
      currentStats: stats,
      message: 'Tracking event logged'
    });
  } catch (error) {
    logger.error('Tracking error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. CRM Activity Logging
router.post('/crm-activity', async (req, res) => {
  try {
    const { contactId, emailId } = req.body;
    logger.info('CRM activity logging', { contactId, emailId });

    const emailResult = await pool.query(
      'SELECT subject, type FROM emails WHERE id = $1',
      [emailId]
    );

    if (emailResult.rows.length === 0) throw new Error('Email not found');
    const email = emailResult.rows[0];

    // Log to contact timeline
    const activityResult = await pool.query(
      'INSERT INTO contact_activities (contact_id, activity_type, description, related_email_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [contactId, 'EMAIL', `Email sent: ${email.subject}`, emailId]
    );

    res.json({
      success: true,
      activityId: activityResult.rows[0].id,
      message: 'Activity logged to CRM'
    });
  } catch (error) {
    logger.error('CRM activity error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Bounce Handling and List Hygiene
router.post('/bounce-handling', async (req, res) => {
  try {
    const { email, bounceType } = req.body;
    logger.info('Bounce handling', { email, bounceType });

    let action = 'flagged';
    if (bounceType === 'permanent') {
      // Remove from mailing lists
      await pool.query(
        'UPDATE contacts SET bounce_status = $1, suppressed = true WHERE email = $2',
        ['permanent', email]
      );
      action = 'suppressed';
    } else if (bounceType === 'temporary') {
      await pool.query(
        'UPDATE contacts SET bounce_status = $1 WHERE email = $2',
        ['temporary', email]
      );
    }

    // Log bounce
    const logResult = await pool.query(
      'INSERT INTO bounce_log (email, bounce_type, action, logged_at) VALUES ($1, $2, $3, NOW()) RETURNING id',
      [email, bounceType, action]
    );

    res.json({
      success: true,
      bounceId: logResult.rows[0].id,
      action,
      message: 'Bounce processed'
    });
  } catch (error) {
    logger.error('Bounce handling error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Email Signature Standardization
router.post('/signature', async (req, res) => {
  try {
    const { userId, emailContent } = req.body;
    logger.info('Applying email signature', { userId });

    const userResult = await pool.query(
      'SELECT full_name, title, company, phone FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) throw new Error('User not found');
    const user = userResult.rows[0];

    const signature = `
<br/>
<div style="font-family: Arial, sans-serif; font-size: 12px; color: #333;">
  <strong>${user.full_name}</strong><br/>
  ${user.title}<br/>
  ${user.company}<br/>
  ${user.phone}<br/>
  <a href="https://deputy.com">Deputy Platform</a>
</div>
    `;

    const signedContent = emailContent + signature;

    res.json({
      success: true,
      signedContent,
      message: 'Signature applied'
    });
  } catch (error) {
    logger.error('Signature error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 7. Scheduled Send Queue
router.post('/scheduled-send', async (req, res) => {
  try {
    const { emailId, sendTime } = req.body;
    logger.info('Scheduling email send', { emailId, sendTime });

    const result = await pool.query(
      'INSERT INTO scheduled_sends (email_id, scheduled_for, status) VALUES ($1, $2, $3) RETURNING id',
      [emailId, sendTime, 'queued']
    );

    // For batch throttling, could add to queue processor here
    res.json({
      success: true,
      scheduledSendId: result.rows[0].id,
      message: `Email scheduled for ${new Date(sendTime).toLocaleString()}`
    });
  } catch (error) {
    logger.error('Scheduled send error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8. Thread Summarization
router.post('/thread-summarize', async (req, res) => {
  try {
    const { threadId } = req.body;
    logger.info('Summarizing email thread', { threadId });

    // Get all emails in thread
    const emailsResult = await pool.query(
      'SELECT subject, body, sender, created_at FROM emails WHERE thread_id = $1 ORDER BY created_at',
      [threadId]
    );

    if (emailsResult.rows.length === 0) throw new Error('Thread not found');

    // Simple AI summarization (in production, use actual AI/LLM)
    const emailTexts = emailsResult.rows.map(e => `${e.sender}: ${e.body}`).join('\n\n');
    const summary = `Thread Summary: ${emailTexts.substring(0, 200)}...`;

    // Store summary
    const resultResult = await pool.query(
      'INSERT INTO thread_summaries (thread_id, summary) VALUES ($1, $2) RETURNING id',
      [threadId, summary]
    );

    res.json({
      success: true,
      summaryId: resultResult.rows[0].id,
      summary,
      emailCount: emailsResult.rows.length,
      message: 'Thread summarized'
    });
  } catch (error) {
    logger.error('Thread summarization error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
