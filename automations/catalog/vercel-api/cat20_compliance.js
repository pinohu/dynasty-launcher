import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { action, ...payload } = await req.json();

  try {
    switch (action) {
      case 'annual-report-deadline':
        return trackAnnualReportDeadline(payload);
      case 'license-renewal':
        return monitorLicenseRenewal(payload);
      case 'insurance-expiry':
        return alertInsuranceExpiry(payload);
      case 'tax-filing-deadline':
        return trackTaxFilingDeadline(payload);
      case 'boi-reporting':
        return handleBOIReporting(payload);
      case 'gdpr-ccpa-handler':
        return handleDataRequest(payload);
      case 'entity-status':
        return monitorEntityStatus(payload);
      case 'training-tracker':
        return trackTrainingCompliance(payload);
      case 'contract-monitoring':
        return monitorContractCompliance(payload);
      case 'regulatory-changes':
        return alertRegulatoryChanges(payload);
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Compliance error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function trackAnnualReportDeadline(payload) {
  const { businessId, reportType, dueDate, notifyDaysBefore } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const deadline = await db`
    INSERT INTO compliance_deadlines (business_id, deadline_type, due_date, notify_days_before, status)
    VALUES (${businessId}, ${reportType}, ${dueDate}, ${notifyDaysBefore}, 'tracked')
    RETURNING id
  `;

  const notifyDate = new Date(dueDate);
  notifyDate.setDate(notifyDate.getDate() - notifyDaysBefore);

  return NextResponse.json({
    success: true,
    deadlineId: deadline.rows[0].id,
    reportType,
    dueDate,
    notifyDate: notifyDate.toISOString().split('T')[0]
  });
}

async function monitorLicenseRenewal(payload) {
  const { businessId, licenseType, currentLicenseId, expiryDate } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const license = await db`
    INSERT INTO business_licenses (business_id, license_type, license_id, expiry_date, status)
    VALUES (${businessId}, ${licenseType}, ${currentLicenseId}, ${expiryDate}, 'active')
    RETURNING id
  `;

  const daysUntilExpiry = Math.floor((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  if (daysUntilExpiry < 90) {
    await fetch('https://api.acumbamail.com/v1/email/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ACUMBAMAIL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subject: `License Renewal Alert - ${licenseType}`,
        template: 'license_renewal_alert',
        variables: { licenseType, daysUntilExpiry, expiryDate }
      })
    });
  }

  return NextResponse.json({
    success: true,
    licenseId: license.rows[0].id,
    daysUntilExpiry,
    expiryDate
  });
}

async function alertInsuranceExpiry(payload) {
  const { businessId, policyId, policyType, expiryDate } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const insurance = await db`
    INSERT INTO insurance_policies (business_id, policy_id, policy_type, expiry_date, status)
    VALUES (${businessId}, ${policyId}, ${policyType}, ${expiryDate}, 'active')
    RETURNING id
  `;

  const daysUntilExpiry = Math.floor((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  if (daysUntilExpiry < 60) {
    await fetch('https://api.acumbamail.com/v1/email/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ACUMBAMAIL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subject: `Insurance Policy Expiry Alert - ${policyType}`,
        template: 'insurance_expiry_alert',
        variables: { policyType, daysUntilExpiry, expiryDate }
      })
    });
  }

  return NextResponse.json({
    success: true,
    insuranceId: insurance.rows[0].id,
    daysUntilExpiry
  });
}

async function trackTaxFilingDeadline(payload) {
  const { businessId, filingType, taxYear, dueDate } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const deadline = await db`
    INSERT INTO tax_deadlines (business_id, filing_type, tax_year, due_date, status)
    VALUES (${businessId}, ${filingType}, ${taxYear}, ${dueDate}, 'pending')
    RETURNING id
  `;

  return NextResponse.json({
    success: true,
    deadlineId: deadline.rows[0].id,
    filingType,
    taxYear,
    dueDate
  });
}

async function handleBOIReporting(payload) {
  const { businessId, beneficialOwners, reportingYear } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const report = await db`
    INSERT INTO boi_reports (business_id, beneficial_owners, reporting_year, status, filed_date)
    VALUES (${businessId}, ${JSON.stringify(beneficialOwners)}, ${reportingYear}, 'submitted', NOW())
    RETURNING id
  `;

  return NextResponse.json({
    success: true,
    reportId: report.rows[0].id,
    ownersReported: beneficialOwners.length,
    reportingYear,
    filingStatus: 'submitted'
  });
}

async function handleDataRequest(payload) {
  const { requestType, subjectEmail, businessId, jurisdiction } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  let deadline = new Date();
  if (jurisdiction === 'EU') deadline.setDate(deadline.getDate() + 30);
  else if (jurisdiction === 'CA') deadline.setDate(deadline.getDate() + 45);

  const request = await db`
    INSERT INTO data_requests (business_id, request_type, subject_email, jurisdiction, deadline, status)
    VALUES (${businessId}, ${requestType}, ${subjectEmail}, ${jurisdiction}, ${deadline.toISOString()}, 'pending')
    RETURNING id
  `;

  return NextResponse.json({
    success: true,
    requestId: request.rows[0].id,
    requestType,
    deadline: deadline.toISOString().split('T')[0],
    jurisdiction
  });
}

async function monitorEntityStatus(payload) {
  const { businessId, entityName, state, checkFrequency } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const entityCheck = await db`
    INSERT INTO entity_monitoring (business_id, entity_name, state, last_checked, check_frequency, status)
    VALUES (${businessId}, ${entityName}, ${state}, NOW(), ${checkFrequency}, 'good_standing')
    RETURNING id
  `;

  return NextResponse.json({
    success: true,
    monitoringId: entityCheck.rows[0].id,
    entityName,
    status: 'good_standing',
    nextCheckDate: new Date(Date.now() + parseInt(checkFrequency) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });
}

async function trackTrainingCompliance(payload) {
  const { employeeId, trainingType, completionDate, expiryDate, businessId } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const training = await db`
    INSERT INTO training_compliance (business_id, employee_id, training_type, completion_date, expiry_date, status)
    VALUES (${businessId}, ${employeeId}, ${trainingType}, ${completionDate}, ${expiryDate}, 'completed')
    RETURNING id
  `;

  return NextResponse.json({
    success: true,
    trainingId: training.rows[0].id,
    trainingType,
    completionDate,
    expiryDate
  });
}

async function monitorContractCompliance(payload) {
  const { contractId, contractName, renewalDate, businessId } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const contract = await db`
    INSERT INTO contracts (business_id, contract_id, contract_name, renewal_date, status)
    VALUES (${businessId}, ${contractId}, ${contractName}, ${renewalDate}, 'active')
    RETURNING id
  `;

  const daysUntilRenewal = Math.floor((new Date(renewalDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return NextResponse.json({
    success: true,
    contractId: contract.rows[0].id,
    contractName,
    daysUntilRenewal,
    renewalDate
  });
}

async function alertRegulatoryChanges(payload) {
  const { businessId, industry, jurisdictions } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const monitor = await db`
    INSERT INTO regulatory_monitoring (business_id, industry, jurisdictions, last_checked, status)
    VALUES (${businessId}, ${industry}, ${JSON.stringify(jurisdictions)}, NOW(), 'active')
    RETURNING id
  `;

  return NextResponse.json({
    success: true,
    monitoringId: monitor.rows[0].id,
    industry,
    jurisdictions,
    checkFrequency: 'daily'
  });
}
