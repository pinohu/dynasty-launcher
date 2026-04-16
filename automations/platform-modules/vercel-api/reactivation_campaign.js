import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { logAction } from '../middleware/logging';
import { prisma } from '../lib/prisma';

const router = Router();

router.post('/webhook', async (req, res) => {
  try {
    const { customer, business, days_inactive } = req.body;
    
    if (days_inactive < 90) {
      return res.status(400).json({ error: 'Customer not inactive enough' });
    }

    const promoCode = `COMEBACK${Math.random().toString(36).substring(7).toUpperCase()}`;

    // Touch 1: We Miss You
    await prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: business.id,
        scheduledFor: new Date(),
        payload: {
          to: customer.email,
          subject: `We Miss You, ${customer.first_name}!`,
          template: 'reactivation_touch1_wemissyou',
          variables: { customer, business, days_inactive },
        },
      },
    });

    // Touch 2: Special Offer (3 days)
    await prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: business.id,
        scheduledFor: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        payload: {
          to: customer.email,
          subject: 'Come Back for 15% Off Your Next Service',
          template: 'reactivation_touch2_offer',
          variables: { customer, promoCode },
        },
      },
    });

    // Touch 3: Last Chance (7 days)
    await prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: business.id,
        scheduledFor: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        payload: {
          to: customer.email,
          subject: 'Last Chance: 15% Off Expires Tomorrow',
          template: 'reactivation_touch3_last_chance',
          variables: { customer, promoCode },
        },
      },
    });

    // SMS Backup (10 days)
    if (customer.phone) {
      await prisma.queue.create({
        data: {
          type: 'SMS',
          businessId: business.id,
          scheduledFor: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
          payload: {
            to: customer.phone,
            message: `Last chance! 15% off with code: ${promoCode}`,
          },
        },
      });
    }

    // Update CRM
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        reactivationCampaignStarted: new Date(),
        campaignStatus: 'ACTIVE',
        promoCode,
      },
    });

    await logAction('reactivation_campaign', {
      businessId: business.id,
      customerId: customer.id,
      daysInactive: days_inactive,
      campaignInitiated: true,
      promoCode,
    });

    res.json({
      success: true,
      campaignInitiated: true,
      promoCode,
    });
  } catch (error) {
    console.error('Reactivation campaign error:', error);
    res.status(500).json({ error: 'Failed to initiate campaign' });
  }
});

export default router;
