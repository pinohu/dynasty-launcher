import { Pool } from '@neondatabase/serverless';
import crypto from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function getInsuranceQuotes(businessData) {
  const { industry, businessSize, businessAge, revenue, zipCode } = businessData;

  const quoteRequests = [
    {
      provider: 'insurquote',
      url: 'https://api.insurquote.com/get-quotes',
      data: { industry, businessSize, revenue, zipCode }
    },
    {
      provider: 'next_insurance',
      url: 'https://api.nextinsurance.com/quotes',
      data: { industry, businessSize, businessAge, revenue }
    },
    {
      provider: 'stride',
      url: 'https://api.stridhealth.com/quotes',
      data: { industry, businessSize, revenue, zipCode }
    }
  ];

  const quotes = [];

  for (const request of quoteRequests) {
    try {
      const response = await fetch(request.url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env[`${request.provider.toUpperCase()}_API_KEY`]}` },
        body: JSON.stringify(request.data)
      });
      const data = await response.json();
      quotes.push({ provider: request.provider, quotes: data.quotes || [] });
    } catch (error) {
      console.error(`Failed to get quotes from ${request.provider}:`, error);
    }
  }

  await pool.query(
    `INSERT INTO quote_cache (company_id, industry, business_size, quotes, fetched_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [businessData.companyId, industry, businessSize, JSON.stringify(quotes)]
  );

  return quotes;
}

async function identifyCoverageGaps(companyId) {
  const requirements = await pool.query(
    `SELECT r.coverage_type, r.min_coverage_amount FROM insurance_requirements r
     JOIN companies c ON r.industry = c.industry
     WHERE c.id = $1`,
    [companyId]
  );

  const currentCoverage = await pool.query(
    `SELECT coverage_type, coverage_amount FROM current_policies WHERE company_id = $1`,
    [companyId]
  );

  const gaps = [];
  const currentMap = new Map(currentCoverage.rows.map(c => [c.coverage_type, c.coverage_amount]));

  for (const req of requirements.rows) {
    const current = currentMap.get(req.coverage_type) || 0;
    if (current < req.min_coverage_amount) {
      gaps.push({
        coverageType: req.coverage_type,
        required: req.min_coverage_amount,
        current: current,
        gap: req.min_coverage_amount - current
      });
    }
  }

  for (const gap of gaps) {
    await pool.query(
      `INSERT INTO coverage_gaps (company_id, coverage_type, required_amount, current_amount, gap_amount)
       VALUES ($1, $2, $3, $4, $5)`,
      [companyId, gap.coverageType, gap.required, gap.current, gap.gap]
    );
  }

  return { gaps, gapCount: gaps.length };
}

async function fileInsuranceClaim(claimData) {
  const { companyId, policyId, claimType, claimAmount, description, incidentDate } = claimData;

  const response = await fetch('https://api.claimsmate.com/file-claim', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.CLAIMSMATE_API_KEY}` },
    body: JSON.stringify({
      policyId,
      claimType,
      amount: claimAmount,
      description,
      incidentDate
    })
  });

  const claim = await response.json();

  const claimId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO insurance_claims (id, company_id, policy_id, claim_type, amount, status, claim_reference, filed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [claimId, companyId, policyId, claimType, claimAmount, 'pending', claim.reference_number]
  );

  return {
    claimId,
    status: 'filed',
    claimReference: claim.reference_number,
    estimatedProcessing: claim.estimated_days
  };
}

async function assessBusinessRisk(businessData) {
  const { companyId, industry, employeeCount, revenue, businessAge, previousClaims } = businessData;

  let riskScore = 50;

  const industryRiskMap = {
    'construction': 35,
    'healthcare': 40,
    'manufacturing': 38,
    'retail': 30,
    'technology': 20,
    'professional_services': 25,
    'hospitality': 35
  };

  riskScore = industryRiskMap[industry] || 50;

  if (businessAge < 2) riskScore += 15;
  else if (businessAge < 5) riskScore += 10;

  if (employeeCount > 50) riskScore += 5;

  if (previousClaims > 2) riskScore += 20;
  else if (previousClaims > 0) riskScore += 10;

  const assessmentId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO risk_assessments (id, company_id, industry, risk_score, assessment_date, factors)
     VALUES ($1, $2, $3, $4, NOW(), $5)`,
    [
      assessmentId,
      companyId,
      industry,
      riskScore,
      JSON.stringify({ businessAge, employeeCount, previousClaims })
    ]
  );

  const riskLevel = riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW';

  return {
    assessmentId,
    riskScore,
    riskLevel,
    recommendedCoverages: getRiskBasedCoverages(industry, riskScore)
  };
}

function getRiskBasedCoverages(industry, riskScore) {
  const baseCoverages = {
    'general_liability': 1000000,
    'professional_liability': 1000000
  };

  if (riskScore >= 70) {
    baseCoverages['business_interruption'] = 500000;
    baseCoverages['cyber_liability'] = 250000;
  } else if (riskScore >= 40) {
    baseCoverages['cyber_liability'] = 100000;
  }

  if (industry === 'healthcare') {
    baseCoverages['malpractice'] = 2000000;
  } else if (industry === 'construction') {
    baseCoverages['workers_comp'] = 1000000;
  }

  return baseCoverages;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, businessData, companyId, claimData } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Missing action parameter' });
    }

    let response;

    switch (action) {
      case 'get_quotes':
        if (!businessData) {
          return res.status(400).json({ error: 'Missing businessData' });
        }
        response = await getInsuranceQuotes(businessData);
        break;

      case 'coverage_gaps':
        if (!companyId) {
          return res.status(400).json({ error: 'Missing companyId' });
        }
        response = await identifyCoverageGaps(companyId);
        break;

      case 'file_claim':
        if (!claimData) {
          return res.status(400).json({ error: 'Missing claimData' });
        }
        response = await fileInsuranceClaim(claimData);
        break;

      case 'risk_assessment':
        if (!businessData) {
          return res.status(400).json({ error: 'Missing businessData' });
        }
        response = await assessBusinessRisk(businessData);
        break;

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(200).json({ success: true, ...response });
  } catch (error) {
    console.error('Insurance error:', error);
    return res.status(500).json({
      error: 'Insurance operation failed',
      message: error.message
    });
  }
}
