import express from 'express';
import { Pool } from '@neondatabase/serverless';
import nodemailer from 'nodemailer';
import axios from 'axios';

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const mailer = nodemailer.createTransport({
  host: 'smtp.acumbamail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.ACUMBAMAIL_USER,
    pass: process.env.ACUMBAMAIL_PASS
  }
});

// 1. Self-service booking page handler
router.post('/api/appointments/book', async (req, res) => {
  try {
    const { clientName, clientEmail, clientPhone, serviceType, preferredDate, duration } = req.body;

    // Create appointment in Trafft
    const trafftResponse = await axios.post(
      'https://api.trafft.com/v1/appointments',
      {
        service_type: serviceType,
        start_time: new Date(preferredDate),
        duration: duration || 60,
        client_name: clientName,
        client_email: clientEmail,
        client_phone: clientPhone
      },
      {
        headers: { Authorization: `Bearer ${process.env.TRAFFT_API_KEY}` }
      }
    );

    // Save to local database
    const result = await pool.query(
      `INSERT INTO appointments
       (client_name, client_email, client_phone, service_type, start_time, duration, trafft_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [clientName, clientEmail, clientPhone, serviceType, preferredDate, duration || 60, trafftResponse.data.id, 'scheduled']
    );

    res.json({ success: true, appointment: result.rows[0] });
  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Send appointment confirmation
router.post('/api/appointments/:id/send-confirmation', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM appointments WHERE id = $1',
      [id]
    );
    const appointment = result.rows[0];

    const startTime = new Date(appointment.start_time);
    const endTime = new Date(startTime.getTime() + appointment.duration * 60000);

    // Send email
    await mailer.sendMail({
      to: appointment.client_email,
      subject: 'Your Appointment Confirmed',
      html: `
        <h2>Appointment Confirmed!</h2>
        <p><strong>Service:</strong> ${appointment.service_type}</p>
        <p><strong>Date:</strong> ${startTime.toDateString()}</p>
        <p><strong>Time:</strong> ${startTime.toLocaleTimeString()} - ${endTime.toLocaleTimeString()}</p>
        <p><strong>Duration:</strong> ${appointment.duration} minutes</p>
        <p><a href="${process.env.APP_URL}/appointments/${id}">View Details</a></p>
      `
    });

    // Send SMS
    if (appointment.client_phone) {
      await axios.post(
        'https://api.sms-it.com/send',
        {
          to: appointment.client_phone,
          message: `Your appointment is confirmed for ${startTime.toDateString()} at ${startTime.toLocaleTimeString()}.`
        },
        {
          headers: { Authorization: `Bearer ${process.env.SMS_IT_API_KEY}` }
        }
      );
    }

    // Generate ICS calendar file
    const uid = `appointment-${id}@deputy.app`;
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Deputy//Appointments//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z
DTSTART:${startTime.toISOString().replace(/[-:]/g, '').split('.')[0]}Z
DTEND:${endTime.toISOString().replace(/[-:]/g, '').split('.')[0]}Z
SUMMARY:${appointment.service_type}
DESCRIPTION:Service appointment
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;

    await pool.query(
      'UPDATE appointments SET confirmation_sent = true, confirmation_sent_at = NOW() WHERE id = $1',
      [id]
    );

    res.json({ success: true, icsContent });
  } catch (error) {
    console.error('Confirmation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Multi-step reminder sequence
router.get('/api/appointments/reminders/send', async (req, res) => {
  try {
    const now = new Date();

    // 24-hour reminder
    const remind24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const remind24hResult = await pool.query(
      `SELECT * FROM appointments
       WHERE start_time >= $1 AND start_time < $2 AND status = $3 AND reminder_24h_sent = false`,
      [
        new Date(remind24h.getTime() - 30 * 60 * 1000),
        new Date(remind24h.getTime() + 30 * 60 * 1000),
        'scheduled'
      ]
    );

    for (const appt of remind24hResult.rows) {
      await mailer.sendMail({
        to: appt.client_email,
        subject: 'Reminder: Your Appointment is Tomorrow',
        html: `<p>Your appointment is scheduled for tomorrow at ${new Date(appt.start_time).toLocaleTimeString()}.</p>`
      });

      await pool.query(
        'UPDATE appointments SET reminder_24h_sent = true WHERE id = $1',
        [appt.id]
      );
    }

    // 2-hour reminder
    const remind2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const remind2hResult = await pool.query(
      `SELECT * FROM appointments
       WHERE start_time >= $1 AND start_time < $2 AND status = $3 AND reminder_2h_sent = false`,
      [
        new Date(remind2h.getTime() - 15 * 60 * 1000),
        new Date(remind2h.getTime() + 15 * 60 * 1000),
        'scheduled'
      ]
    );

    for (const appt of remind2hResult.rows) {
      await mailer.sendMail({
        to: appt.client_email,
        subject: 'Reminder: Your Appointment is in 2 Hours',
        html: `<p>Your appointment is in 2 hours at ${new Date(appt.start_time).toLocaleTimeString()}.</p>`
      });

      await pool.query(
        'UPDATE appointments SET reminder_2h_sent = true WHERE id = $1',
        [appt.id]
      );
    }

    // 30-minute reminder
    const remind30m = new Date(now.getTime() + 30 * 60 * 1000);
    const remind30mResult = await pool.query(
      `SELECT * FROM appointments
       WHERE start_time >= $1 AND start_time < $2 AND status = $3 AND reminder_30m_sent = false`,
      [
        new Date(remind30m.getTime() - 5 * 60 * 1000),
        new Date(remind30m.getTime() + 5 * 60 * 1000),
        'scheduled'
      ]
    );

    for (const appt of remind30mResult.rows) {
      if (appt.client_phone) {
        await axios.post(
          'https://api.sms-it.com/send',
          {
            to: appt.client_phone,
            message: `Reminder: Your appointment starts in 30 minutes.`
          },
          {
            headers: { Authorization: `Bearer ${process.env.SMS_IT_API_KEY}` }
          }
        );
      }

      await pool.query(
        'UPDATE appointments SET reminder_30m_sent = true WHERE id = $1',
        [appt.id]
      );
    }

    res.json({
      success: true,
      sent24h: remind24hResult.rows.length,
      sent2h: remind2hResult.rows.length,
      sent30m: remind30mResult.rows.length
    });
  } catch (error) {
    console.error('Reminder send error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Reschedule handler
router.post('/api/appointments/:id/reschedule', async (req, res) => {
  try {
    const { id } = req.params;
    const { newStartTime } = req.body;

    const result = await pool.query(
      'SELECT * FROM appointments WHERE id = $1',
      [id]
    );
    const appointment = result.rows[0];

    // Update in Trafft
    await axios.put(
      `https://api.trafft.com/v1/appointments/${appointment.trafft_id}`,
      { start_time: new Date(newStartTime) },
      { headers: { Authorization: `Bearer ${process.env.TRAFFT_API_KEY}` } }
    );

    // Update locally
    await pool.query(
      `UPDATE appointments SET start_time = $1, status = $2, rescheduled_at = NOW() WHERE id = $3`,
      [newStartTime, 'rescheduled', id]
    );

    // Notify all parties
    await mailer.sendMail({
      to: appointment.client_email,
      subject: 'Your Appointment Has Been Rescheduled',
      html: `<p>Your appointment has been moved to ${new Date(newStartTime).toDateString()} at ${new Date(newStartTime).toLocaleTimeString()}.</p>`
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Reschedule error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. No-show detection and recovery
router.post('/api/appointments/:id/mark-noshow', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM appointments WHERE id = $1',
      [id]
    );
    const appointment = result.rows[0];

    // Update status
    await pool.query(
      'UPDATE appointments SET status = $1, no_show_at = NOW() WHERE id = $2',
      ['no_show', id]
    );

    // Send recovery email
    await mailer.sendMail({
      to: appointment.client_email,
      subject: 'We Missed You - Let\'s Reschedule',
      html: `
        <h2>We Missed You</h2>
        <p>We noticed you couldn't make it to your appointment on ${new Date(appointment.start_time).toDateString()}.</p>
        <p><a href="${process.env.APP_URL}/appointments/reschedule?id=${id}">Reschedule Now</a></p>
      `
    });

    // Increment no-show counter
    await pool.query(
      `UPDATE clients SET no_show_count = COALESCE(no_show_count, 0) + 1 WHERE id = (
        SELECT client_id FROM appointments WHERE id = $1
      )`,
      [id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('No-show error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Waitlist management
router.post('/api/waitlist/check-and-notify', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM waitlist
       ORDER BY added_at ASC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, notified: 0 });
    }

    const waitlistEntry = result.rows[0];

    // Send notification
    await mailer.sendMail({
      to: waitlistEntry.email,
      subject: 'A Slot Just Opened Up!',
      html: `
        <h2>Great News!</h2>
        <p>We have availability that matches your request.</p>
        <p><a href="${process.env.APP_URL}/appointments/book?waitlist=${waitlistEntry.id}">Book Now</a></p>
      `
    });

    // Update waitlist entry
    await pool.query(
      'UPDATE waitlist SET notified = true, notified_at = NOW() WHERE id = $1',
      [waitlistEntry.id]
    );

    res.json({ success: true, notified: 1 });
  } catch (error) {
    console.error('Waitlist error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 7. Buffer time enforcement
router.post('/api/appointments/check-buffers', async (req, res) => {
  try {
    const bufferMinutes = req.body.bufferMinutes || 30;

    const result = await pool.query(
      `SELECT a1.*, a2.id as conflict_id
       FROM appointments a1
       JOIN appointments a2 ON
         a1.staff_id = a2.staff_id AND
         a1.id != a2.id AND
         ABS(EXTRACT(EPOCH FROM (a1.start_time - a2.start_time))) < ($1 * 60)
       WHERE a1.status IN ('scheduled', 'rescheduled')`,
      [bufferMinutes]
    );

    const conflicts = result.rows;

    for (const conflict of conflicts) {
      // Auto-reschedule conflicting appointment
      const newTime = new Date(conflict.start_time);
      newTime.setMinutes(newTime.getMinutes() + conflict.duration + bufferMinutes);

      await pool.query(
        `UPDATE appointments SET start_time = $1, status = $2 WHERE id = $3`,
        [newTime, 'rescheduled', conflict.conflict_id]
      );
    }

    res.json({ success: true, resolved: conflicts.length });
  } catch (error) {
    console.error('Buffer check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8. Smart multi-staff load balancing
router.post('/api/appointments/assign-staff', async (req, res) => {
  try {
    const { appointmentId, preferredStaffId } = req.body;

    // Get available staff with least current load
    const staffResult = await pool.query(
      `SELECT s.*,
              COUNT(a.id) as current_load
       FROM staff s
       LEFT JOIN appointments a ON s.id = a.staff_id AND a.status = 'scheduled'
       GROUP BY s.id
       ORDER BY current_load ASC
       LIMIT 1`
    );

    const staff = staffResult.rows[0];
    if (!staff) return res.status(404).json({ error: 'No staff available' });

    // Assign appointment
    await pool.query(
      'UPDATE appointments SET staff_id = $1 WHERE id = $2',
      [staff.id, appointmentId]
    );

    res.json({ success: true, assignedTo: staff.id, currentLoad: staff.current_load });
  } catch (error) {
    console.error('Staff assignment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 9. Recurring appointment scheduler
router.post('/api/appointments/:id/make-recurring', async (req, res) => {
  try {
    const { id } = req.params;
    const { frequency, occurrences } = req.body; // e.g., weekly, monthly

    const appointmentResult = await pool.query(
      'SELECT * FROM appointments WHERE id = $1',
      [id]
    );
    const original = appointmentResult.rows[0];

    const recurring = [];

    for (let i = 1; i < occurrences; i++) {
      const nextDate = new Date(original.start_time);

      if (frequency === 'weekly') {
        nextDate.setDate(nextDate.getDate() + 7 * i);
      } else if (frequency === 'monthly') {
        nextDate.setMonth(nextDate.getMonth() + i);
      } else if (frequency === 'daily') {
        nextDate.setDate(nextDate.getDate() + i);
      }

      const recurResult = await pool.query(
        `INSERT INTO appointments
         (client_name, client_email, client_phone, service_type, start_time, duration, recurring_parent_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING *`,
        [original.client_name, original.client_email, original.client_phone, original.service_type, nextDate, original.duration, id, 'scheduled']
      );

      recurring.push(recurResult.rows[0]);
    }

    res.json({ success: true, created: recurring.length });
  } catch (error) {
    console.error('Recurring schedule error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 10. Travel time calculator
router.post('/api/appointments/calculate-travel-time', async (req, res) => {
  try {
    const { fromLocation, toLocation } = req.body;

    // Use Google Maps API or similar
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/distancematrix/json`,
      {
        params: {
          origins: fromLocation,
          destinations: toLocation,
          key: process.env.GOOGLE_MAPS_API_KEY
        }
      }
    );

    const travelTimeSeconds = response.data.rows[0].elements[0].duration.value;
    const travelTimeMinutes = Math.ceil(travelTimeSeconds / 60);

    res.json({
      success: true,
      travelTimeMinutes,
      distanceMeters: response.data.rows[0].elements[0].distance.value
    });
  } catch (error) {
    console.error('Travel time error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
