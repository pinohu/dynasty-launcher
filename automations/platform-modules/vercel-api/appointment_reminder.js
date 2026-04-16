import { sql } from '@vercel/postgres';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Execute scheduled reminder task
    const result = await processReminderCycle();
    
    return res.status(200).json({
      success: true,
      reminders_processed: result.count,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Reminder cycle error:', error);
    return res.status(500).json({
      error: 'Reminder cycle failed',
      message: error.message
    });
  }
}

async function processReminderCycle() {
  const reminderWindows = {
    '24hr': { hours: 24, channels: ['email'], name: '24hr' },
    '2hr': { hours: 2, channels: ['sms', 'email'], name: '2hr' },
    '30min': { hours: 0.5, channels: ['sms'], name: '30min' }
  };

  let totalReminders = 0;

  try {
    // Get all active tenants with appointment_reminder enabled
    const tenantsResult = await sql`
      SELECT 
        t.id,
        t.stripe_customer_id,
        t.settings,
        s.module_entitlements
      FROM tenants t
      LEFT JOIN subscriptions s ON t.id = s.tenant_id
      WHERE s.module_entitlements ? 'appointment_reminder'
      AND t.is_active = true
    `;

    for (const tenant of tenantsResult.rows) {
      const tenantSettings = tenant.settings || {};
      const enabledWindows = tenantSettings.reminder_windows || ['24hr', '2hr'];

      for (const windowName of enabledWindows) {
        if (!reminderWindows[windowName]) continue;

        const window = reminderWindows[windowName];
        const windowMinutes = window.hours * 60;

        // Query appointments within reminder window
        const appointmentsResult = await sql`
          SELECT 
            a.id,
            a.contact_id,
            a.business_id,
            a.scheduled_start,
            a.scheduled_end,
            a.service_type,
            a.location,
            a.address,
            a.notes,
            a.technician_id,
            c.first_name,
            c.last_name,
            c.email,
            c.phone,
            c.preferences,
            b.name as business_name,
            b.settings as business_settings,
            EXTRACT(EPOCH FROM (a.scheduled_start - NOW())) / 60 as minutes_until
          FROM appointments a
          INNER JOIN contacts c ON a.contact_id = c.id
          INNER JOIN businesses b ON a.business_id = b.id
          LEFT JOIN appointment_reminders ar ON a.id = ar.appointment_id 
            AND ar.reminder_window = ${windowName}
          WHERE a.tenant_id = ${tenant.id}
          AND a.status = 'scheduled'
          AND EXTRACT(EPOCH FROM (a.scheduled_start - NOW())) / 60 BETWEEN ${windowMinutes - 10} AND ${windowMinutes + 10}
          AND ar.id IS NULL
          AND c.is_deleted = false
          AND a.is_deleted = false
          ORDER BY a.scheduled_start ASC
        `;

        for (const appointment of appointmentsResult.rows) {
          try {
            // Check contact preferences
            const contactPreferences = appointment.preferences || {};
            
            // Send reminders via configured channels
            for (const channel of window.channels) {
              if (channel === 'email' && appointment.email && contactPreferences.email_notifications !== false) {
                await sendReminderEmail(appointment, windowName, tenant);
              }
              
              if (channel === 'sms' && appointment.phone && contactPreferences.sms_notifications !== false) {
                // Check quiet hours for SMS
                if (!isInQuietHours(tenantSettings.quiet_hours)) {
                  await sendReminderSms(appointment, windowName, tenant);
                }
              }
            }

            // Record reminder as sent
            await sql`
              INSERT INTO appointment_reminders (
                appointment_id,
                tenant_id,
                reminder_window,
                sent_at
              ) VALUES (
                ${appointment.id},
                ${tenant.id},
                ${windowName},
                NOW()
              )
            `;

            // Update CRM timeline
            await sql`
              INSERT INTO contact_timeline (
                contact_id,
                tenant_id,
                event_type,
                title,
                description,
                metadata,
                created_at
              ) VALUES (
                ${appointment.contact_id},
                ${tenant.id},
                'appointment_reminder',
                '${windowName} reminder sent',
                ${'Reminder sent for ' + appointment.service_type + ' appointment'},
                ${JSON.stringify({
                  appointmentId: appointment.id,
                  window: windowName,
                  channels: window.channels
                })},
                NOW()
              )
            `;

            totalReminders++;

            // Track usage for billing
            if (tenantSettings.track_usage_for_billing) {
              try {
                await stripe.billing.meterEvents.create({
                  customer: tenant.stripe_customer_id,
                  event_name: 'reminder_sent',
                  timestamp: Math.floor(Date.now() / 1000),
                  value: 1
                });
              } catch (error) {
                console.error('Billing event error:', error);
              }
            }

          } catch (error) {
            console.error(`Reminder failed for appointment ${appointment.id}:`, error);
            // Log error but continue with other appointments
          }
        }
      }
    }

  } catch (error) {
    console.error('Reminder cycle error:', error);
    throw error;
  }

  return { count: totalReminders };
}

async function sendReminderEmail(appointment, windowName, tenant) {
  const html = renderReminderEmailTemplate(appointment, windowName);
  const subject = getEmailSubject(appointment, windowName);

  try {
    const response = await fetch('https://api.acumbamail.com/1/email/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ACUMBAMAIL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: appointment.email,
        from: `noreply@${process.env.BUSINESS_DOMAIN}`,
        subject: subject,
        html: html,
        replyTo: `support@${process.env.BUSINESS_DOMAIN}`
      })
    });

    if (!response.ok) {
      throw new Error(`Email send failed: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error(`Email reminder failed for appointment ${appointment.id}:`, error);
    throw error;
  }
}

async function sendReminderSms(appointment, windowName, tenant) {
  const message = renderReminderSmsTemplate(appointment, windowName);

  try {
    const response = await fetch('https://api.sms-it.net/api/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SMS_IT_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone: appointment.phone,
        message: message,
        senderId: 'YourDeputy'
      })
    });

    if (!response.ok) {
      throw new Error(`SMS send failed: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error(`SMS reminder failed for appointment ${appointment.id}:`, error);
    throw error;
  }
}

function renderReminderEmailTemplate(appointment, windowName) {
  const appointmentDate = new Date(appointment.scheduled_start).toLocaleDateString();
  const appointmentTime = new Date(appointment.scheduled_start).toLocaleTimeString();
  const rescheduleLink = `${process.env.FRONTEND_URL}/appointments/${appointment.id}/reschedule`;

  let contentMessage = '';
  if (windowName === '24hr') {
    contentMessage = `This is a friendly reminder that your <strong>${appointment.service_type}</strong> appointment is scheduled for <strong>tomorrow at ${appointmentTime}</strong>.`;
  } else if (windowName === '2hr') {
    contentMessage = `Your <strong>${appointment.service_type}</strong> appointment is coming up soon. We'll see you in 2 hours at <strong>${appointmentTime}</strong> at ${appointment.location}.`;
  } else if (windowName === '30min') {
    contentMessage = `Your appointment is in just 30 minutes! We're looking forward to seeing you at <strong>${appointmentTime}</strong>.`;
  }

  return `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
          <h2 style="margin: 0;">Appointment Reminder</h2>
        </div>
        
        <div style="padding: 30px; background: #f8f9fa;">
          <p>Hi ${appointment.first_name},</p>
          
          <p>${contentMessage}</p>
          
          <div style="background: white; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0;">
            <table style="width: 100%;">
              <tr>
                <td style="padding: 8px; font-weight: bold;">Date & Time:</td>
                <td style="padding: 8px;">${appointmentDate} at ${appointmentTime}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Location:</td>
                <td style="padding: 8px;">${appointment.location}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Address:</td>
                <td style="padding: 8px;">${appointment.address}</td>
              </tr>
            </table>
          </div>

          <div style="margin: 20px 0; text-align: center;">
            <a href="${rescheduleLink}" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-right: 10px;">Reschedule</a>
          </div>

          <p style="color: #666; font-size: 14px;">Questions? Contact ${appointment.business_name} directly.</p>
        </div>

        <div style="background: #f0f0f0; padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p style="margin: 0;">© ${new Date().getFullYear()} ${appointment.business_name}. All rights reserved.</p>
        </div>
      </body>
    </html>
  `;
}

function renderReminderSmsTemplate(appointment, windowName) {
  const appointmentTime = new Date(appointment.scheduled_start).toLocaleTimeString();
  
  let message = '';
  if (windowName === '24hr') {
    message = `${appointment.business_name}: Reminder - your ${appointment.service_type} appointment is tomorrow at ${appointmentTime}. Reply CONFIRM to confirm.`;
  } else if (windowName === '2hr') {
    message = `${appointment.business_name} reminder: Your appointment is in 2 hours at ${appointmentTime}. See you soon!`;
  } else if (windowName === '30min') {
    message = `${appointment.business_name}: Your appointment is in 30 minutes at ${appointmentTime}!`;
  }

  return message.substring(0, 160);
}

function getEmailSubject(appointment, windowName) {
  const appointmentTime = new Date(appointment.scheduled_start).toLocaleTimeString();
  
  if (windowName === '24hr') {
    return `Reminder: ${appointment.service_type} appointment tomorrow at ${appointmentTime}`;
  } else if (windowName === '2hr') {
    return `${appointment.business_name} reminder: appointment in 2 hours`;
  } else if (windowName === '30min') {
    return `${appointment.business_name}: Your appointment is in 30 minutes`;
  }
}

function isInQuietHours(quietHours) {
  if (!quietHours) return false;

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  const startParts = (quietHours.start || '21:00').split(':');
  const endParts = (quietHours.end || '09:00').split(':');
  
  const startTime = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
  const endTime = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);

  // Handle overnight quiet hours
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime < endTime;
  } else {
    return currentTime >= startTime && currentTime < endTime;
  }
}