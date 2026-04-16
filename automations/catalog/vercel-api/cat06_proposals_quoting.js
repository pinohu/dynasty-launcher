import express from 'express';
import { Pool } from '@neondatabase/serverless';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Email transporter (Acumbamail)
const mailer = nodemailer.createTransport({
  host: 'smtp.acumbamail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.ACUMBAMAIL_USER,
    pass: process.env.ACUMBAMAIL_PASS
  }
});

// 1. Create estimate with auto-population
router.post('/api/estimates', async (req, res) => {
  try {
    const { jobId, clientId } = req.body;

    // Get job details
    const jobResult = await pool.query(
      'SELECT * FROM jobs WHERE id = $1',
      [jobId]
    );
    const job = jobResult.rows[0];
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Calculate estimate
    const laborCost = (job.estimated_hours || 0) * (job.labor_rate || 75);
    const materialsCost = job.materials_cost || 0;
    const subtotal = laborCost + materialsCost;
    const taxes = subtotal * 0.08;
    const total = subtotal + taxes;

    // Insert estimate
    const result = await pool.query(
      `INSERT INTO estimates
       (job_id, client_id, labor_cost, materials_cost, taxes, total, status, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [jobId, clientId, laborCost, materialsCost, taxes, total, 'draft', new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)]
    );

    res.json({ success: true, estimate: result.rows[0] });
  } catch (error) {
    console.error('Estimate creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Generate multi-tier pricing
router.post('/api/estimates/:id/tiers', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM estimates WHERE id = $1',
      [id]
    );
    const estimate = result.rows[0];
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });

    const tiers = {
      good: {
        total: estimate.total,
        description: 'Standard service',
        tier: 'good'
      },
      better: {
        total: Math.round(estimate.total * 1.25 * 100) / 100,
        description: 'Premium with extras',
        tier: 'better'
      },
      best: {
        total: Math.round(estimate.total * 1.5 * 100) / 100,
        description: 'Full deluxe package',
        tier: 'best'
      }
    };

    // Update estimate with tiers
    await pool.query(
      'UPDATE estimates SET pricing_tiers = $1, status = $2 WHERE id = $3',
      [JSON.stringify(tiers), 'ready_to_send', id]
    );

    res.json({ success: true, tiers });
  } catch (error) {
    console.error('Tier generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Send estimate with tracking
router.post('/api/estimates/:id/send', async (req, res) => {
  try {
    const { id } = req.params;
    const trackingId = crypto.randomUUID();

    const estResult = await pool.query(
      'SELECT * FROM estimates WHERE id = $1',
      [id]
    );
    const estimate = estResult.rows[0];

    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [estimate.client_id]
    );
    const client = clientResult.rows[0];

    // Send email
    const viewLink = `${process.env.APP_URL}/estimates/${id}?token=${trackingId}`;
    await mailer.sendMail({
      to: client.email,
      subject: 'Your Estimate from Deputy',
      html: `
        <h2>Estimate Details</h2>
        <p>Service: ${estimate.service_type}</p>
        <p>Total: $${estimate.total.toFixed(2)}</p>
        <p><a href="${viewLink}">Review & Accept Estimate</a></p>
        <p>Expires: ${new Date(estimate.expires_at).toDateString()}</p>
      `
    });

    // Update estimate
    await pool.query(
      'UPDATE estimates SET status = $1, sent_at = NOW(), tracking_id = $2 WHERE id = $3',
      ['sent', trackingId, id]
    );

    res.json({ success: true, trackingId });
  } catch (error) {
    console.error('Send estimate error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Schedule follow-up sequence
router.post('/api/estimates/:id/schedule-followups', async (req, res) => {
  try {
    const { id } = req.params;
    const followUpDays = [2, 5, 10, 14];

    const result = await pool.query(
      'SELECT * FROM estimates WHERE id = $1',
      [id]
    );
    const estimate = result.rows[0];

    // Create follow-up tasks
    for (const days of followUpDays) {
      const followUpDate = new Date(estimate.sent_at);
      followUpDate.setDate(followUpDate.getDate() + days);

      await pool.query(
        `INSERT INTO estimate_followups
         (estimate_id, follow_up_days, scheduled_for, status)
         VALUES ($1, $2, $3, $4)`,
        [id, days, followUpDate, 'pending']
      );
    }

    res.json({ success: true, followUpsScheduled: followUpDays.length });
  } catch (error) {
    console.error('Follow-up scheduling error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Check and send follow-up emails
router.get('/api/estimates/followups/send', async (req, res) => {
  try {
    const now = new Date();

    const result = await pool.query(
      `SELECT ef.*, e.id as estimate_id, e.client_id, c.email
       FROM estimate_followups ef
       JOIN estimates e ON ef.estimate_id = e.id
       JOIN clients c ON e.client_id = c.id
       WHERE ef.scheduled_for <= $1 AND ef.status = $2`,
      [now, 'pending']
    );

    const followUps = result.rows;

    for (const followUp of followUps) {
      await mailer.sendMail({
        to: followUp.email,
        subject: `Gentle Reminder: Your Estimate (Day ${followUp.follow_up_days})`,
        html: `<p>Still interested in your estimate? Click <a href="${process.env.APP_URL}/estimates/${followUp.estimate_id}">here</a> to review.</p>`
      });

      await pool.query(
        'UPDATE estimate_followups SET status = $1, sent_at = NOW() WHERE id = $2',
        ['sent', followUp.id]
      );
    }

    res.json({ success: true, sent: followUps.length });
  } catch (error) {
    console.error('Follow-up send error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Check estimate expiry
router.get('/api/estimates/expiry/check', async (req, res) => {
  try {
    const fortyEightHours = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const result = await pool.query(
      `SELECT e.*, c.email FROM estimates e
       JOIN clients c ON e.client_id = c.id
       WHERE e.expires_at <= $1 AND e.expires_at > NOW() AND e.status = $2`,
      [fortyEightHours, 'sent']
    );

    const expiring = result.rows;

    for (const est of expiring) {
      await mailer.sendMail({
        to: est.email,
        subject: 'Your Estimate Expires in 48 Hours!',
        html: `<p>Your estimate will expire on ${new Date(est.expires_at).toDateString()}</p><p><a href="${process.env.APP_URL}/estimates/${est.id}">Accept Now</a></p>`
      });

      await pool.query(
        'UPDATE estimates SET expiry_reminder_sent = true WHERE id = $1',
        [est.id]
      );
    }

    res.json({ success: true, reminded: expiring.length });
  } catch (error) {
    console.error('Expiry check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 7. Handle estimate acceptance
router.post('/api/estimates/:id/accept', async (req, res) => {
  try {
    const { id } = req.params;

    const estResult = await pool.query(
      'SELECT * FROM estimates WHERE id = $1',
      [id]
    );
    const estimate = estResult.rows[0];

    // Update estimate status
    await pool.query(
      'UPDATE estimates SET status = $1, accepted_at = NOW() WHERE id = $2',
      ['accepted', id]
    );

    // Create job from estimate
    const jobResult = await pool.query(
      `INSERT INTO jobs
       (client_id, service_type, status, estimated_hours, labor_rate, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [estimate.client_id, estimate.service_type, 'confirmed', estimate.estimated_hours, estimate.labor_rate]
    );

    res.json({ success: true, job: jobResult.rows[0] });
  } catch (error) {
    console.error('Estimate acceptance error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8. Competitive price comparison
router.post('/api/estimates/:id/compare-pricing', async (req, res) => {
  try {
    const { id } = req.params;
    const { yourPrice } = req.body;

    // In production, pull from real competitor API
    const competitorData = {
      'plumbing': 350,
      'hvac': 500,
      'electrical': 400
    };

    const estResult = await pool.query(
      'SELECT service_type FROM estimates WHERE id = $1',
      [id]
    );
    const estimate = estResult.rows[0];

    const avgPrice = competitorData[estimate.service_type] || yourPrice;
    const percentile = Math.round((yourPrice / avgPrice) * 100);

    const alert = percentile > 120 ? 'pricing_high' :
                  percentile < 80 ? 'pricing_low' :
                  'pricing_competitive';

    // Log comparison
    await pool.query(
      `INSERT INTO pricing_comparisons
       (estimate_id, your_price, competitor_avg, percentile, alert_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, yourPrice, avgPrice, percentile, alert]
    );

    res.json({
      yourPrice,
      competitorAverage: avgPrice,
      percentile,
      alert
    });
  } catch (error) {
    console.error('Price comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 9. Convert estimate to invoice
router.post('/api/estimates/:id/convert-to-invoice', async (req, res) => {
  try {
    const { id } = req.params;

    const estResult = await pool.query(
      'SELECT * FROM estimates WHERE id = $1',
      [id]
    );
    const estimate = estResult.rows[0];

    // Create invoice
    const invoiceResult = await pool.query(
      `INSERT INTO invoices
       (job_id, client_id, amount, estimate_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [estimate.job_id, estimate.client_id, estimate.total, id, 'draft']
    );

    res.json({ success: true, invoice: invoiceResult.rows[0] });
  } catch (error) {
    console.error('Invoice conversion error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
