import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { logAction } from '../middleware/logging';
import { prisma } from '../lib/prisma';

const router = Router();

/**
 * POST /api/unhappy-customer-interception/webhook
 * Receives review.submitted webhook from Google Business Profile
 */
router.post('/webhook', async (req, res) => {
  try {
    const { review, customer, business, owner } = req.body;
    
    if (!review || !review.rating || review.rating > 3) {
      return res.status(400).json({ error: 'Invalid review data or rating > 3' });
    }

    // 1. Create immediate owner alert
    await prisma.notification.create({
      data: {
        type: 'REVIEW_ALERT',
        businessId: business.id,
        userId: owner.id,
        title: `Low Rating Review: ${review.rating}/5`,
        message: `${customer.name} left a ${review.rating}-star review: "${review.text.substring(0, 100)}..."`,
        metadata: { reviewId: review.id, customerId: customer.id },
        priority: 'HIGH',
        read: false,
      },
    });

    // 2. Send empathetic response email (5min delay)
    const emailQueue = await prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: business.id,
        scheduledFor: new Date(Date.now() + 5 * 60 * 1000),
        payload: {
          to: customer.email,
          subject: `We Want to Make This Right, ${customer.first_name}`,
          template: 'empathetic_response_review',
          variables: { customer, review, business },
        },
      },
    });

    // 3. Create recovery task in CRM
    const task = await prisma.crmTask.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        title: `Customer Recovery: ${customer.name}`,
        description: `Review rating ${review.rating}/5: ${review.text}`,
        priority: 'HIGH',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        tags: ['customer_recovery', 'urgent'],
        status: 'PENDING',
      },
    });

    // 4. Check VIP status and escalate
    const customerRecord = await prisma.customer.findUnique({
      where: { id: customer.id },
      include: { business: true },
    });

    if (customerRecord?.vipStatus) {
      // Send SMS to manager
      await prisma.queue.create({
        data: {
          type: 'SMS',
          businessId: business.id,
          scheduledFor: new Date(),
          payload: {
            to: owner.phone,
            message: `URGENT: VIP customer ${customer.name} left ${review.rating}★ review. Please review & respond immediately.`,
          },
        },
      });

      // Update escalation flag
      await prisma.customer.update({
        where: { id: customer.id },
        data: { escalationLevel: 'VIP_RECOVERY' },
      });
    }

    // 5. Log to CRM
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        lastReviewRating: review.rating,
        lastReviewDate: new Date(review.submittedAt),
        reviewStatus: 'LOW_RATING_DETECTED',
        requiresFollowup: true,
      },
    });

    // 6. Log action for observability
    await logAction('unhappy_customer_interception', {
      businessId: business.id,
      customerId: customer.id,
      reviewRating: review.rating,
      vipStatus: customerRecord?.vipStatus || false,
      actionsTriggered: ['alert', 'email_queue', 'task_created', 'crm_updated'],
    });

    res.json({
      success: true,
      taskId: task.id,
      message: 'Recovery protocol initiated',
    });
  } catch (error) {
    console.error('Unhappy customer interception error:', error);
    res.status(500).json({ error: 'Failed to process review' });
  }
});

/**
 * GET /api/unhappy-customer-interception/metrics
 * Retrieve recovery metrics
 */
router.get('/metrics', authenticateToken, async (req, res) => {
  try {
    const { businessId, days = 30 } = req.query;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const metrics = await prisma.crmTask.groupBy({
      by: ['priority'],
      where: {
        businessId: businessId as string,
        tags: { has: 'customer_recovery' },
        createdAt: { gte: since },
      },
      _count: true,
    });

    const lowRatings = await prisma.customer.findMany({
      where: {
        businessId: businessId as string,
        lastReviewDate: { gte: since },
        lastReviewRating: { lte: 3 },
      },
      select: { id: true, name: true, lastReviewRating: true, lastReviewDate: true },
    });

    res.json({
      total_reviews_processed: lowRatings.length,
      low_ratings_detected: lowRatings.length,
      recovery_rate: `${Math.round((metrics.length / Math.max(lowRatings.length, 1)) * 100)}%`,
      by_priority: metrics,
      recent_recoveries: lowRatings.slice(0, 10),
    });
  } catch (error) {
    console.error('Metrics error:', error);
    res.status(500).json({ error: 'Failed to retrieve metrics' });
  }
});

export default router;
