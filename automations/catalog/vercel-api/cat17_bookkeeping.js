import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const { action, ...payload } = await req.json();

  try {
    switch (action) {
      case 'scan-receipt':
        return scanReceipt(payload);
      case 'bank-categorization':
        return categorizeTransaction(payload);
      case 'monthly-pl':
        return generateMonthlyPL(payload);
      case 'tax-estimate':
        return calculateTaxEstimate(payload);
      case 'mileage-log':
        return logMileage(payload);
      case 'tax-documents':
        return compileTaxDocuments(payload);
      case 'expense-report':
        return generateExpenseReport(payload);
      case 'coa-sync':
        return syncChartOfAccounts(payload);
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Bookkeeping error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function scanReceipt(payload) {
  const { imageUrl, receiptDate, vendor, businessId } = payload;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          { type: 'text', text: 'Extract amount, items, category, and tax from this receipt. Return JSON.' }
        ]
      }
    ]
  });

  const extracted = JSON.parse(response.content[0].type === 'text' ? response.content[0].text : '{}');

  return NextResponse.json({
    success: true,
    receipt: {
      date: receiptDate,
      vendor,
      amount: extracted.amount,
      items: extracted.items,
      category: extracted.category,
      tax: extracted.tax
    }
  });
}

async function categorizeTransaction(payload) {
  const { transactionId, amount, description, vendor, date } = payload;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Categorize this transaction as one category: ${description} from ${vendor} for $${amount}. Valid categories: Meals, Travel, Supplies, Equipment, Utilities, Marketing, Professional Services, Other. Return: {"category": "...", "subcategory": "..."}`
      }
    ]
  });

  const categorized = JSON.parse(response.content[0].type === 'text' ? response.content[0].text : '{}');

  return NextResponse.json({
    success: true,
    transactionId,
    category: categorized.category,
    subcategory: categorized.subcategory
  });
}

async function generateMonthlyPL(payload) {
  const { month, year, businessId } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);
  const result = await db`
    SELECT 
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
      SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expenses
    FROM transactions
    WHERE business_id = ${businessId}
      AND EXTRACT(MONTH FROM date) = ${month}
      AND EXTRACT(YEAR FROM date) = ${year}
  `;

  const income = result.rows[0]?.total_income || 0;
  const expenses = result.rows[0]?.total_expenses || 0;

  return NextResponse.json({
    success: true,
    period: `${month}/${year}`,
    income,
    expenses,
    netProfit: income - expenses,
    profitMargin: ((income - expenses) / income * 100).toFixed(2)
  });
}

async function calculateTaxEstimate(payload) {
  const { quarter, year, businessId, businessType } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);
  const result = await db`
    SELECT SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as quarterly_income
    FROM transactions
    WHERE business_id = ${businessId}
      AND EXTRACT(YEAR FROM date) = ${year}
      AND EXTRACT(QUARTER FROM date) = ${quarter}
  `;

  const income = result.rows[0]?.quarterly_income || 0;
  const taxRate = businessType === 'llc' ? 0.15 : businessType === 'corp' ? 0.21 : 0.25;

  return NextResponse.json({
    success: true,
    quarter,
    year,
    estimatedIncome: income,
    estimatedTax: Math.round(income * taxRate),
    taxRate: (taxRate * 100).toFixed(1)
  });
}

async function logMileage(payload) {
  const { date, startLocation, endLocation, miles, purpose, businessId } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);
  
  await db`
    INSERT INTO mileage_log (business_id, date, start_location, end_location, miles, purpose)
    VALUES (${businessId}, ${date}, ${startLocation}, ${endLocation}, ${miles}, ${purpose})
  `;

  const standardMileageRate = 0.645;
  const deduction = miles * standardMileageRate;

  return NextResponse.json({
    success: true,
    date,
    miles,
    standardMileageRate,
    taxDeduction: deduction.toFixed(2)
  });
}

async function compileTaxDocuments(payload) {
  const { year, businessId, includeReceipts, includeInvoices } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const documents = {
    receipts: [],
    invoices: [],
    mileageLog: [],
    expenseReports: []
  };

  if (includeReceipts) {
    const receipts = await db`
      SELECT * FROM receipts 
      WHERE business_id = ${businessId} AND EXTRACT(YEAR FROM date) = ${year}
    `;
    documents.receipts = receipts.rows;
  }

  if (includeInvoices) {
    const invoices = await db`
      SELECT * FROM invoices 
      WHERE business_id = ${businessId} AND EXTRACT(YEAR FROM date) = ${year}
    `;
    documents.invoices = invoices.rows;
  }

  const mileage = await db`
    SELECT SUM(miles) as total_miles FROM mileage_log 
    WHERE business_id = ${businessId} AND EXTRACT(YEAR FROM date) = ${year}
  `;
  documents.mileageLog = mileage.rows[0];

  return NextResponse.json({
    success: true,
    year,
    documents,
    summary: {
      receiptCount: documents.receipts.length,
      invoiceCount: documents.invoices.length,
      totalMiles: documents.mileageLog?.total_miles || 0
    }
  });
}

async function generateExpenseReport(payload) {
  const { period, employeeId, businessId, categories } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const expenses = await db`
    SELECT category, SUM(amount) as total
    FROM expenses
    WHERE employee_id = ${employeeId}
      AND business_id = ${businessId}
      AND period = ${period}
    GROUP BY category
  `;

  const total = expenses.rows.reduce((sum, row) => sum + parseFloat(row.total), 0);

  return NextResponse.json({
    success: true,
    period,
    employeeId,
    expenses: expenses.rows,
    totalAmount: total,
    status: 'pending_approval'
  });
}

async function syncChartOfAccounts(payload) {
  const { businessId, chartOfAccounts } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  for (const account of chartOfAccounts) {
    await db`
      INSERT INTO chart_of_accounts (business_id, account_number, name, type)
      VALUES (${businessId}, ${account.number}, ${account.name}, ${account.type})
      ON CONFLICT (business_id, account_number) DO UPDATE
      SET name = ${account.name}, type = ${account.type}
    `;
  }

  return NextResponse.json({
    success: true,
    accountsCount: chartOfAccounts.length,
    synced: true
  });
}
