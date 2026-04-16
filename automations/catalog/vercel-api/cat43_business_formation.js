import { Pool } from '@neondatabase/serverless';
import crypto from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fileEntityFormation(companyData) {
  const { entityType, state, ownerName, ownerEmail, businessName } = companyData;

  const response = await fetch('https://api.legalzoom.com/entity-filing', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.LEGALZOOM_API_KEY}` },
    body: JSON.stringify({
      entityType,
      state,
      businessName,
      ownerName,
      requestType: 'FORMATION'
    })
  });

  const filing = await response.json();

  const formationId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO business_formations (id, company_id, entity_type, state, filing_reference, status, filed_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [formationId, companyData.companyId, entityType, state, filing.reference_id, 'pending']
  );

  return { formationId, status: 'filed', reference: filing.reference_id };
}

async function applyForEIN(ownerName, ownerTaxId, businessName, entityType) {
  const response = await fetch('https://api.irs.gov/ein/apply', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.IRS_API_KEY}` },
    body: JSON.stringify({
      applicantName: ownerName,
      applicantTaxId: ownerTaxId,
      businessName,
      businessType: entityType,
      applicationDate: new Date()
    })
  });

  const application = await response.json();

  await pool.query(
    `INSERT INTO ein_applications (owner_name, business_name, ein, status, applied_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [ownerName, businessName, application.ein, 'pending']
  );

  return { ein: application.ein, status: 'applied', estimatedCompletion: application.estimated_days };
}

async function generateOperatingAgreement(companyData) {
  const { entityType, state, ownerName, businessName, ownerCount } = companyData;

  const template = await pool.query(
    `SELECT template_content FROM agreement_templates
     WHERE entity_type = $1 AND state = $2`,
    [entityType, state]
  );

  if (template.rows.length === 0) {
    throw new Error(`No template found for ${entityType} in ${state}`);
  }

  const agreement = template.rows[0].template_content
    .replace(/\{\{BUSINESS_NAME\}\}/g, businessName)
    .replace(/\{\{OWNER_NAME\}\}/g, ownerName)
    .replace(/\{\{OWNER_COUNT\}\}/g, ownerCount)
    .replace(/\{\{FORMATION_DATE\}\}/g, new Date().toLocaleDateString());

  const docId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO generated_documents (id, company_id, document_type, content, generated_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [docId, companyData.companyId, 'operating_agreement', agreement]
  );

  return { docId, document: agreement, documentType: 'operating_agreement' };
}

async function registerBusiness(companyData) {
  const { entityType, state, businessName, ownerName, companyId } = companyData;

  const requirements = await pool.query(
    `SELECT requirements FROM state_filing_rules
     WHERE state = $1 AND entity_type = $2`,
    [state, entityType]
  );

  if (requirements.rows.length === 0) {
    throw new Error(`No filing rules found for ${state}`);
  }

  const registrationId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO business_registrations (id, company_id, entity_type, state, status, registered_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [registrationId, companyId, entityType, state, 'registered']
  );

  return {
    registrationId,
    status: 'registered',
    requirements: requirements.rows[0].requirements
  };
}

async function setupRegisteredAgent(companyData) {
  const { state, businessName, ownerEmail } = companyData;

  const response = await fetch('https://api.incfile.com/registered-agent', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.INCFILE_API_KEY}` },
    body: JSON.stringify({
      businessName,
      state,
      notificationEmail: ownerEmail,
      serviceLevel: 'standard'
    })
  });

  const service = await response.json();

  await pool.query(
    `INSERT INTO registered_agent_services (company_id, state, agent_name, address, annual_fee, service_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [companyData.companyId, state, service.agent_name, service.address, service.annual_fee, service.service_id]
  );

  return {
    agentName: service.agent_name,
    address: service.address,
    annualFee: service.annual_fee,
    status: 'active'
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, companyData } = req.body;

    if (!action || !companyData) {
      return res.status(400).json({ error: 'Missing action or companyData' });
    }

    let response;

    switch (action) {
      case 'file_entity':
        if (!companyData.entityType || !companyData.state || !companyData.businessName) {
          return res.status(400).json({ error: 'Missing required entity fields' });
        }
        response = await fileEntityFormation(companyData);
        break;

      case 'apply_ein':
        if (!companyData.ownerName || !companyData.businessName) {
          return res.status(400).json({ error: 'Missing required EIN fields' });
        }
        response = await applyForEIN(
          companyData.ownerName,
          companyData.ownerTaxId,
          companyData.businessName,
          companyData.entityType
        );
        break;

      case 'generate_agreement':
        if (!companyData.entityType || !companyData.state) {
          return res.status(400).json({ error: 'Missing agreement parameters' });
        }
        response = await generateOperatingAgreement(companyData);
        break;

      case 'register_business':
        if (!companyData.entityType || !companyData.state) {
          return res.status(400).json({ error: 'Missing registration parameters' });
        }
        response = await registerBusiness(companyData);
        break;

      case 'setup_agent':
        if (!companyData.state || !companyData.businessName) {
          return res.status(400).json({ error: 'Missing agent setup parameters' });
        }
        response = await setupRegisteredAgent(companyData);
        break;

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(200).json({ success: true, ...response });
  } catch (error) {
    console.error('Business formation error:', error);
    return res.status(500).json({
      error: 'Business formation failed',
      message: error.message
    });
  }
}
