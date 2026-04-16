import { Router } from 'express';
import { pool } from '../db/pool.js';
import { logger } from '../logger.js';
import { sendEmail } from '../integrations/acumbamail.js';
import { sendSMS } from '../integrations/sms-it.js';
import { Stripe } from 'stripe';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 1. Service Start Notification - Tech en route + ETA to client
router.post('/start-notification', async (req, res) => {
  try {
    const { jobId, techId, clientId, eta } = req.body;
    logger.info('Service start notification', { jobId, techId, clientId, eta });

    const jobResult = await pool.query(
      'SELECT * FROM jobs WHERE id = $1',
      [jobId]
    );
    if (jobResult.rows.length === 0) throw new Error('Job not found');
    const job = jobResult.rows[0];

    const clientResult = await pool.query(
      'SELECT email, phone, first_name FROM users WHERE id = $1',
      [clientId]
    );
    if (clientResult.rows.length === 0) throw new Error('Client not found');
    const client = clientResult.rows[0];

    const techResult = await pool.query(
      'SELECT first_name, phone FROM users WHERE id = $1',
      [techId]
    );
    const tech = techResult.rows[0];

    // Update job status
    await pool.query(
      'UPDATE jobs SET status = $1, tech_id = $2, eta = $3, updated_at = NOW() WHERE id = $4',
      ['in_progress', techId, eta, jobId]
    );

    // Send SMS to client
    const etaTime = new Date(eta).toLocaleTimeString();
    await sendSMS(
      client.phone,
      `Hi ${client.first_name}! ${tech.first_name} is on the way. ETA: ${etaTime}. Tech contact: ${tech.phone}`
    );

    // Send email notification
    await sendEmail({
      to: client.email,
      subject: `Service Technician En Route - ETA ${etaTime}`,
      template: 'service_start_notification',
      data: {
        clientName: client.first_name,
        techName: tech.first_name,
        eta: etaTime,
        jobService: job.service_type
      }
    });

    // Log activity
    await pool.query(
      'INSERT INTO activity_log (job_id, action, details) VALUES ($1, $2, $3)',
      [jobId, 'SERVICE_STARTED', JSON.stringify({ techId, eta })]
    );

    res.json({
      success: true,
      message: 'Service start notification sent',
      job: { id: jobId, status: 'in_progress', eta }
    });
  } catch (error) {
    logger.error('Start notification error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Progress Photo Sharing
router.post('/progress-photo', async (req, res) => {
  try {
    const { jobId, photoUrl, caption } = req.body;
    logger.info('Progress photo upload', { jobId, caption });

    const photoResult = await pool.query(
      'INSERT INTO job_photos (job_id, url, caption, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id',
      [jobId, photoUrl, caption]
    );

    const jobResult = await pool.query(
      'SELECT client_id FROM jobs WHERE id = $1',
      [jobId]
    );
    const clientId = jobResult.rows[0].client_id;

    const clientResult = await pool.query(
      'SELECT email, first_name FROM users WHERE id = $1',
      [clientId]
    );
    const client = clientResult.rows[0];

    // Notify client
    await sendEmail({
      to: client.email,
      subject: 'Progress Update on Your Service',
      template: 'progress_photo',
      data: {
        clientName: client.first_name,
        photoUrl,
        caption,
        portalLink: `https://app.deputy.com/jobs/${jobId}`
      }
    });

    res.json({
      success: true,
      photoId: photoResult.rows[0].id,
      message: 'Progress photo shared with client'
    });
  } catch (error) {
    logger.error('Progress photo error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Deliverable Upload Handler
router.post('/deliverable', async (req, res) => {
  try {
    const { jobId, fileUrl, fileName } = req.body;
    logger.info('Deliverable upload', { jobId, fileName });

    const result = await pool.query(
      'INSERT INTO deliverables (job_id, file_url, file_name, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id',
      [jobId, fileUrl, fileName]
    );

    const jobResult = await pool.query(
      'SELECT client_id FROM jobs WHERE id = $1',
      [jobId]
    );
    const clientId = jobResult.rows[0].client_id;

    const clientResult = await pool.query(
      'SELECT email, first_name FROM users WHERE id = $1',
      [clientId]
    );
    const client = clientResult.rows[0];

    // Notify client
    await sendEmail({
      to: client.email,
      subject: `Deliverable Ready: ${fileName}`,
      template: 'deliverable_ready',
      data: {
        clientName: client.first_name,
        fileName,
        downloadLink: fileUrl
      }
    });

    res.json({
      success: true,
      deliverableId: result.rows[0].id,
      message: 'Deliverable uploaded and client notified'
    });
  } catch (error) {
    logger.error('Deliverable upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Quality Checklist Enforcement
router.post('/quality-checklist', async (req, res) => {
  try {
    const { jobId, items } = req.body;
    logger.info('Quality checklist validation', { jobId });

    const jobResult = await pool.query(
      'SELECT status FROM jobs WHERE id = $1',
      [jobId]
    );
    const job = jobResult.rows[0];

    const allComplete = items.every(item => item.completed === true);

    if (!allComplete) {
      return res.status(400).json({
        success: false,
        message: 'Quality checklist incomplete',
        incompleteItems: items.filter(i => !i.completed)
      });
    }

    // Save checklist
    await pool.query(
      'INSERT INTO quality_checklists (job_id, items, completed_at) VALUES ($1, $2, NOW())',
      [jobId, JSON.stringify(items)]
    );

    res.json({
      success: true,
      message: 'Quality checklist complete - job ready for completion'
    });
  } catch (error) {
    logger.error('Quality checklist error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Completion Certificate Generator
router.post('/completion-certificate', async (req, res) => {
  try {
    const { jobId, clientId } = req.body;
    logger.info('Generating completion certificate', { jobId });

    const jobResult = await pool.query(
      'SELECT * FROM jobs WHERE id = $1',
      [jobId]
    );
    const job = jobResult.rows[0];

    const clientResult = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [clientId]
    );
    const client = clientResult.rows[0];

    // Generate certificate content
    const certificateContent = `
      Certificate of Completion
      
      This certifies that the following service has been completed:
      Service: ${job.service_type}
      Date: ${new Date(job.completed_at).toLocaleDateString()}
      Client: ${client.first_name} ${client.last_name}
      
      Quality Assured and Completed by Deputy Service Network
    `;

    // Generate PDF (simplified - would use pdfkit in production)
    const certResult = await pool.query(
      'INSERT INTO certificates (job_id, content, generated_at) VALUES ($1, $2, NOW()) RETURNING id',
      [jobId, certificateContent]
    );

    // Email certificate
    await sendEmail({
      to: client.email,
      subject: 'Service Completion Certificate',
      template: 'completion_certificate',
      data: {
        clientName: client.first_name,
        jobService: job.service_type,
        completionDate: new Date(job.completed_at).toLocaleDateString()
      }
    });

    res.json({
      success: true,
      certificateId: certResult.rows[0].id,
      message: 'Certificate generated and emailed'
    });
  } catch (error) {
    logger.error('Certificate generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Post-Service Survey Automation
router.post('/survey', async (req, res) => {
  try {
    const { jobId, clientId, techId } = req.body;
    logger.info('Sending post-service survey', { jobId, clientId });

    const clientResult = await pool.query(
      'SELECT email, first_name FROM users WHERE id = $1',
      [clientId]
    );
    const client = clientResult.rows[0];

    const surveyLink = `https://survey.deputy.com/job/${jobId}/client`;

    await sendEmail({
      to: client.email,
      subject: 'How was your service experience?',
      template: 'post_service_survey',
      data: {
        clientName: client.first_name,
        surveyLink
      }
    });

    // Log survey sent
    await pool.query(
      'INSERT INTO surveys (job_id, client_id, sent_at) VALUES ($1, $2, NOW())',
      [jobId, clientId]
    );

    res.json({
      success: true,
      message: 'Survey sent to client'
    });
  } catch (error) {
    logger.error('Survey error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 7. SLA Tracking and Breach Alerting
router.post('/sla-check', async (req, res) => {
  try {
    const { jobId } = req.body;
    logger.info('SLA tracking check', { jobId });

    const jobResult = await pool.query(
      'SELECT * FROM jobs WHERE id = $1',
      [jobId]
    );
    const job = jobResult.rows[0];

    const slaResult = await pool.query(
      'SELECT sla_hours FROM service_types WHERE id = $1',
      [job.service_type_id]
    );
    const slaHours = slaResult.rows[0].sla_hours;

    const createdTime = new Date(job.created_at);
    const elapsedHours = (Date.now() - createdTime.getTime()) / (1000 * 60 * 60);

    let slaStatus = 'on_track';
    if (elapsedHours > slaHours) {
      slaStatus = 'breached';
      // Alert manager
      logger.warn('SLA breach detected', { jobId, slaHours, elapsedHours });
    } else if (elapsedHours > slaHours * 0.8) {
      slaStatus = 'at_risk';
    }

    await pool.query(
      'UPDATE jobs SET sla_status = $1 WHERE id = $2',
      [slaStatus, jobId]
    );

    res.json({
      success: true,
      slaStatus,
      elapsedHours: elapsedHours.toFixed(2),
      slaHours
    });
  } catch (error) {
    logger.error('SLA check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8. Revision Request Handler
router.post('/revision-request', async (req, res) => {
  try {
    const { jobId, clientId, revisionDetails } = req.body;
    logger.info('Revision request received', { jobId, clientId });

    const revisionResult = await pool.query(
      'INSERT INTO revisions (job_id, client_id, details, status, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id',
      [jobId, clientId, JSON.stringify(revisionDetails), 'pending']
    );

    // Route to tech
    const jobResult = await pool.query(
      'SELECT tech_id FROM jobs WHERE id = $1',
      [jobId]
    );
    const techId = jobResult.rows[0].tech_id;

    const techResult = await pool.query(
      'SELECT email FROM users WHERE id = $1',
      [techId]
    );

    await sendEmail({
      to: techResult.rows[0].email,
      subject: 'Revision Request for Completed Job',
      template: 'revision_request',
      data: {
        jobId,
        revisionDetails,
        revisionLink: `https://app.deputy.com/revisions/${revisionResult.rows[0].id}`
      }
    });

    res.json({
      success: true,
      revisionId: revisionResult.rows[0].id,
      message: 'Revision request sent to technician'
    });
  } catch (error) {
    logger.error('Revision request error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 9. Hours/Utilization Tracking per Job
router.post('/hours-tracking', async (req, res) => {
  try {
    const { jobId, techId, hours } = req.body;
    logger.info('Hours tracking', { jobId, techId, hours });

    const result = await pool.query(
      'INSERT INTO tech_hours (job_id, tech_id, hours, logged_at) VALUES ($1, $2, $3, NOW()) RETURNING id',
      [jobId, techId, hours]
    );

    // Update tech utilization
    const utilizationResult = await pool.query(
      'SELECT SUM(hours) as total_hours FROM tech_hours WHERE tech_id = $1 AND logged_at >= NOW() - INTERVAL \'7 days\'',
      [techId]
    );

    const totalHours = utilizationResult.rows[0].total_hours || 0;

    res.json({
      success: true,
      hoursLogId: result.rows[0].id,
      weeklyUtilization: totalHours.toFixed(2),
      message: 'Hours logged successfully'
    });
  } catch (error) {
    logger.error('Hours tracking error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 10. Quality Scoring Automation
router.post('/quality-score', async (req, res) => {
  try {
    const { jobId, techId, metrics } = req.body;
    logger.info('Quality scoring', { jobId, techId });

    // Calculate score (0-100)
    let score = 100;
    if (metrics.completenessRating) score -= (100 - metrics.completenessRating) * 0.3;
    if (metrics.timelinessRating) score -= (100 - metrics.timelinessRating) * 0.25;
    if (metrics.professionalismRating) score -= (100 - metrics.professionalismRating) * 0.25;
    if (metrics.clientSatisfaction) score -= (100 - metrics.clientSatisfaction) * 0.2;

    const result = await pool.query(
      'INSERT INTO quality_scores (job_id, tech_id, score, metrics, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id',
      [jobId, techId, Math.max(0, score), JSON.stringify(metrics)]
    );

    // Update tech average score
    const avgResult = await pool.query(
      'SELECT AVG(score) as avg_score FROM quality_scores WHERE tech_id = $1',
      [techId]
    );

    const avgScore = avgResult.rows[0].avg_score || 0;

    res.json({
      success: true,
      scoreId: result.rows[0].id,
      jobScore: Math.round(score),
      techAverageScore: Math.round(avgScore),
      message: 'Quality score calculated'
    });
  } catch (error) {
    logger.error('Quality scoring error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
