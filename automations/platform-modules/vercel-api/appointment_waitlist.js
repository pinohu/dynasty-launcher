import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { logAction } from '../middleware/logging';
import { prisma } from '../lib/prisma';

const router = Router();

router.post('/webhook', async (req, res) => {
  try {
    const { appointment, business, provider, cancelled_date } = req.body;
    
    if (appointment.status !== 'cancelled') {
      return res.status(400).json({ error: 'Invalid appointment status' });
    }

    // Find next waitlisted customer
    const nextInWaitlist = await prisma.waitlist.findFirst({
      where: {
        businessId: business.id,
        serviceType: appointment.service_type,
        status: 'WAITING',
      },
      orderBy: { createdAt: 'asc' },
      include: { customer: true },
    });

    if (!nextInWaitlist) {
      return res.status(200).json({ message: 'No waitlist customers for this service' });
    }

    // Send offer email
    await prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: business.id,
        scheduledFor: new Date(),
        payload: {
          to: nextInWaitlist.customer.email,
          subject: 'Good News! A Spot Just Opened Up',
          template: 'slot_available_offer',
          variables: {
            customer: nextInWaitlist.customer,
            appointment,
          },
        },
      },
    });

    // Send SMS
    if (nextInWaitlist.customer.phone) {
      await prisma.queue.create({
        data: {
          type: 'SMS',
          businessId: business.id,
          scheduledFor: new Date(),
          payload: {
            to: nextInWaitlist.customer.phone,
            message: `A spot opened for ${appointment.service_type} on ${appointment.date} at ${appointment.time}. Confirm: {booking_link}`,
          },
        },
      });
    }

    // Create slot offer tracking
    const slotOffer = await prisma.slotOffer.create({
      data: {
        businessId: business.id,
        customerId: nextInWaitlist.customerId,
        appointmentDate: appointment.date,
        appointmentTime: appointment.time,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        status: 'OFFERED',
      },
    });

    // Mark waitlist as offered
    await prisma.waitlist.update({
      where: { id: nextInWaitlist.id },
      data: { status: 'OFFERED' },
    });

    await logAction('appointment_waitlist', {
      businessId: business.id,
      appointmentId: appointment.id,
      customerId: nextInWaitlist.customerId,
      slotOffered: true,
      expiresAt: slotOffer.expiresAt,
    });

    res.json({
      success: true,
      slotOffered: true,
      customerId: nextInWaitlist.customerId,
      expiresAt: slotOffer.expiresAt,
    });
  } catch (error) {
    console.error('Appointment waitlist error:', error);
    res.status(500).json({ error: 'Failed to offer slot' });
  }
});

router.post('/:customerId/confirm', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { appointmentDate, appointmentTime, slotOfferId } = req.body;

    // Confirm slot offer
    const slotOffer = await prisma.slotOffer.update({
      where: { id: slotOfferId },
      data: { status: 'CONFIRMED' },
      include: { customer: true },
    });

    // Create appointment
    const appointment = await prisma.appointment.create({
      data: {
        businessId: slotOffer.businessId,
        customerId,
        startTime: new Date(`${appointmentDate}T${appointmentTime}`),
        status: 'CONFIRMED',
      },
    });

    // Update waitlist
    await prisma.waitlist.updateMany({
      where: { customerId },
      data: { status: 'FULFILLED' },
    });

    res.json({
      success: true,
      appointmentId: appointment.id,
      message: 'Appointment confirmed',
    });
  } catch (error) {
    console.error('Confirmation error:', error);
    res.status(500).json({ error: 'Failed to confirm appointment' });
  }
});

export default router;
