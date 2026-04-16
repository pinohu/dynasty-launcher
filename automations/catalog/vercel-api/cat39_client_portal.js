import { Pool } from '@neondatabase/serverless';
import crypto from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function sendResetEmail(email, token) {
  const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;
  return fetch('https://api.acumbamail.com/1/send_email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.ACUMBAMAIL_API_KEY}` },
    body: JSON.stringify({
      to: email,
      from: 'noreply@dynasty.app',
      subject: 'Reset Your Password',
      html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. Link expires in 24 hours.</p>`
    })
  });
}

async function getClientInvoices(clientId) {
  const result = await pool.query(
    'SELECT id, invoice_number, amount, status, due_date, created_at FROM invoices WHERE client_id = $1 ORDER BY created_at DESC LIMIT 100',
    [clientId]
  );
  return result.rows;
}

async function createClientAccount(clientData) {
  const { name, email, phone, companyId } = clientData;
  const result = await pool.query(
    'INSERT INTO clients (name, email, phone, company_id, status, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id, email, name',
    [name, email, phone, companyId, 'active']
  );
  return result.rows[0];
}

async function validateSSO(clientId, provider) {
  const result = await pool.query(
    'SELECT id, client_id, provider, client_secret, metadata FROM sso_integrations WHERE client_id = $1 AND provider = $2',
    [clientId, provider]
  );
  return result.rows[0];
}

async function getClientDocuments(clientId) {
  const result = await pool.query(
    'SELECT id, file_name, file_path, file_type, uploaded_at, size_bytes FROM client_documents WHERE client_id = $1 ORDER BY uploaded_at DESC LIMIT 500',
    [clientId]
  );
  return result.rows;
}

async function getServiceHistory(clientId) {
  const result = await pool.query(
    `SELECT s.id, s.name, s.description, cs.date_completed, cs.status, cs.notes
     FROM services s
     JOIN client_services cs ON s.id = cs.service_id
     WHERE cs.client_id = $1
     ORDER BY cs.date_completed DESC LIMIT 100`,
    [clientId]
  );
  return result.rows;
}

async function createSupportTicket(clientId, subject, description) {
  const ticketId = crypto.randomUUID();
  const result = await pool.query(
    'INSERT INTO support_tickets (id, client_id, subject, description, status, priority, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *',
    [ticketId, clientId, subject, description, 'open', 'medium']
  );
  return result.rows[0];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, userId, clientId, email, name, phone, companyId, provider, subject, description } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Missing action parameter' });
    }

    let response;

    switch (action) {
      case 'password_reset':
        if (!userId || !email) {
          return res.status(400).json({ error: 'Missing userId or email' });
        }
        const resetToken = crypto.randomBytes(32).toString('hex');
        await pool.query(
          'UPDATE users SET password_reset_token = $1, password_reset_expires = NOW() + INTERVAL \'24 hours\' WHERE id = $2',
          [resetToken, userId]
        );
        await sendResetEmail(email, resetToken);
        response = { success: true, message: 'Password reset email sent' };
        break;

      case 'invoice_view':
        if (!clientId) {
          return res.status(400).json({ error: 'Missing clientId' });
        }
        const invoices = await getClientInvoices(clientId);
        response = { success: true, invoices };
        break;

      case 'account_provision':
        if (!name || !email || !companyId) {
          return res.status(400).json({ error: 'Missing required client fields' });
        }
        const newClient = await createClientAccount({ name, email, phone, companyId });
        await sendResetEmail(newClient.email, crypto.randomBytes(32).toString('hex'));
        response = { success: true, client: newClient, message: 'Client account created and email sent' };
        break;

      case 'validate_sso':
        if (!clientId || !provider) {
          return res.status(400).json({ error: 'Missing clientId or provider' });
        }
        const ssoConfig = await validateSSO(clientId, provider);
        if (!ssoConfig) {
          return res.status(404).json({ error: 'SSO integration not found' });
        }
        response = { success: true, ssoConfigured: true, provider };
        break;

      case 'get_documents':
        if (!clientId) {
          return res.status(400).json({ error: 'Missing clientId' });
        }
        const documents = await getClientDocuments(clientId);
        response = { success: true, documents, count: documents.length };
        break;

      case 'service_history':
        if (!clientId) {
          return res.status(400).json({ error: 'Missing clientId' });
        }
        const history = await getServiceHistory(clientId);
        response = { success: true, services: history, count: history.length };
        break;

      case 'submit_ticket':
        if (!clientId || !subject || !description) {
          return res.status(400).json({ error: 'Missing required ticket fields' });
        }
        const ticket = await createSupportTicket(clientId, subject, description);
        response = { success: true, ticket, message: 'Support ticket created' };
        break;

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Portal error:', error);
    return res.status(500).json({
      error: 'Portal action failed',
      message: error.message,
      action: req.body?.action
    });
  }
}
