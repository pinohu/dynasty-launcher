import { sql } from '@vercel/postgres';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { appointmentId, tenantId, action = 'confirmation' } = req.body;

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

    // Check if appointment_confirmation module is active
    const hasEntitlement = moduleEntitlements.includes('appointment_confirmation');
    if (!hasEntitlement) {
      return res.status(403).json({ error: 'Module not enabled' });
    }

    // 2. Fetch appointment details
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
        a.notes,
        a.technician_id,
        c.first_name,
        c.last_name,
        c.email,
        c.phone,
        c.preferences,
        b.name as business_name,
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

    // 3. Determine channels (email, SMS, or both)
    const channels = settings.confirmation_channels || ['email', 'sms'];
    const shouldSendEmail = channels.includes('email') && 
                           contactPreferences.email_notifications !== false;
    const shouldSendSms = channels.includes('sms') && 
                         contactPreferences.sms_notifications !== false;

    const confirmationResults = {};

    // 4. Send confirmation email
    if (shouldSendEmail && appointment.email) {
      try {
        const emailHtml = renderConfirmationEmail(appointment, settings);
        
        const emailResponse = await fetch('https://api.acumbamail.com/1/email/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.ACUMBAMAIL_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            to: appointment.email,
            from: `noreply@${process.env.BUSINESS_DOMAIN}`,
            subject: `${appointment.business_name} - Your ${appointment.service_type} Appointment Confirmed`,
            html: emailHtml,
            replyTo: `support@${process.env.BUSINESS_DOMAIN}`
          })
        });

        confirmationResults.email = {
          sent: emailResponse.ok,
          status: emailResponse.status,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error('Email send error:', error);
        confirmationResults.email = { sent: false, error: error.message };
      }
    }

    // 5. Send confirmation SMS
    if (shouldSendSms && appointment.phone) {
      try {
        const smsMessage = renderConfirmationSms(appointment);

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

        confirmationResults.sms = {
          sent: smsResponse.ok,
          status: smsResponse.status,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error('SMS send error:', error);
        confirmationResults.sms = { sent: false, error: error.message };
      }
    }

    // 6. Update CRM timeline
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
          'appointment_confirmed',
          'Appointment confirmation sent',
          ${'Confirmation sent via ' + Object.keys(confirmationResults).filter(k => confirmationResults[k].sent).join(', ')},
          ${JSON.stringify({
            appointmentId: appointment.id,
            channels: Object.keys(confirmationResults),
            businessName: appointment.business_name
          })},
          NOW()
        )
      `;

      confirmationResults.crmUpdated = true;
    } catch (error) {
      console.error('CRM timeline error:', error);
      confirmationResults.crmUpdated = false;
    }

    // 7. Log metrics
    await logMetric(tenantId, appointmentId, {
      event: 'appointment_confirmation',
      channels: Object.keys(confirmationResults).filter(k => confirmationResults[k].sent),
      success: confirmationResults.email?.sent || confirmationResults.sms?.sent
    });

    // 8. Handle billing if applicable
    if (settings.track_usage_for_billing) {
      try {
        await stripe.billing.meterEvents.create({
          customer: tenant.stripe_customer_id,
          event_name: 'confirmation_sent',
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
      confirmations: confirmationResults,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Appointment confirmation error:', error);
    return res.status(500).json({
      error: 'Confirmation failed',
      message: error.message
    });
  }
}

function renderConfirmationEmail(appointment, settings) {
  const appointmentDate = new Date(appointment.scheduled_start).toLocaleDateString();
  const appointmentTime = new Date(appointment.scheduled_start).toLocaleTimeString();
  const mapLink = `https://maps.google.com/?q=${encodeURIComponent(appointment.address)}`;
  const rescheduleLink = `${process.env.FRONTEND_URL}/appointments/${appointment.id}/reschedule`;
  const cancelLink = `${process.env.FRONTEND_URL}/appointments/${appointment.id}/cancel`;

  return `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0;">Appointment Confirmed!</h1>
        </div>
        
        <div style="padding: 30px; background: #f8f9fa;">
          <p>Hi ${appointment.first_name},</p>
          
          <p>Your <strong>${appointment.service_type}</strong> appointment has been confirmed!</p>
          
          <div style="background: white; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0;">
            <h3 style="margin-top: 0;">Appointment Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; font-weight: bold;">Date & Time:</td>
                <td style="padding: 8px;">${appointmentDate} at ${appointmentTime}</td>
              </tr>
              <tr style="background: #f8f9fa;">
                <td style="padding: 8px; font-weight: bold;">Duration:</td>
                <td style="padding: 8px;">60 minutes</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Location:</td>
                <td style="padding: 8px;">${appointment.location}</td>
              </tr>
              <tr style="background: #f8f9fa;">
                <td style="padding: 8px; font-weight: bold;">Address:</td>
                <td style="padding: 8px;">${appointment.address}</td>
              </tr>
            </table>
          </div>

          ${settings.include_prep_instructions && appointment.notes ? `
          <div style="background: #e7f3ff; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <h4 style="margin-top: 0;">Before Your Appointment</h4>
            <p>${appointment.notes}</p>
          </div>
          ` : ''}

          <div style="margin: 20px 0;">
            <a href="${mapLink}" style="display: inline-block; background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin-right: 10px;">View Location on Map</a>
            <a href="${rescheduleLink}" style="display: inline-block; background: #f0f0f0; color: #333; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin-right: 10px;">Reschedule</a>
            <a href="${cancelLink}" style="display: inline-block; background: #f0f0f0; color: #333; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Cancel</a>
          </div>

          <p style="color: #666; font-size: 14px; margin-top: 30px;">Questions? Contact ${appointment.business_name} directly at <a href="tel:${process.env.BUSINESS_PHONE}" style="color: #667eea;">${process.env.BUSINESS_PHONE}</a></p>
        </div>

        <div style="background: #f0f0f0; padding: 20px; text-align: center; color: #666; font-size: 12px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0;">© ${new Date().getFullYear()} ${appointment.business_name}. All rights reserved.</p>
        </div>
      </body>
    </html>
  `;
}

function renderConfirmationSms(appointment) {
  const appointmentDate = new Date(appointment.scheduled_start).toLocaleDateString();
  const appointmentTime = new Date(appointment.scheduled_start).toLocaleTimeString();
  const message = `${appointment.business_name} confirmed: ${appointmentDate} at ${appointmentTime} at ${appointment.location}. Reply CONFIRM to confirm or visit ${process.env.FRONTEND_URL}/appointments/${appointment.id} to reschedule.`;
  
  return message.substring(0, 160);
}

async function logMetric(tenantId, appointmentId, data) {
  try {
    await sql`
      INSERT INTO metrics (
        tenant_id,
        resource_id,
        event_type,
        data,
        created_at
      ) VALUES (
        ${tenantId},
        ${appointmentId},
        'appointment_confirmation',
        ${JSON.stringify(data)},
        NOW()
      )
    `;
  } catch (error) {
    console.error('Metric logging error:', error);
  }
}