import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { logAction } from '../middleware/logging';
import { prisma } from '../lib/prisma';

const router = Router();

router.post('/webhook', async (req, res) => {
  try {
    const { customer, business, service } = req.body;
    
    if (!customer || customer.status !== 'new') {
      return res.status(400).json({ error: 'Invalid customer data' });
    }

    const referralLink = `${process.env.BASE_URL}/referral/${customer.id}`;
    const referralIncentive = '$50 credit';

    // Day 0: Welcome email
    await prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: business.id,
        scheduledFor: new Date(),
        payload: {
          to: customer.email,
          subject: `Welcome to ${business.name}, ${customer.first_name}!`,
          template: 'welcome_email_personalized',
          variables: { customer, business, service },
        },
      },
    });

    // Day 3: Check-in email
    await prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: business.id,
        scheduledFor: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        payload: {
          to: customer.email,
          subject: `How's Everything Going, ${customer.first_name}?`,
          template: 'welcome_day3_checkin',
          variables: { customer },
        },
      },
    });

    // Day 3: SMS check-in
    if (customer.phone) {
      await prisma.queue.create({
        data: {
          type: 'SMS',
          businessId: business.id,
          scheduledFor: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          payload: {
            to: customer.phone,
            message: `Hi ${customer.first_name}! How's everything? Reply with any questions.`,
          },
        },
      });
    }

    // Day 7: Tips email
    await prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: business.id,
        scheduledFor: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        payload: {
          to: customer.email,
          subject: `Pro Tips for Your ${service.type}`,
          template: 'welcome_day7_tips',
          variables: { customer, service },
        },
      },
    });

    // Day 14: Review request
    await prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: business.id,
        scheduledFor: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        payload: {
          to: customer.email,
          subject: `${customer.first_name}, Your Feedback Matters`,
          template: 'review_request_email',
          variables: { customer },
        },
      },
    });

    // Day 30: Referral program
    await prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: business.id,
        scheduledFor: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        payload: {
          to: customer.email,
          subject: 'Refer Friends, Earn Rewards!',
          template: 'referral_program_intro',
          variables: { customer, referralLink, referralIncentive },
        },
      },
    });

    // Update CRM
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        welcomeSequenceStarted: new Date(),
        sequenceStage: 'WELCOME_INITIATED',
        lifecycleStage: 'ONBOARDING',
      },
    });

    await logAction('client_welcome_sequence', {
      businessId: business.id,
      customerId: customer.id,
      sequenceInitiated: true,
      serviceType: service.type,
    });

    res.json({
      success: true,
      sequenceInitiated: true,
      touchpoints: 5,
    });
  } catch (error) {
    console.error('Welcome sequence error:', error);
    res.status(500).json({ error: 'Failed to initiate welcome sequence' });
  }
});

router.get('/progress/:customerId', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        welcomeSequenceStarted: true,
        sequenceStage: true,
      },
    });

    if (!customer || !customer.welcomeSequenceStarted) {
      return res.status(404).json({ error: 'No welcome sequence' });
    }

    const elapsedDays = Math.floor((Date.now() - customer.welcomeSequenceStarted.getTime()) / (24 * 60 * 60 * 1000));

    res.json({
      customer_id: customerId,
      sequence_started: customer.welcomeSequenceStarted,
      current_stage: customer.sequenceStage,
      days_elapsed: elapsedDays,
      progress_percent: Math.min((elapsedDays / 30) * 100, 100),
    });
  } catch (error) {
    console.error('Progress error:', error);
    res.status(500).json({ error: 'Failed to retrieve progress' });
  }
});

export default router;
