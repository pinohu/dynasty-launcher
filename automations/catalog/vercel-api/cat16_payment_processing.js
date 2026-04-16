import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req: NextRequest) {
  const { action, ...payload } = await req.json();

  try {
    switch (action) {
      case 'generate-link':
        return generatePaymentLink(payload);
      case 'retry-failed':
        return retryFailedPayment(payload);
      case 'dunning-sequence':
        return sendDunningEmail(payload);
      case 'card-expiry-alert':
        return cardExpiryAlert(payload);
      case 'deposit-handler':
        return handleDeposit(payload);
      case 'installment-plan':
        return createInstallmentPlan(payload);
      case 'refund-processing':
        return processRefund(payload);
      case 'collections-workflow':
        return collectionsWorkflow(payload);
      case 'update-method-request':
        return paymentMethodUpdateRequest(payload);
      case 'revenue-reconciliation':
        return revenueReconciliation(payload);
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Payment error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function generatePaymentLink(payload) {
  const { amount, currency, email, customerId, description, metadata } = payload;

  const paymentLink = await stripe.paymentLinks.create({
    line_items: [{ price_data: { currency, product_data: { name: description }, unit_amount: amount }, quantity: 1 }],
    customer_email: email,
    custom_fields: [{ key: 'customer_id', label: { custom: 'Customer ID', type: 'custom' }, type: 'text' }],
    metadata: { customerId, ...metadata }
  });

  return NextResponse.json({ success: true, paymentLink: paymentLink.url });
}

async function retryFailedPayment(payload) {
  const { paymentIntentId, retryCount, backoffMs } = payload;

  if (retryCount >= 3) {
    return NextResponse.json({ error: 'Max retries exceeded' }, { status: 400 });
  }

  await new Promise(resolve => setTimeout(resolve, backoffMs));

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const retryIntent = await stripe.paymentIntents.create({
    amount: intent.amount,
    currency: intent.currency,
    customer: intent.customer,
    payment_method: intent.payment_method,
    off_session: true,
    confirm: true,
    metadata: { originalIntentId: paymentIntentId, retryCount: retryCount + 1 }
  });

  return NextResponse.json({ success: true, paymentIntentId: retryIntent.id, status: retryIntent.status });
}

async function sendDunningEmail(payload) {
  const { customerId, email, invoiceId, amount, daysOverdue, stage } = payload;

  const emailTemplates = {
    soft: { subject: 'Payment Reminder', template: 'dunning_soft' },
    firm: { subject: 'Past Due Invoice', template: 'dunning_firm' },
    urgent: { subject: 'Urgent: Payment Required', template: 'dunning_urgent' }
  };

  const template = emailTemplates[stage];

  const response = await fetch('https://api.acumbamail.com/v1/email/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.ACUMBAMAIL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: email,
      subject: template.subject,
      template: template.template,
      variables: { amount, daysOverdue, invoiceId }
    })
  });

  return NextResponse.json({ success: response.ok });
}

async function cardExpiryAlert(payload) {
  const { customerId, email, daysUntilExpiry } = payload;

  const customer = await stripe.customers.retrieve(customerId);
  const defaultSource = customer.default_source;

  if (!defaultSource || typeof defaultSource !== 'string') {
    return NextResponse.json({ error: 'No card found' }, { status: 404 });
  }

  const card = await stripe.customers.retrieveSource(customerId, defaultSource);

  if (card.object === 'card' && card.exp_year * 12 + card.exp_month <= new Date().getFullYear() * 12 + new Date().getMonth() + daysUntilExpiry / 30) {
    await fetch('https://api.acumbamail.com/v1/email/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.ACUMBAMAIL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        subject: 'Update Your Card Information',
        template: 'card_expiry_alert',
        variables: { expiry: `${card.exp_month}/${card.exp_year}` }
      })
    });
  }

  return NextResponse.json({ success: true });
}

async function handleDeposit(payload) {
  const { customerId, amount, invoiceId, depositPercentage, scheduledPayments } = payload;

  const depositAmount = Math.round(amount * (depositPercentage / 100));
  const remainingAmount = amount - depositAmount;

  const invoice = await stripe.invoices.retrieve(invoiceId);
  const paymentIntent = await stripe.paymentIntents.create({
    amount: depositAmount,
    currency: invoice.currency,
    customer: customerId,
    metadata: { type: 'deposit', invoiceId, originalAmount: amount }
  });

  return NextResponse.json({ success: true, paymentIntentId: paymentIntent.id, depositAmount, remainingAmount });
}

async function createInstallmentPlan(payload) {
  const { customerId, totalAmount, numberOfInstallments, frequencyDays, invoiceId } = payload;

  const installmentAmount = Math.round(totalAmount / numberOfInstallments);
  const installments = [];

  for (let i = 0; i < numberOfInstallments; i++) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + frequencyDays * (i + 1));

    installments.push({
      amount: installmentAmount,
      dueDate: dueDate.toISOString().split('T')[0],
      sequence: i + 1
    });
  }

  return NextResponse.json({ success: true, installments, totalAmount });
}

async function processRefund(payload) {
  const { chargeId, amount, reason, customerId, metadata } = payload;

  const refund = await stripe.refunds.create({
    charge: chargeId,
    amount: amount,
    reason: reason,
    metadata: { customerId, ...metadata }
  });

  return NextResponse.json({ success: true, refundId: refund.id, status: refund.status });
}

async function collectionsWorkflow(payload) {
  const { invoiceId, customerId, daysOverdue, totalDue, escalateToLegal } = payload;

  let action = 'reminder';
  if (daysOverdue > 45) action = 'firm_notice';
  if (daysOverdue > 60) action = 'escalate';

  const response = await fetch('https://api.acumbamail.com/v1/email/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.ACUMBAMAIL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template: `collections_${action}`,
      variables: { invoiceId, totalDue, daysOverdue }
    })
  });

  return NextResponse.json({ success: response.ok, escalated: escalateToLegal });
}

async function paymentMethodUpdateRequest(payload) {
  const { customerId, email, reason } = payload;

  await fetch('https://api.acumbamail.com/v1/email/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.ACUMBAMAIL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: email,
      subject: 'Please Update Your Payment Method',
      template: 'update_payment_method',
      variables: { reason }
    })
  });

  return NextResponse.json({ success: true });
}

async function revenueReconciliation(payload) {
  const { startDate, endDate, includeRefunds, includeFees } = payload;

  const charges = await stripe.charges.list({
    created: { gte: Math.floor(new Date(startDate).getTime() / 1000), lte: Math.floor(new Date(endDate).getTime() / 1000) }
  });

  let totalRevenue = 0;
  let totalFees = 0;

  charges.data.forEach(charge => {
    if (charge.paid) totalRevenue += charge.amount;
  });

  if (includeRefunds) {
    const refunds = await stripe.refunds.list({});
    refunds.data.forEach(refund => {
      totalRevenue -= refund.amount;
    });
  }

  return NextResponse.json({ success: true, totalRevenue, totalFees, period: { startDate, endDate } });
}
