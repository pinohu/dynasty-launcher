import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { action, ...payload } = await req.json();

  try {
    switch (action) {
      case 'timesheet-reminder':
        return timesheetReminder(payload);
      case 'contractor-invoice':
        return processContractorInvoice(payload);
      case 'pto-request':
        return handlePTORequest(payload);
      case 'performance-dashboard':
        return generatePerformanceDashboard(payload);
      case 'commission-calculator':
        return calculateCommission(payload);
      case 'tax-forms-prep':
        return prepareTaxForms(payload);
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Payroll error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function timesheetReminder(payload) {
  const { employeeId, email, weekEnding, businessId } = payload;

  const response = await fetch('https://api.acumbamail.com/v1/email/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.ACUMBAMAIL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: email,
      subject: `Timesheet Submission Reminder - Week of ${weekEnding}`,
      template: 'timesheet_reminder',
      variables: { employeeId, weekEnding }
    })
  });

  return NextResponse.json({ success: response.ok, email });
}

async function processContractorInvoice(payload) {
  const { contractorId, amount, description, dueDate, businessId } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const result = await db`
    INSERT INTO contractor_invoices (business_id, contractor_id, amount, description, due_date, status)
    VALUES (${businessId}, ${contractorId}, ${amount}, ${description}, ${dueDate}, 'pending')
    RETURNING id, created_at
  `;

  return NextResponse.json({
    success: true,
    invoiceId: result.rows[0].id,
    amount,
    dueDate,
    status: 'pending'
  });
}

async function handlePTORequest(payload) {
  const { employeeId, startDate, endDate, type, managerId, businessId } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

  const request = await db`
    INSERT INTO pto_requests (business_id, employee_id, start_date, end_date, type, days, status, manager_id)
    VALUES (${businessId}, ${employeeId}, ${startDate}, ${endDate}, ${type}, ${days}, 'pending', ${managerId})
    RETURNING id
  `;

  await fetch('https://api.acumbamail.com/v1/email/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.ACUMBAMAIL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: `manager-${managerId}@business.com`,
      subject: `PTO Request for Approval - ${days} days`,
      template: 'pto_approval_request',
      variables: { employeeId, startDate, endDate, days, type }
    })
  });

  return NextResponse.json({
    success: true,
    requestId: request.rows[0].id,
    days,
    status: 'pending_approval'
  });
}

async function generatePerformanceDashboard(payload) {
  const { businessId, period, includeMetrics } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const metrics = await db`
    SELECT 
      employee_id,
      AVG(rating) as avg_rating,
      COUNT(DISTINCT review_id) as review_count,
      MAX(updated_at) as last_review
    FROM performance_reviews
    WHERE business_id = ${businessId}
      AND period = ${period}
    GROUP BY employee_id
  `;

  return NextResponse.json({
    success: true,
    period,
    employeeMetrics: metrics.rows,
    totalEmployees: metrics.rows.length,
    averageRating: (
      metrics.rows.reduce((sum, row) => sum + parseFloat(row.avg_rating || 0), 0) / metrics.rows.length
    ).toFixed(2)
  });
}

async function calculateCommission(payload) {
  const { employeeId, salesAmount, period, commissionRate, businessId } = payload;

  const commissionAmount = salesAmount * (commissionRate / 100);

  const db = await import('@vercel/postgres').then(m => m.sql);

  await db`
    INSERT INTO commissions (business_id, employee_id, period, sales_amount, commission_amount, commission_rate)
    VALUES (${businessId}, ${employeeId}, ${period}, ${salesAmount}, ${commissionAmount}, ${commissionRate})
  `;

  return NextResponse.json({
    success: true,
    salesAmount,
    commissionRate,
    commissionAmount: commissionAmount.toFixed(2),
    period
  });
}

async function prepareTaxForms(payload) {
  const { year, businessId, formType } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  let query;
  if (formType === 'w2') {
    query = await db`
      SELECT 
        employee_id,
        SUM(gross_pay) as total_wages,
        SUM(federal_tax) as federal_withholding,
        SUM(social_security) as ss_wages,
        SUM(medicare) as medicare_wages
      FROM payroll
      WHERE business_id = ${businessId}
        AND EXTRACT(YEAR FROM pay_date) = ${year}
      GROUP BY employee_id
    `;
  } else {
    query = await db`
      SELECT 
        contractor_id,
        SUM(amount) as total_paid
      FROM contractor_invoices
      WHERE business_id = ${businessId}
        AND EXTRACT(YEAR FROM due_date) = ${year}
        AND status = 'paid'
      GROUP BY contractor_id
      HAVING SUM(amount) >= 600
    `;
  }

  return NextResponse.json({
    success: true,
    formType,
    year,
    recordCount: query.rows.length,
    forms: query.rows
  });
}
