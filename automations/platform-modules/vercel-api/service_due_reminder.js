import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { logAction } from '../middleware/logging';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/due-for-service', authenticateToken, async (req, res) => {
  try {
    const { days = 30, businessId } = req.query;
    const targetDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const startDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

    const customers = await prisma.customer.findMany({
      where: {
        businessId: businessId as string,
        serviceDueDate: { gte: startDate, lte: targetDate },
      },
      include: { services: true },
    });

    res.json({
      count: customers.length,
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        service_due_date: c.serviceDueDate,
        service_type: c.services[0]?.type || 'Unknown',
      })),
    });
  } catch (error) {
    console.error('Get due customers error:', error);
    res.status(500).json({ error: 'Failed to retrieve due customers' });
  }
});

router.post('/send-reminders', authenticateToken, async (req, res) => {
  try {
    const { businessId, days } = req.body;

    const customers = await prisma.customer.findMany({
      where: {
        businessId,
        serviceDueDate: {
          gte: new Date(Date.now() + (days - 1) * 24 * 60 * 60 * 1000),
          lte: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        },
      },
    });

    let sent = 0;

    for (const customer of customers) {
      const template =
        days === 30
          ? 'service_due_30day'
          : days === 14
            ? 'service_due_14day'
            : 'service_due_7day';

      const channel = days === 7 ? 'SMS' : 'EMAIL';

      await prisma.queue.create({
        data: {
          type: channel,
          businessId,
          scheduledFor: new Date(),
          payload: {
            to: channel === 'EMAIL' ? customer.email : customer.phone,
            subject:
              channel === 'EMAIL'
                ? `Reminder: Your Service is Due in ${days} Days`
                : undefined,
            template,
            variables: { customer, days },
          },
        },
      });

      // Update CRM
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          lastReminderSent: new Date(),
          daysUntilDue: days,
          reminderStage: `${days}_DAY`,
        },
      });

      sent++;
    }

    await logAction('service_due_reminder', {
      businessId,
      remindersDays: days,
      customerCount: sent,
    });

    res.json({
      success: true,
      reminders_sent: sent,
    });
  } catch (error) {
    console.error('Send reminders error:', error);
    res.status(500).json({ error: 'Failed to send reminders' });
  }
});

export default router;
