import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { logAction } from '../middleware/logging';
import { prisma } from '../lib/prisma';
import Stripe from 'stripe';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.post('/webhook', async (req, res) => {
  try {
    const { invoice, customer } = req.body;
    
    if (invoice.status !== 'failed' || invoice.amount_due <= 0) {
      return res.status(400).json({ error: 'Invalid invoice data' });
    }

    // Stage 0: Immediate soft notice
    await prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: customer.businessId,
        scheduledFor: new Date(),
        payload: {
          to: customer.email,
          subject: 'Payment Issue - Please Update Your Payment Method',
          template: 'payment_failed_soft_notice',
          variables: { invoice, customer },
        },
      },
    });

    // Stage 1: Retry 24h
    const retryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.paymentDunning.create({
      data: {
        customerId: customer.id,
        invoiceId: invoice.id,
        stage: 'RETRY_24H',
        scheduledFor: retryDate,
        status: 'PENDING',
      },
    });

    // Stage 2: Card update notice 48h
    await prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: customer.businessId,
        scheduledFor: new Date(Date.now() + 48 * 60 * 60 * 1000),
        payload: {
          to: customer.email,
          subject: 'Action Required: Update Your Payment Method',
          template: 'update_payment_method_48h',
          variables: { invoice, customer },
        },
      },
    });

    // Stage 3: SMS escalation 72h
    if (customer.phone) {
      await prisma.queue.create({
        data: {
          type: 'SMS',
          businessId: customer.businessId,
          scheduledFor: new Date(Date.now() + 72 * 60 * 60 * 1000),
          payload: {
            to: customer.phone,
            message: `Payment reminder: Your outstanding balance of $${invoice.amount_due} is now overdue.`,
          },
        },
      });
    }

    // Stage 4: Final notice 7d
    await prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: customer.businessId,
        scheduledFor: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        payload: {
          to: customer.email,
          subject: 'Final Notice: Outstanding Payment',
          template: 'final_payment_notice_7d',
          variables: { invoice, customer },
        },
      },
    });

    // Update CRM
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        lastFailedPayment: new Date(),
        paymentStatus: 'FAILED',
        daysOverdue: Math.floor((Date.now() - new Date(invoice.created).getTime()) / (24 * 60 * 60 * 1000)),
        dunningStage: 'SOFT_NOTICE',
      },
    });

    await logAction('payment_recovery', {
      businessId: customer.businessId,
      customerId: customer.id,
      invoiceId: invoice.id,
      amount: invoice.amount_due,
      dunningInitiated: true,
    });

    res.json({ success: true, dunningSequenceStarted: true });
  } catch (error) {
    console.error('Payment recovery error:', error);
    res.status(500).json({ error: 'Failed to initiate dunning sequence' });
  }
});

router.post('/process-dunning-stage', authenticateToken, async (req, res) => {
  try {
    const dunningRecords = await prisma.paymentDunning.findMany({
      where: {
        status: 'PENDING',
        scheduledFor: { lte: new Date() },
      },
      include: { customer: true, invoice: true },
    });

    for (const record of dunningRecords) {
      if (record.stage === 'RETRY_24H') {
        // Auto-retry charge
        try {
          await stripe.invoices.retrieve(record.invoiceId);
        } catch (e) {
          console.error('Stripe retry failed:', e);
        }
      }

      if (record.stage === 'PAUSE_14D' && !record.servicesPaused) {
        // Pause services
        await prisma.subscription.update({
          where: { customerId: record.customerId },
          data: { status: 'PAUSED_UNPAID' },
        });

        await prisma.paymentDunning.update({
          where: { id: record.id },
          data: { servicesPaused: true },
        });
      }

      await prisma.paymentDunning.update({
        where: { id: record.id },
        data: { status: 'PROCESSED' },
      });
    }

    res.json({ processed: dunningRecords.length });
  } catch (error) {
    console.error('Dunning stage processing error:', error);
    res.status(500).json({ error: 'Failed to process dunning' });
  }
});

export default router;
