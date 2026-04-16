import { sql } from '@vercel/postgres';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { appointmentId, tenantId, contactId, action = 'trigger' } = req.body;

  try {
    // 1. Verify entitlements
    const entitlementResult = await sql`
      SELECT 
        t.id,
        t.stripe_customer_id,
        t.settings,
        s.module_entitlements
      FROM tenants t
      LEFT JOIN subscriptions s ON t.id = s.tenant_id
      WHERE t.id = ${tenantId}
      LIMIT 1
    `;

    if (!entitlementResult.rows.length) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const tenant = entitlementResult.rows[0];
    const moduleEntitlements = tenant.module_entitlements || [];

    // Check if no_show_recovery module is active
    const hasEntitlement = moduleEntitlements.includes('no_show_recovery');
    if (!hasEntitlement) {
      return res.status(403).json({ error: 'Module not enabled' });
    }

    // 2. Fetch appointment and contact details
    const appointmentResult = await sql`
      SELECT 
        a.id,
        a.contact_id,
        a.business_id,
        a.scheduled_start,
        a.scheduled_end,
        a.service_type,
        a.location,
        a.address,
        a.status,
        c.first_name,
        c.last_name,
        c.email,
        c.phone,
        c.stripe_customer_id,
        c.preferences,
        b.name as business_name,
        b.phone as business_phone,
        b.settings as business_settings
      FROM appointments a
      INNER JOIN contacts c ON a.contact_id = c.id
      INNER JOIN businesses b ON a.business_id = b.id
      WHERE a.id = ${appointmentId}
      AND a.tenant_id = ${tenantId}
      LIMIT 1
    `;

    if (!appointmentResult.rows.length) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const appointment = appointmentResult.rows[0];
    const settings = tenant.settings || {};
    const contactPreferences = appointment.preferences || {};

    // 3. Check current recovery attempt count
    const recoveryAttemptResult = await sql`
      SELECT COUNT(*) as attempt_count
      FROM no_show_recovery_log
      WHERE appointment_id = ${appointmentId}
      AND tenant_id = ${tenantId}
      AND created_at > NOW() - INTERVAL '7 days'
    `;

    const attemptCount = recoveryAttemptResult.rows[0]?.attempt_count || 0;
    const maxAttempts = settings.max_recovery_attempts || 3;

    // Check if max attempts reached
    if (attemptCount >= maxAttempts) {
      return res.status(409).json({
        error: 'Recovery limit reached',
        attemptCount: attemptCount,
        maxAttempts: maxAttempts
      });
    }

    const recoveryResults = {};

    // 4. Apply no-show tag to contact
    try {
      await sql`
        INSERT INTO contact_tags (contact_id, tag, tenant_id, created_at)
        VALUES (${appointment.contact_id}, 'no_show', ${tenantId}, NOW())
        ON CONFLICT DO NOTHING
      `;

      recoveryResults.tagApplied = true;
    } catch (error) {
      console.error('Tag application error:', error);
      recoveryResults.tagApplied = false;
    }

    // 5. Send recovery email
    const channels = settings.channels || ['email', 'sms'];
    if (channels.includes('email') && appointment.email && contactPreferences.email_notifications !== false) {
      try {
        const emailHtml = renderRecoveryEmail(appointment, settings);
        
        const emailResponse = await fetch('https://api.acumbamail.com/1/email/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.ACUMBAMAIL_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            to: appointment.email,
            from: `noreply@${process.env.BUSINESS_DOMAIN}`,
            subject: `We missed you - let's reschedule your ${appointment.service_type} appointment`,
            html: emailHtml,
            replyTo: `support@${process.env.BUSINESS_DOMAIN}`
          })
        });

        recoveryResults.email = {
          sent: emailResponse.ok,
          status: emailResponse.status,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error('Email send error:', error);
        recoveryResults.email = { sent: false, error: error.message };
      }
    }

    // 6. Send recovery SMS
    if (channels.includes('sms') && appointment.phone && contactPreferences.sms_notifications !== false) {
      // Check quiet hours
      if (!isInQuietHours(settings.quiet_hours)) {
        try {
          const smsMessage = renderRecoverySms(appointment, settings);

          const smsResponse = await fetch('https://api.sms-it.net/api/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.SMS_IT_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              phone: appointment.phone,
              message: smsMessage,
              senderId: 'YourDeputy'
            })
          });

          recoveryResults.sms = {
            sent: smsResponse.ok,
            status: smsResponse.status,
            timestamp: new Date().toISOString()
          };
        } catch (error) {
          console.error('SMS send error:', error);
          recoveryResults.sms = { sent: false, error: error.message };
        }
      } else {
        recoveryResults.sms = { sent: false, reason: 'Quiet hours active' };
      }
    }

    // 7. Process no-show fee if enabled
    if (settings.charge_no_show_fee && settings.no_show_fee_amount > 0 && appointment.stripe_customer_id) {
      try {
        const charge = await stripe.charges.create({
          amount: Math.round(settings.no_show_fee_amount * 100),
          currency: 'usd',
          customer: appointment.stripe_customer_id,
          description: `${appointment.business_name} - No-show fee for ${appointment.service_type} appointment on ${new Date(appointment.scheduled_start).toLocaleDateString()}`,
          metadata: {
            appointmentId: appointment.id,
            tenantId: tenantId,
            contactId: appointment.contact_id,
            businessId: appointment.business_id
          }
        });

        recoveryResults.feeCharged = {
          success: true,
          chargeId: charge.id,
          amount: settings.no_show_fee_amount,
          timestamp: new Date().toISOString()
        };

        // Log fee charge
        await sql`
          INSERT INTO financial_transactions (
            tenant_id,
            contact_id,
            appointment_id,
            transaction_type,
            amount,
            stripe_charge_id,
            description,
            created_at
          ) VALUES (
            ${tenantId},
            ${appointment.contact_id},
            ${appointmentId},
            'no_show_fee',
            ${settings.no_show_fee_amount},
            ${charge.id},
            ${'No-show fee'},
            NOW()
          )
        `;
      } catch (error) {
        console.error('Fee charge error:', error);
        recoveryResults.feeCharged = { success: false, error: error.message };
      }
    }

    // 8. Update CRM timeline
    try {
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
          ${tenantId},
          'no_show_recovery',
          'No-show recovery initiated',
          ${'Recovery attempt ' + (attemptCount + 1) + ' for ' + appointment.service_type + ' appointment'},
          ${JSON.stringify({
            appointmentId: appointment.id,
            attemptNumber: attemptCount + 1,
            channels: channels,
            feeCharged: recoveryResults.feeCharged?.success || false
          })},
          NOW()
        )
      `;

      recoveryResults.crmUpdated = true;
    } catch (error) {
      console.error('CRM timeline error:', error);
      recoveryResults.crmUpdated = false;
    }

    // 9. Log recovery attempt
    try {
      await sql`
        INSERT INTO no_show_recovery_log (
          appointment_id,
          contact_id,
          tenant_id,
          business_id,
          attempt_number,
          channels_used,
          fee_charged,
          created_at
        ) VALUES (
          ${appointmentId},
          ${appointment.contact_id},
          ${tenantId},
          ${appointment.business_id},
          ${attemptCount + 1},
          ${JSON.stringify(channels)},
          ${recoveryResults.feeCharged?.success || false},
          NOW()
        )
      `;
    } catch (error) {
      console.error('Recovery log error:', error);
    }

    // 10. Create internal follow-up task if escalation threshold reached
    if (attemptCount + 1 >= (settings.escalation_after_attempts || 2)) {
      try {
        await sql`
          INSERT INTO tasks (
            tenant_id,
            business_id,
            contact_id,
            appointment_id,
            title,
            description,
            priority,
            status,
            created_at
          ) VALUES (
            ${tenantId},
            ${appointment.business_id},
            ${appointment.contact_id},
            ${appointmentId},
            ${'Manual follow-up: ' + appointment.first_name + ' no-show'},
            ${'Contact ' + appointment.first_name + ' ' + appointment.last_name + ' regarding no-show for ' + appointment.service_type + ' appointment on ' + new Date(appointment.scheduled_start).toLocaleDateString()},
            'high',
            'open',
            NOW()
          )
        `;

        recoveryResults.taskCreated = true;
      } catch (error) {
        console.error('Task creation error:', error);
        recoveryResults.taskCreated = false;
      }
    }

    // 11. Track usage for billing
    if (settings.track_usage_for_billing) {
      try {
        await stripe.billing.meterEvents.create({
          customer: tenant.stripe_customer_id,
          event_name: 'recovery_attempt',
          timestamp: Math.floor(Date.now() / 1000),
          value: 1
        });
      } catch (error) {
        console.error('Billing event error:', error);
      }
    }

    return res.status(200).json({
      success: true,
      appointmentId,
      attemptNumber: attemptCount + 1,
      maxAttempts: maxAttempts,
      recovery: recoveryResults,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('No-show recovery error:', error);
    return res.status(500).json({
      error: 'Recovery failed',
      message: error.message
    });
  }
}

function renderRecoveryEmail(appointment, settings) {
  const rescheduleWindowDays = settings.reschedule_window_days || 7;
  const discountPercentage = settings.discount_percentage || 10;
  const offerDiscount = settings.offer_discount;

  const rescheduleLink = `${process.env.FRONTEND_URL}/appointments/reschedule?contact=${appointment.contact_id}&original=${appointment.id}`;
  const discountText = offerDiscount ? ` We're also offering a special ${discountPercentage}% discount on your rescheduled appointment as our apology!` : '';

  return `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
        <div style="background: #f8f9fa; padding: 30px; text-align: center;">
          <h2 style="color: #333; margin: 0;">We Missed You!</h2>
        </div>

        <div style="padding: 30px; background: white;">
          <p>Hi ${appointment.first_name},</p>

          <p>We noticed that you weren't able to make your <strong>${appointment.service_type}</strong> appointment on <strong>${new Date(appointment.scheduled_start).toLocaleDateString()}</strong>.</p>

          <p>We understand that life happens, and scheduling can be tricky. We'd love to help you get back on track!</p>

          <div style="background: #e7f3ff; padding: 20px; border-radius: 4px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Let's Reschedule</h3>
            <p>We make it easy to book your next appointment. Simply click the button below to choose a time that works for you within the next ${rescheduleWindowDays} days.${discountText}</p>
            <p style="text-align: center; margin: 20px 0;">
              <a href="${rescheduleLink}" style="display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold;">Reschedule Now</a>
            </p>
          </div>

          <p>If you have any questions or need to discuss your appointment, feel free to reach out to us at <a href="tel:${appointment.business_phone}" style="color: #667eea;">${appointment.business_phone}</a>.</p>

          <p>We look forward to seeing you soon!</p>

          <p>Best regards,<br><strong>${appointment.business_name}</strong></p>
        </div>

        <div style="background: #f0f0f0; padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p style="margin: 0;">© ${new Date().getFullYear()} ${appointment.business_name}. All rights reserved.</p>
        </div>
      </body>
    </html>
  `;
}

function renderRecoverySms(appointment, settings) {
  const businessPhone = appointment.business_phone || process.env.BUSINESS_PHONE;
  const message = `${appointment.business_name}: We missed you! Reschedule your ${appointment.service_type} appointment: ${process.env.FRONTEND_URL}/appointments/reschedule or call ${businessPhone}`;
  
  return message.substring(0, 160);
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