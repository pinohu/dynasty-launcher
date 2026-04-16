import express from 'express';
import { Pool } from '@neondatabase/serverless';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const mailer = nodemailer.createTransport({
  host: 'smtp.acumbamail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.ACUMBAMAIL_USER,
    pass: process.env.ACUMBAMAIL_PASS
  }
});

// 1. Send welcome packet
router.post('/api/onboarding/:clientId/send-welcome', async (req, res) => {
  try {
    const { clientId } = req.params;

    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [clientId]
    );
    const client = clientResult.rows[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });

    // Get onboarding documents
    const docsResult = await pool.query(
      'SELECT * FROM onboarding_documents WHERE service_type = $1',
      [client.service_type]
    );

    const packet = {
      documents: docsResult.rows.map(d => ({
        ...d,
        url: `${process.env.APP_URL}/documents/${d.id}`
      })),
      importantLinks: [
        { name: 'Client Portal', url: `${process.env.APP_URL}/portal` },
        { name: 'Knowledge Base', url: `${process.env.APP_URL}/help` }
      ]
    };

    // Send email
    await mailer.sendMail({
      to: client.email,
      subject: `Welcome to Deputy, ${client.name}!`,
      html: `
        <h2>Welcome ${client.name}!</h2>
        <p>We're excited to get started with you.</p>
        <h3>Important Documents</h3>
        <ul>${docsResult.rows.map(d => `<li><a href="${process.env.APP_URL}/documents/${d.id}">${d.title}</a></li>`).join('')}</ul>
        <h3>Useful Links</h3>
        <ul>
          <li><a href="${process.env.APP_URL}/portal">Client Portal</a></li>
          <li><a href="${process.env.APP_URL}/help">Help Center</a></li>
        </ul>
      `
    });

    // Log onboarding start
    await pool.query(
      `INSERT INTO onboarding_progress
       (client_id, step, completed, completed_at)
       VALUES ($1, $2, $3, NOW())`,
      [clientId, 'welcome_sent', true]
    );

    res.json({ success: true, documentCount: docsResult.rows.length });
  } catch (error) {
    console.error('Welcome packet error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Generate onboarding checklist
router.post('/api/onboarding/:clientId/generate-checklist', async (req, res) => {
  try {
    const { clientId } = req.params;

    const clientResult = await pool.query(
      'SELECT service_type FROM clients WHERE id = $1',
      [clientId]
    );
    const client = clientResult.rows[0];

    const templateResult = await pool.query(
      'SELECT * FROM checklist_templates WHERE service_type = $1',
      [client.service_type]
    );
    const template = templateResult.rows[0];

    const items = (template?.items || []).map(item => ({
      id: crypto.randomUUID(),
      title: item.title,
      description: item.description,
      dueDate: new Date(Date.now() + (item.daysUntilDue || 14) * 24 * 60 * 60 * 1000),
      completed: false,
      completedAt: null
    }));

    // Save checklist
    const result = await pool.query(
      `INSERT INTO onboarding_checklists
       (client_id, items, created_at)
       VALUES ($1, $2, NOW())
       RETURNING *`,
      [clientId, JSON.stringify(items)]
    );

    res.json({ success: true, checklist: result.rows[0] });
  } catch (error) {
    console.error('Checklist generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Request documents
router.post('/api/onboarding/:clientId/request-documents', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { requiredDocuments } = req.body;

    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [clientId]
    );
    const client = clientResult.rows[0];

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 5);

    // Create request
    const result = await pool.query(
      `INSERT INTO document_requests
       (client_id, documents, status, due_date, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [clientId, JSON.stringify(requiredDocuments), 'pending', dueDate]
    );

    // Send email
    await mailer.sendMail({
      to: client.email,
      subject: 'Please Submit Your Documents',
      html: `
        <p>To complete your onboarding, please submit the following documents by ${dueDate.toDateString()}:</p>
        <ul>${requiredDocuments.map(d => `<li>${d}</li>`).join('')}</ul>
        <p><a href="${process.env.APP_URL}/upload-documents">Upload Documents</a></p>
      `
    });

    res.json({ success: true, requestId: result.rows[0].id });
  } catch (error) {
    console.error('Document request error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Provision client portal account
router.post('/api/onboarding/:clientId/provision-portal', async (req, res) => {
  try {
    const { clientId } = req.params;

    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [clientId]
    );
    const client = clientResult.rows[0];

    const tempPassword = crypto.randomBytes(12).toString('hex');

    // Create portal user
    const result = await pool.query(
      `INSERT INTO portal_users
       (client_id, email, role, temp_password, password_expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, email, role`,
      [clientId, client.email, 'client', tempPassword, new Date(Date.now() + 24 * 60 * 60 * 1000)]
    );

    // Send credentials
    await mailer.sendMail({
      to: client.email,
      subject: 'Your Client Portal Account',
      html: `
        <h2>Portal Access</h2>
        <p>Your account has been created!</p>
        <p><strong>Email:</strong> ${client.email}</p>
        <p><strong>Temporary Password:</strong> ${tempPassword}</p>
        <p><a href="${process.env.APP_URL}/portal/login">Login to Portal</a></p>
        <p>You will be prompted to change your password on first login.</p>
      `
    });

    res.json({ success: true, userId: result.rows[0].id });
  } catch (error) {
    console.error('Portal provisioning error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Send team introduction emails
router.post('/api/onboarding/:clientId/send-team-intro', async (req, res) => {
  try {
    const { clientId } = req.params;

    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [clientId]
    );
    const client = clientResult.rows[0];

    // Get assigned team members
    const teamResult = await pool.query(
      `SELECT * FROM team_assignments
       WHERE client_id = $1
       ORDER BY role ASC`,
      [clientId]
    );

    const team = teamResult.rows;

    // Send introduction email
    await mailer.sendMail({
      to: client.email,
      subject: 'Meet Your Dedicated Team',
      html: `
        <h2>Your Team</h2>
        <p>Here are the dedicated team members assigned to your account:</p>
        <ul>
          ${team.map(member => `
            <li>
              <strong>${member.name}</strong> (${member.role})
              <br/>Email: ${member.email}
              <br/>Phone: ${member.phone || 'N/A'}
            </li>
          `).join('')}
        </ul>
      `
    });

    res.json({ success: true, teamCount: team.length });
  } catch (error) {
    console.error('Team intro error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Set service expectations
router.post('/api/onboarding/:clientId/set-expectations', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { timeline, milestones, communicationPlan } = req.body;

    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [clientId]
    );
    const client = clientResult.rows[0];

    // Save expectations
    await pool.query(
      `INSERT INTO service_expectations
       (client_id, timeline, milestones, communication_plan, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [clientId, JSON.stringify(timeline), JSON.stringify(milestones), communicationPlan]
    );

    // Send email
    await mailer.sendMail({
      to: client.email,
      subject: 'What to Expect: Your Service Plan',
      html: `
        <h2>Your Service Timeline</h2>
        <p>${timeline}</p>
        <h2>Key Milestones</h2>
        <ul>${milestones.map(m => `<li>${m}</li>`).join('')}</ul>
        <h2>Communication Plan</h2>
        <p>${communicationPlan}</p>
      `
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Expectations error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 7. Schedule first appointment
router.post('/api/onboarding/:clientId/schedule-first-appointment', async (req, res) => {
  try {
    const { clientId } = req.params;

    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [clientId]
    );
    const client = clientResult.rows[0];

    // Create appointment slot
    const appointmentDate = new Date();
    appointmentDate.setDate(appointmentDate.getDate() + 3);
    appointmentDate.setHours(10, 0, 0, 0);

    const result = await pool.query(
      `INSERT INTO appointments
       (client_id, title, description, start_time, duration, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [
        clientId,
        'Initial Consultation',
        'Welcome call to discuss your service',
        appointmentDate,
        60,
        'confirmed'
      ]
    );

    // Send confirmation
    await mailer.sendMail({
      to: client.email,
      subject: 'Your First Appointment Scheduled',
      html: `
        <h2>Appointment Confirmed</h2>
        <p><strong>Date:</strong> ${appointmentDate.toDateString()}</p>
        <p><strong>Time:</strong> ${appointmentDate.toLocaleTimeString()}</p>
        <p><strong>Duration:</strong> 60 minutes</p>
        <p><a href="${process.env.APP_URL}/appointments/${result.rows[0].id}">View Details</a></p>
      `
    });

    res.json({ success: true, appointmentId: result.rows[0].id });
  } catch (error) {
    console.error('Appointment scheduling error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8. 30-day check-in
router.post('/api/onboarding/:clientId/30-day-checkin', async (req, res) => {
  try {
    const { clientId } = req.params;

    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [clientId]
    );
    const client = clientResult.rows[0];

    await mailer.sendMail({
      to: client.email,
      subject: 'How Are We Doing? 30-Day Check-In',
      html: `
        <h2>Quick Check-In</h2>
        <p>We wanted to touch base and see how things are going!</p>
        <p><a href="${process.env.APP_URL}/feedback/30-day">Share Your Feedback</a></p>
      `
    });

    await pool.query(
      `INSERT INTO onboarding_progress
       (client_id, step, completed, completed_at)
       VALUES ($1, $2, $3, NOW())`,
      [clientId, '30_day_checkin_sent', true]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 9. Mark onboarding complete
router.post('/api/onboarding/:clientId/complete', async (req, res) => {
  try {
    const { clientId } = req.params;

    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [clientId]
    );
    const client = clientResult.rows[0];

    // Update client status
    await pool.query(
      'UPDATE clients SET onboarding_completed = true, onboarding_completed_at = NOW() WHERE id = $1',
      [clientId]
    );

    // Send celebration email
    await mailer.sendMail({
      to: client.email,
      subject: 'Welcome Aboard!',
      html: `
        <h2>You're All Set!</h2>
        <p>Your onboarding is complete. We're ready to get started.</p>
        <p>Questions? Contact your dedicated team or visit our help center.</p>
      `
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Completion error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 10. Send onboarding NPS survey
router.post('/api/onboarding/:clientId/send-nps', async (req, res) => {
  try {
    const { clientId } = req.params;

    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [clientId]
    );
    const client = clientResult.rows[0];

    const surveyLink = `${process.env.APP_URL}/survey/nps?clientId=${clientId}&token=${crypto.randomUUID()}`;

    await mailer.sendMail({
      to: client.email,
      subject: 'How Was Your Onboarding Experience?',
      html: `
        <h2>Quick Survey</h2>
        <p>Your feedback helps us improve! Take 2 minutes to rate your onboarding experience.</p>
        <p><a href="${surveyLink}">Take Survey</a></p>
      `
    });

    await pool.query(
      `INSERT INTO onboarding_progress
       (client_id, step, completed, completed_at)
       VALUES ($1, $2, $3, NOW())`,
      [clientId, 'nps_survey_sent', true]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('NPS survey error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
