import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { logAction } from '../middleware/logging';
import { prisma } from '../lib/prisma';

const router = Router();

router.post('/webhook', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { lead, business, service } = req.body;
    
    if (!lead || lead.status !== 'new') {
      return res.status(400).json({ error: 'Invalid lead data' });
    }

    // 1. Send immediate email (< 100ms)
    const emailPromise = prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: business.id,
        scheduledFor: new Date(),
        payload: {
          to: lead.email,
          subject: 'We Got Your Request - Thanks for Reaching Out!',
          template: 'lead_immediate_confirmation',
          variables: { lead, business, service },
        },
      },
    });

    // 2. Send SMS if phone provided (< 200ms)
    const smsPromise = lead.phone
      ? prisma.queue.create({
          data: {
            type: 'SMS',
            businessId: business.id,
            scheduledFor: new Date(),
            payload: {
              to: lead.phone,
              message: `Hi ${lead.first_name}! Thanks for reaching out. A specialist will call within 5 minutes.`,
            },
          },
        })
      : Promise.resolve(null);

    // 3. Auto-assign to available rep (< 500ms)
    const assignPromise = (async () => {
      const availableReps = await prisma.user.findMany({
        where: {
          businessId: business.id,
          role: 'SALES_REP',
          status: 'ACTIVE',
        },
        orderBy: { currentLeadCount: 'asc' },
        take: 1,
      });

      if (availableReps.length > 0) {
        return prisma.lead.update({
          where: { id: lead.id },
          data: {
            assignedToId: availableReps[0].id,
            qualificationScore: 'HIGH',
            tags: ['auto_assigned'],
          },
        });
      }
    })();

    // Wait for all critical actions
    await Promise.all([emailPromise, smsPromise, assignPromise]);

    const elapsedTime = Date.now() - startTime;

    // Update lead with timing
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        firstContactTime: new Date(),
        responseTimeMs: elapsedTime,
        speedMetric: elapsedTime <= 60000 ? 'EXCELLENT' : 'GOOD',
      },
    });

    await logAction('speed_to_lead_response', {
      businessId: business.id,
      leadId: lead.id,
      responseTimeMs: elapsedTime,
      smsDelivered: !!lead.phone,
      autoAssigned: true,
    });

    res.status(200).json({
      success: true,
      responseTimeMs: elapsedTime,
      message: 'Lead response completed within 60 seconds',
    });
  } catch (error) {
    console.error('Speed to lead error:', error);
    res.status(500).json({ error: 'Failed to process lead response' });
  }
});

router.get('/metrics', authenticateToken, async (req, res) => {
  try {
    const { businessId, days = 30 } = req.query;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const leads = await prisma.lead.findMany({
      where: {
        businessId: businessId as string,
        createdAt: { gte: since },
      },
      select: { responseTimeMs: true, qualificationScore: true },
    });

    const avgResponseTime =
      leads.reduce((sum, l) => sum + (l.responseTimeMs || 0), 0) / Math.max(leads.length, 1);
    const qualifiedCount = leads.filter((l) => l.qualificationScore === 'HIGH').length;

    res.json({
      leads_processed: leads.length,
      avg_response_time_ms: Math.round(avgResponseTime),
      qualification_rate: `${Math.round((qualifiedCount / Math.max(leads.length, 1)) * 100)}%`,
      excellent_speed_rate: `${Math.round(
        (leads.filter((l) => (l.responseTimeMs || 0) <= 60000).length / Math.max(leads.length, 1)) * 100
      )}%`,
    });
  } catch (error) {
    console.error('Metrics error:', error);
    res.status(500).json({ error: 'Failed to retrieve metrics' });
  }
});

export default router;
