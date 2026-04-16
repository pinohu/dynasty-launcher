import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { logAction } from '../middleware/logging';
import { prisma } from '../lib/prisma';

const router = Router();

router.post('/webhook', async (req, res) => {
  try {
    const { estimate, customer, sales_rep, service } = req.body;
    
    if (estimate.status !== 'sent') {
      return res.status(400).json({ error: 'Invalid estimate status' });
    }

    const sentDate = new Date(estimate.created_at);

    // Day 2 check-in
    await prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: estimate.businessId,
        scheduledFor: new Date(sentDate.getTime() + 2 * 24 * 60 * 60 * 1000),
        payload: {
          to: customer.email,
          subject: 'Quick Question About Your Estimate',
          template: 'estimate_day2_checkin',
          variables: { customer, estimate, service },
          trackOpens: true,
        },
      },
    });

    // Day 5 value add
    await prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: estimate.businessId,
        scheduledFor: new Date(sentDate.getTime() + 5 * 24 * 60 * 60 * 1000),
        payload: {
          to: customer.email,
          subject: `See How Others Saved on ${service.type}`,
          template: 'estimate_day5_value_add',
          variables: { customer, estimate, service },
          trackOpens: true,
        },
      },
    });

    // Day 10 urgency
    await prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: estimate.businessId,
        scheduledFor: new Date(sentDate.getTime() + 10 * 24 * 60 * 60 * 1000),
        payload: {
          to: customer.email,
          subject: `${service.type} - Limited Time Availability`,
          template: 'estimate_day10_urgency',
          variables: { customer, estimate, service },
          trackOpens: true,
        },
      },
    });

    // Day 14 final
    await prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: estimate.businessId,
        scheduledFor: new Date(sentDate.getTime() + 14 * 24 * 60 * 60 * 1000),
        payload: {
          to: customer.email,
          subject: `Final: Your ${service.type} Estimate Expires Soon`,
          template: 'estimate_day14_final',
          variables: { customer, estimate, service },
          trackOpens: true,
        },
      },
    });

    // Log to CRM
    await prisma.estimate.update({
      where: { id: estimate.id },
      data: { status: 'IN_FOLLOWUP', followUpInitiated: true },
    });

    await logAction('estimate_followup', {
      businessId: estimate.businessId,
      estimateId: estimate.id,
      customerId: customer.id,
      sequenceInitiated: true,
    });

    res.json({ success: true, sequenceInitiated: true });
  } catch (error) {
    console.error('Estimate follow-up error:', error);
    res.status(500).json({ error: 'Failed to initiate follow-up' });
  }
});

router.get('/engagement/:estimateId', authenticateToken, async (req, res) => {
  try {
    const { estimateId } = req.params;

    const engagement = await prisma.estimateEngagement.findUnique({
      where: { estimateId },
    });

    if (!engagement) {
      return res.status(404).json({ error: 'No engagement data' });
    }

    res.json({
      estimate_id: estimateId,
      opens: engagement.openCount,
      last_opened: engagement.lastOpenedAt,
      click_count: engagement.clickCount,
      conversion_status: engagement.openCount >= 2 ? 'HOT' : 'WARM',
    });
  } catch (error) {
    console.error('Engagement tracking error:', error);
    res.status(500).json({ error: 'Failed to retrieve engagement data' });
  }
});

export default router;
