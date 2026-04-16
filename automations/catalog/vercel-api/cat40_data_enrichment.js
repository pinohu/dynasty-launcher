import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function validateEmail(email) {
  const response = await fetch(`https://api.hunter.io/v2/email-verifier?email=${email}&domain=${new URL('mailto:' + email).hostname}&api_key=${process.env.HUNTER_API_KEY}`);
  const data = await response.json();
  return { valid: data.data?.result === 'deliverable', score: data.data?.score || 0 };
}

async function validatePhone(phone) {
  const response = await fetch(`https://api.twilio.com/2010-04-01/PhoneNumbers/+${phone}`, {
    headers: { 'Authorization': `Basic ${Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64')}` }
  });
  const data = await response.json();
  return { valid: data.type === 'mobile' || data.type === 'fixed-line', carrier: data.carrier };
}

async function enrichLead(email, company) {
  const response = await fetch(`https://api.clearbit.com/v1/companies/find?email=${email}`, {
    headers: { 'Authorization': `Bearer ${process.env.CLEARBIT_API_KEY}` }
  });
  const data = await response.json();
  return {
    companyName: data.company?.name,
    revenue: data.company?.metrics?.annualRevenue,
    size: data.company?.metrics?.employees,
    industry: data.company?.category?.industry
  };
}

async function findSocialProfile(email, firstName, lastName) {
  const response = await fetch(`https://api.clearbit.com/v1/people/find?email=${email}`, {
    headers: { 'Authorization': `Bearer ${process.env.CLEARBIT_API_KEY}` }
  });
  const data = await response.json();
  return {
    linkedIn: data.person?.linkedin?.handle,
    twitter: data.person?.twitter?.handle,
    github: data.person?.github?.handle,
    profileUrl: data.person?.site
  };
}

async function getFirmographics(company) {
  const response = await fetch(`https://api.clearbit.com/v1/companies/find?name=${encodeURIComponent(company)}`, {
    headers: { 'Authorization': `Bearer ${process.env.CLEARBIT_API_KEY}` }
  });
  const data = await response.json();
  return {
    name: data.company?.name,
    domain: data.company?.domain,
    revenue: data.company?.metrics?.annualRevenue,
    employees: data.company?.metrics?.employees,
    founded: data.company?.founded?.year,
    location: data.company?.location,
    tech: data.company?.tech || []
  };
}

async function getTechnographics(domain) {
  const response = await fetch(`https://api.stackshare.io/companies/${domain}`, {
    headers: { 'Authorization': `Bearer ${process.env.STACKSHARE_API_KEY}` }
  });
  const data = await response.json();
  return {
    tools: data.tools || [],
    categories: data.categories || [],
    reliability: data.reliability_score
  };
}

async function aggregateBehaviorData(leadId) {
  const result = await pool.query(
    `SELECT
      COUNT(*) as total_interactions,
      MAX(last_seen) as last_activity,
      SUM(CASE WHEN action = 'email_open' THEN 1 ELSE 0 END) as emails_opened,
      SUM(CASE WHEN action = 'link_click' THEN 1 ELSE 0 END) as links_clicked,
      SUM(CASE WHEN action = 'form_submit' THEN 1 ELSE 0 END) as forms_submitted
     FROM lead_interactions WHERE lead_id = $1`,
    [leadId]
  );
  return result.rows[0];
}

async function verifyDataAccuracy(leadId) {
  const result = await pool.query(
    'SELECT email, phone, company FROM leads WHERE id = $1',
    [leadId]
  );
  const lead = result.rows[0];
  const emailValid = await validateEmail(lead.email);
  const phoneValid = await validatePhone(lead.phone);
  return { emailValid: emailValid.valid, phoneValid: phoneValid.valid, lastVerified: new Date() };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, email, phone, company, leadId, firstName, lastName, domain } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Missing action parameter' });
    }

    let response;

    switch (action) {
      case 'validate_contact':
        if (!email && !phone) {
          return res.status(400).json({ error: 'Missing email or phone' });
        }
        let emailValidation = null;
        let phoneValidation = null;
        if (email) emailValidation = await validateEmail(email);
        if (phone) phoneValidation = await validatePhone(phone);
        response = { success: true, email: emailValidation, phone: phoneValidation };
        break;

      case 'lead_enrichment':
        if (!email) {
          return res.status(400).json({ error: 'Missing email' });
        }
        const enriched = await enrichLead(email, company);
        const social = await findSocialProfile(email, firstName, lastName);
        await pool.query(
          'INSERT INTO enrichment_logs (email, company, revenue, employees, linkedin, twitter, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
          [email, enriched.companyName, enriched.revenue, enriched.size, social.linkedIn, social.twitter]
        );
        response = { success: true, enrichment: enriched, social };
        break;

      case 'social_finder':
        if (!email) {
          return res.status(400).json({ error: 'Missing email' });
        }
        const profiles = await findSocialProfile(email, firstName, lastName);
        response = { success: true, profiles };
        break;

      case 'firmographics':
        if (!company && !domain) {
          return res.status(400).json({ error: 'Missing company or domain' });
        }
        const firmData = await getFirmographics(company || domain);
        response = { success: true, firmData };
        break;

      case 'technographics':
        if (!domain) {
          return res.status(400).json({ error: 'Missing domain' });
        }
        const techData = await getTechnographics(domain);
        response = { success: true, technographics: techData };
        break;

      case 'behavioral_data':
        if (!leadId) {
          return res.status(400).json({ error: 'Missing leadId' });
        }
        const behavior = await aggregateBehaviorData(leadId);
        response = { success: true, behavior };
        break;

      case 'verify_accuracy':
        if (!leadId) {
          return res.status(400).json({ error: 'Missing leadId' });
        }
        const accuracy = await verifyDataAccuracy(leadId);
        response = { success: true, verification: accuracy };
        break;

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Enrichment error:', error);
    return res.status(500).json({
      error: 'Data enrichment failed',
      message: error.message
    });
  }
}
