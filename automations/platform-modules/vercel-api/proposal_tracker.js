import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { logAction } from '../middleware/logging';
import { prisma } from '../lib/prisma';

const router = Router();

router.post('/webhook/opened', async (req, res) => {
  try {
    const { estimate, customer, sales_rep } = req.body;
    
    if (!estimate || !estimate.id) {
      return res.status(400).json({ error: 'Invalid estimate data' });
    }

    // Get current tracking data
    const tracking = await prisma.estimateTracking.findUnique({
      where: { estimateId: estimate.id },
    });

    const isFirstOpen = !tracking || tracking.viewCount === 0;
    const newViewCount = (tracking?.viewCount || 0) + 1;
    const isHotSignal = newViewCount >= 2;

    // Update tracking
    await prisma.estimateTracking.upsert({
      where: { estimateId: estimate.id },
      update: {
        viewCount: newViewCount,
        lastOpenedAt: new Date(),
      },
      create: {
        estimateId: estimate.id,
        customerId: customer.id,
        viewCount: 1,
        firstOpenedAt: new Date(),
      },
    });

    // First open alert
    if (isFirstOpen) {
      await prisma.queue.create({
        data: {
          type: 'EMAIL',
          businessId: estimate.businessId,
          scheduledFor: new Date(),
          payload: {
            to: sales_rep.email,
            subject: `HOT: ${customer.name} Opened Your Proposal`,
            template: 'proposal_first_opened_alert',
            variables: { estimate, customer, sales_rep },
          },
        },
      });
    }

    // Hot signal alert
    if (isHotSignal) {
      await prisma.queue.create({
        data: {
          type: 'EMAIL',
          businessId: estimate.businessId,
          scheduledFor: new Date(),
          payload: {
            to: sales_rep.email,
            subject: `HOT SIGNAL: ${customer.name} Reviewed Proposal ${newViewCount}x`,
            template: 'hot_signal_multiple_views',
            variables: { estimate, customer, sales_rep, viewCount: newViewCount },
          },
        },
      });

      // Tag as hot
      await prisma.estimate.update({
        where: { id: estimate.id },
        data: { tags: ['hot_signal'] },
      });
    }

    // Update CRM estimate
    await prisma.estimate.update({
      where: { id: estimate.id },
      data: {
        viewCount: newViewCount,
        lastViewedAt: new Date(),
      },
    });

    await logAction('proposal_tracker_opened', {
      estimateId: estimate.id,
      customerId: customer.id,
      viewCount: newViewCount,
      isFirstOpen,
      isHotSignal,
    });

    res.json({
      success: true,
      viewCount: newViewCount,
      isFirstOpen,
      isHotSignal,
    });
  } catch (error) {
    console.error('Proposal tracker error:', error);
    res.status(500).json({ error: 'Failed to track proposal' });
  }
});

router.get('/metrics/:estimateId', authenticateToken, async (req, res) => {
  try {
    const { estimateId } = req.params;

    const tracking = await prisma.estimateTracking.findUnique({
      where: { estimateId },
    });

    if (!tracking) {
      return res.status(404).json({ error: 'No tracking data' });
    }

    res.json({
      estimate_id: estimateId,
      view_count: tracking.viewCount,
      first_opened_at: tracking.firstOpenedAt,
      last_opened_at: tracking.lastOpenedAt,
      engagement_level: tracking.viewCount >= 3 ? 'HOT' : tracking.viewCount >= 1 ? 'WARM' : 'COLD',
    });
  } catch (error) {
    console.error('Metrics error:', error);
    res.status(500).json({ error: 'Failed to retrieve metrics' });
  }
});

export default router;
