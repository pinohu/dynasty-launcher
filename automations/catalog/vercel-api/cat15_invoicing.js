import { Router } from 'express';
import { pool } from '../db/pool.js';
import { logger } from '../logger.js';
import Stripe from 'stripe';
import { sendEmail } from '../integrations/acumbamail.js';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 1. Auto-Invoice Generation (on job completion)
router.post('/auto-generate', async (req, res) => {
  try {
    const { jobId } = req.body;
    logger.info('Auto-generating invoice', { jobId });

    const jobResult = await pool.query(
      'SELECT * FROM jobs WHERE id = $1',
      [jobId]
    );

    if (jobResult.rows.length === 0) throw new Error('Job not found');
    const job = jobResult.rows[0];

    // Calculate invoice amount from job details
    const lineItems = await pool.query(
      'SELECT item_type, quantity, unit_price FROM invoice_line_items WHERE job_id = $1',
      [jobId]
    );

    let totalAmount = 0;
    lineItems.rows.forEach(item => {
      totalAmount += item.quantity * item.unit_price;
    });

    // Create invoice
    const invoiceResult = await pool.query(
      'INSERT INTO invoices (job_id, client_id, amount, status, created_at, due_date) VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL \'30 days\') RETURNING *',
      [jobId, job.client_id, totalAmount, 'draft']
    );

    const invoice = invoiceResult.rows[0];

    // Generate invoice number
    const invoiceNo = `INV-${new Date(invoice.created_at).getFullYear()}-${invoice.id}`;
    await pool.query(
      'UPDATE invoices SET invoice_number = $1, status = $2 WHERE id = $3',
      [invoiceNo, 'sent', invoice.id]
    );

    // Send invoice to client
    const clientResult = await pool.query(
      'SELECT email, first_name FROM users WHERE id = $1',
      [job.client_id]
    );

    await sendEmail({
      to: clientResult.rows[0].email,
      subject: `Invoice ${invoiceNo} for Service`,
      template: 'invoice_notification',
      data: {
        clientName: clientResult.rows[0].first_name,
        invoiceNumber: invoiceNo,
        amount: totalAmount.toFixed(2),
        dueDate: new Date(invoice.due_date).toLocaleDateString()
      }
    });

    res.json({
      success: true,
      invoiceId: invoice.id,
      invoiceNumber: invoiceNo,
      amount: totalAmount,
      dueDate: invoice.due_date,
      message: 'Invoice generated and sent'
    });
  } catch (error) {
    logger.error('Auto-invoice error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Recurring Billing Automation
router.post('/recurring', async (req, res) => {
  try {
    const { customerId, amount, frequency } = req.body;
    logger.info('Setting up recurring billing', { customerId, frequency });

    // Get Stripe customer
    const stripeCustomerResult = await pool.query(
      'SELECT stripe_customer_id FROM customers WHERE id = $1',
      [customerId]
    );

    if (stripeCustomerResult.rows.length === 0) {
      throw new Error('Customer not found');
    }

    const stripeCustomerId = stripeCustomerResult.rows[0].stripe_customer_id;

    // Create subscription in Stripe
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price_data: { currency: 'usd', product_data: { name: 'Service Retainer' }, recurring: { interval: frequency }, unit_amount: Math.round(amount * 100) } }]
    });

    // Log recurring billing
    const recurringResult = await pool.query(
      'INSERT INTO recurring_billings (customer_id, amount, frequency, stripe_subscription_id, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [customerId, amount, frequency, subscription.id, 'active']
    );

    res.json({
      success: true,
      recurringId: recurringResult.rows[0].id,
      stripeSubscriptionId: subscription.id,
      amount,
      frequency,
      message: 'Recurring billing setup complete'
    });
  } catch (error) {
    logger.error('Recurring billing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Time-Based Invoice Calculator
router.post('/time-calculation', async (req, res) => {
  try {
    const { jobId, hours, rate } = req.body;
    logger.info('Calculating time-based invoice', { jobId, hours, rate });

    const amount = hours * rate;

    // Insert line item
    const lineItemResult = await pool.query(
      'INSERT INTO invoice_line_items (job_id, item_type, quantity, unit_price, description) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [jobId, 'labor', hours, rate, `Labor - ${hours} hours @ $${rate}/hr`]
    );

    res.json({
      success: true,
      lineItemId: lineItemResult.rows[0].id,
      hours,
      rate,
      amount: amount.toFixed(2),
      message: 'Time-based amount calculated'
    });
  } catch (error) {
    logger.error('Time calculation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Expense Line Item Tracker
router.post('/expense-tracking', async (req, res) => {
  try {
    const { jobId, expenses } = req.body;
    logger.info('Tracking expenses', { jobId });

    let totalExpenses = 0;

    for (const expense of expenses) {
      const expenseResult = await pool.query(
        'INSERT INTO invoice_line_items (job_id, item_type, quantity, unit_price, description) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [jobId, 'expense', 1, expense.amount, expense.description]
      );

      totalExpenses += expense.amount;
    }

    // Log to job costing
    await pool.query(
      'UPDATE jobs SET total_expenses = $1 WHERE id = $2',
      [totalExpenses, jobId]
    );

    res.json({
      success: true,
      expenseCount: expenses.length,
      totalExpenses: totalExpenses.toFixed(2),
      message: 'Expenses tracked'
    });
  } catch (error) {
    logger.error('Expense tracking error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Multi-Level Payment Reminder Sequence
router.post('/payment-reminders', async (req, res) => {
  try {
    const { invoiceId, clientId } = req.body;
    logger.info('Setting payment reminders', { invoiceId });

    const invoiceResult = await pool.query(
      'SELECT created_at, amount FROM invoices WHERE id = $1',
      [invoiceId]
    );

    const invoice = invoiceResult.rows[0];
    const createdDate = new Date(invoice.created_at);

    // Set reminder sequence: Day 1, 7, 14, 30
    const reminderDays = [1, 7, 14, 30];
    const reminders = [];

    for (const days of reminderDays) {
      const reminderDate = new Date(createdDate.getTime() + days * 24 * 60 * 60 * 1000);
      const reminderResult = await pool.query(
        'INSERT INTO payment_reminders (invoice_id, reminder_day, scheduled_for, status) VALUES ($1, $2, $3, $4) RETURNING id',
        [invoiceId, days, reminderDate, 'scheduled']
      );
      reminders.push({ day: days, scheduledFor: reminderDate });
    }

    // Get client info for first reminder
    const clientResult = await pool.query(
      'SELECT email, first_name FROM users WHERE id = $1',
      [clientId]
    );

    // Send first reminder
    await sendEmail({
      to: clientResult.rows[0].email,
      subject: `Payment Reminder - Invoice Due`,
      template: 'payment_reminder',
      data: {
        clientName: clientResult.rows[0].first_name,
        amount: invoice.amount.toFixed(2),
        dueDate: new Date(invoice.created_at).toLocaleDateString()
      }
    });

    res.json({
      success: true,
      invoiceId,
      reminderCount: reminders.length,
      reminders,
      message: 'Payment reminders scheduled'
    });
  } catch (error) {
    logger.error('Payment reminders error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Late Fee Auto-Application
router.post('/late-fees', async (req, res) => {
  try {
    const { invoiceId } = req.body;
    logger.info('Processing late fees', { invoiceId });

    const invoiceResult = await pool.query(
      'SELECT due_date, amount, late_fee_applied FROM invoices WHERE id = $1',
      [invoiceId]
    );

    const invoice = invoiceResult.rows[0];
    const now = new Date();
    const dueDate = new Date(invoice.due_date);

    if (now > dueDate && !invoice.late_fee_applied) {
      const daysLate = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
      const lateFeePercentage = 0.015; // 1.5% per month
      const lateFee = invoice.amount * lateFeePercentage;

      // Apply late fee
      const feeResult = await pool.query(
        'INSERT INTO invoice_line_items (invoice_id, item_type, quantity, unit_price, description) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [invoiceId, 'late_fee', 1, lateFee, `Late fee - ${daysLate} days overdue`]
      );

      // Update invoice
      await pool.query(
        'UPDATE invoices SET late_fee_applied = true, late_fee_amount = $1 WHERE id = $2',
        [lateFee, invoiceId]
      );

      res.json({
        success: true,
        lateFeeId: feeResult.rows[0].id,
        daysLate,
        lateFee: lateFee.toFixed(2),
        message: 'Late fee applied'
      });
    } else {
      res.json({
        success: true,
        message: 'Invoice is not late or fee already applied'
      });
    }
  } catch (error) {
    logger.error('Late fees error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 7. Tax Calculation Automation
router.post('/tax-calculation', async (req, res) => {
  try {
    const { invoiceId, amount, jurisdiction } = req.body;
    logger.info('Calculating tax', { invoiceId, jurisdiction });

    // Simple tax rates by jurisdiction (in production, use tax API)
    const taxRates = {
      'CA': 0.0725,
      'NY': 0.08,
      'TX': 0.0625,
      'default': 0.07
    };

    const taxRate = taxRates[jurisdiction] || taxRates['default'];
    const taxAmount = amount * taxRate;

    // Insert tax line item
    const taxResult = await pool.query(
      'INSERT INTO invoice_line_items (invoice_id, item_type, quantity, unit_price, description) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [invoiceId, 'tax', 1, taxAmount, `Sales Tax (${jurisdiction}) - ${(taxRate * 100).toFixed(1)}%`]
    );

    res.json({
      success: true,
      taxId: taxResult.rows[0].id,
      jurisdiction,
      taxRate: (taxRate * 100).toFixed(2) + '%',
      taxAmount: taxAmount.toFixed(2),
      message: 'Tax calculated'
    });
  } catch (error) {
    logger.error('Tax calculation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8. Invoice PDF Generator
router.post('/pdf-generator', async (req, res) => {
  try {
    const { invoiceId } = req.body;
    logger.info('Generating invoice PDF', { invoiceId });

    const invoiceResult = await pool.query(
      'SELECT * FROM invoices WHERE id = $1',
      [invoiceId]
    );

    const invoice = invoiceResult.rows[0];

    // In production, use pdfkit or similar
    const pdfUrl = `https://invoices.deputy.com/pdf/${invoiceId}.pdf`;

    // Store PDF reference
    await pool.query(
      'UPDATE invoices SET pdf_url = $1, pdf_generated_at = NOW() WHERE id = $2',
      [pdfUrl, invoiceId]
    );

    res.json({
      success: true,
      invoiceId,
      pdfUrl,
      message: 'Invoice PDF generated'
    });
  } catch (error) {
    logger.error('PDF generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 9. Payment Receipt and Thank-You Automation
router.post('/payment-receipt', async (req, res) => {
  try {
    const { paymentId } = req.body;
    logger.info('Sending payment receipt', { paymentId });

    const paymentResult = await pool.query(
      'SELECT invoice_id, amount, payment_method, created_at FROM payments WHERE id = $1',
      [paymentId]
    );

    const payment = paymentResult.rows[0];

    const invoiceResult = await pool.query(
      'SELECT client_id FROM invoices WHERE id = $1',
      [payment.invoice_id]
    );

    const clientId = invoiceResult.rows[0].client_id;

    const clientResult = await pool.query(
      'SELECT email, first_name FROM users WHERE id = $1',
      [clientId]
    );

    const client = clientResult.rows[0];

    // Send receipt
    await sendEmail({
      to: client.email,
      subject: `Payment Receipt - Thank You`,
      template: 'payment_receipt',
      data: {
        clientName: client.first_name,
        amount: payment.amount.toFixed(2),
        paymentMethod: payment.payment_method,
        paymentDate: new Date(payment.created_at).toLocaleDateString(),
        invoiceId: payment.invoice_id
      }
    });

    res.json({
      success: true,
      paymentId,
      message: 'Receipt sent to client'
    });
  } catch (error) {
    logger.error('Payment receipt error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 10. Revenue Recognition Logger
router.post('/revenue-recognition', async (req, res) => {
  try {
    const { invoiceId, amount } = req.body;
    logger.info('Logging revenue recognition', { invoiceId, amount });

    // Create accounting entry
    const result = await pool.query(
      'INSERT INTO revenue_recognition (invoice_id, amount, recognized_at, status) VALUES ($1, $2, NOW(), $3) RETURNING id',
      [invoiceId, amount, 'recognized']
    );

    // For accounting system sync
    const journalEntry = {
      date: new Date(),
      account: 'Revenue',
      debit: null,
      credit: amount,
      description: `Revenue recognized - Invoice ${invoiceId}`
    };

    // Log to accounting sync queue
    await pool.query(
      'INSERT INTO accounting_sync_queue (journal_entry, status) VALUES ($1, $2)',
      [JSON.stringify(journalEntry), 'pending']
    );

    res.json({
      success: true,
      revenuId: result.rows[0].id,
      amount: amount.toFixed(2),
      message: 'Revenue recognized and logged'
    });
  } catch (error) {
    logger.error('Revenue recognition error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
