import express from 'express';
import { Pool } from '@neondatabase/serverless';
import nodemailer from 'nodemailer';
import axios from 'axios';

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Email transporter
const mailer = nodemailer.createTransport({
  host: 'smtp.acumbamail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.ACUMBAMAIL_USER,
    pass: process.env.ACUMBAMAIL_PASS
  }
});

// 1. Generate contract from template
router.post('/api/contracts/generate', async (req, res) => {
  try {
    const { clientId, serviceType, estimateId } = req.body;

    // Get client
    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [clientId]
    );
    const client = clientResult.rows[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });

    // Get template
    const templateResult = await pool.query(
      'SELECT * FROM contract_templates WHERE service_type = $1',
      [serviceType]
    );
    const template = templateResult.rows[0];

    // Populate template
    let content = template.content
      .replace(/{{CLIENT_NAME}}/g, client.name)
      .replace(/{{SERVICE_TYPE}}/g, serviceType)
      .replace(/{{SERVICE_DESCRIPTION}}/g, client.service_description || '')
      .replace(/{{DATE}}/g, new Date().toLocaleDateString());

    // Create contract
    const result = await pool.query(
      `INSERT INTO contracts
       (client_id, service_type, estimate_id, content, version, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [clientId, serviceType, estimateId, content, 1, 'draft']
    );

    res.json({ success: true, contract: result.rows[0] });
  } catch (error) {
    console.error('Contract generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Send for e-signature
router.post('/api/contracts/:id/send-signature', async (req, res) => {
  try {
    const { id } = req.params;

    const contractResult = await pool.query(
      'SELECT * FROM contracts WHERE id = $1',
      [id]
    );
    const contract = contractResult.rows[0];

    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [contract.client_id]
    );
    const client = clientResult.rows[0];

    // Send via HelloSign API
    const response = await axios.post(
      'https://api.hellosign.com/v3/signature_request/send',
      {
        title: `${contract.service_type} Service Agreement`,
        subject: 'Please sign your service agreement',
        message: 'Please review and sign the attached service agreement.',
        signers: [
          {
            email_address: client.email,
            name: client.name
          }
        ],
        files: [contract.content]
      },
      {
        auth: {
          username: process.env.HELLOSIGN_API_KEY
        }
      }
    );

    // Update contract with signature request ID
    await pool.query(
      `UPDATE contracts
       SET signature_request_id = $1, status = $2, sent_at = NOW()
       WHERE id = $3`,
      [response.data.signature_request.id, 'pending_signature', id]
    );

    res.json({ success: true, signatureRequestId: response.data.signature_request.id });
  } catch (error) {
    console.error('Signature send error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Handle signed contract
router.post('/api/contracts/webhook/signed', async (req, res) => {
  try {
    const { signature_request_id, signer_name } = req.body;

    // Find contract
    const result = await pool.query(
      'SELECT * FROM contracts WHERE signature_request_id = $1',
      [signature_request_id]
    );
    const contract = result.rows[0];

    // Update status
    await pool.query(
      `UPDATE contracts
       SET status = $1, executed_at = NOW(), executed_by = $2
       WHERE id = $3`,
      ['executed', signer_name, contract.id]
    );

    // Trigger onboarding if estimate exists
    if (contract.estimate_id) {
      await pool.query(
        `INSERT INTO onboarding_queue
         (client_id, contract_id, status, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [contract.client_id, contract.id, 'pending']
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Contract execution error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Check contract renewal dates
router.get('/api/contracts/renewal/check', async (req, res) => {
  try {
    const today = new Date();
    const days90 = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
    const days60 = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
    const days30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Get contracts expiring at each threshold
    const result = await pool.query(
      `SELECT c.*, cl.email FROM contracts c
       JOIN clients cl ON c.client_id = cl.id
       WHERE c.status = $1 AND c.end_date <= $2 AND c.end_date > NOW()
       ORDER BY c.end_date ASC`,
      ['executed', days90]
    );

    const contracts = result.rows;

    for (const contract of contracts) {
      const endDate = new Date(contract.end_date);
      const daysUntil = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

      let message = '';
      if (daysUntil <= 30 && !contract.renewal_30_sent) {
        message = `Your contract renews in 30 days (${endDate.toDateString()}).`;
        await pool.query(
          'UPDATE contracts SET renewal_30_sent = true WHERE id = $1',
          [contract.id]
        );
      } else if (daysUntil <= 60 && !contract.renewal_60_sent) {
        message = `Your contract renews in 60 days (${endDate.toDateString()}).`;
        await pool.query(
          'UPDATE contracts SET renewal_60_sent = true WHERE id = $1',
          [contract.id]
        );
      } else if (daysUntil <= 90 && !contract.renewal_90_sent) {
        message = `Your contract renews in 90 days (${endDate.toDateString()}).`;
        await pool.query(
          'UPDATE contracts SET renewal_90_sent = true WHERE id = $1',
          [contract.id]
        );
      }

      if (message) {
        await mailer.sendMail({
          to: contract.email,
          subject: 'Contract Renewal Reminder',
          html: `<p>${message}</p><p><a href="${process.env.APP_URL}/contracts/${contract.id}">Review Contract</a></p>`
        });
      }
    }

    res.json({ success: true, processed: contracts.length });
  } catch (error) {
    console.error('Renewal check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Create contract amendment
router.post('/api/contracts/:id/amend', async (req, res) => {
  try {
    const { id } = req.params;
    const { amendments } = req.body;

    const contractResult = await pool.query(
      'SELECT * FROM contracts WHERE id = $1',
      [id]
    );
    const contract = contractResult.rows[0];

    const newVersion = contract.version + 1;

    // Create amendment record
    const amendmentResult = await pool.query(
      `INSERT INTO contract_amendments
       (contract_id, version, changes, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [id, newVersion, JSON.stringify(amendments)]
    );

    // Update contract version
    await pool.query(
      'UPDATE contracts SET version = $1 WHERE id = $2',
      [newVersion, id]
    );

    res.json({ success: true, amendment: amendmentResult.rows[0] });
  } catch (error) {
    console.error('Amendment creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Auto-file and store contracts
router.post('/api/contracts/:id/file', async (req, res) => {
  try {
    const { id } = req.params;
    const { tags, category } = req.body;

    const result = await pool.query(
      `UPDATE contracts
       SET category = $1, tags = $2, filed_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [category || 'general', tags || [], id]
    );

    res.json({ success: true, contract: result.rows[0] });
  } catch (error) {
    console.error('Filing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 7. Compliance clause checker
router.post('/api/contracts/:id/check-compliance', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT content FROM contracts WHERE id = $1',
      [id]
    );
    const contract = result.rows[0];

    const requiredClauses = [
      'liability',
      'termination',
      'payment terms',
      'confidentiality',
      'dispute resolution',
      'governing law'
    ];

    const contentLower = contract.content.toLowerCase();
    const missingClauses = requiredClauses.filter(
      clause => !contentLower.includes(clause)
    );

    const complianceScore = Math.round(
      ((requiredClauses.length - missingClauses.length) / requiredClauses.length) * 100
    );

    // Save compliance check
    await pool.query(
      `INSERT INTO compliance_checks
       (contract_id, score, missing_clauses, checked_at)
       VALUES ($1, $2, $3, NOW())`,
      [id, complianceScore, JSON.stringify(missingClauses)]
    );

    res.json({
      compliant: missingClauses.length === 0,
      complianceScore,
      missingClauses
    });
  } catch (error) {
    console.error('Compliance check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8. Get contract with version history
router.get('/api/contracts/:id/history', async (req, res) => {
  try {
    const { id } = req.params;

    const contractResult = await pool.query(
      'SELECT * FROM contracts WHERE id = $1',
      [id]
    );
    const contract = contractResult.rows[0];

    const amendmentsResult = await pool.query(
      'SELECT * FROM contract_amendments WHERE contract_id = $1 ORDER BY version ASC',
      [id]
    );

    res.json({
      contract,
      amendments: amendmentsResult.rows
    });
  } catch (error) {
    console.error('History retrieval error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
