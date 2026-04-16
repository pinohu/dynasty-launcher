import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEON_DATABASE_URL,
  process.env.NEON_API_KEY
);

// Webhook signature validation
function validateWebhookSignature(payload, signature) {
  const secret = process.env.CALLSCALER_WEBHOOK_SECRET;
  const hash = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}

// Check quiet hours
function isWithinQuietHours(tenantSettings) {
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const startHours = tenantSettings.quiet_hours_start.split(':');
  const endHours = tenantSettings.quiet_hours_end.split(':');
  const startTime = parseInt(startHours[0]) * 60 + parseInt(startHours[1]);
  const endTime = parseInt(endHours[0]) * 60 + parseInt(endHours[1]);

  if (startTime < endTime) {
    return currentTime >= startTime && currentTime < endTime;
  }
  return currentTime >= startTime || currentTime < endTime;
}

// Check if number is opted out
async function isOptedOut(tenantId, phoneNumber) {
  try {
    const { data } = await supabase
      .from('sms_opt_outs')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone', phoneNumber)
      .single();
    return !!data;
  } catch (err) {
    return false;
  }
}

// Get tenant entitlement
async function checkTenantEntitlement(tenantId, moduleCode) {
  try {
    const { data } = await supabase
      .from('module_entitlements')
      .select('status, tier')
      .eq('tenant_id', tenantId)
      .eq('module_code', moduleCode)
      .single();

    if (!data) {
      throw new Error('No entitlement found');
    }
    if (data.status !== 'active') {
      throw new Error('Entitlement not active');
    }
    return { valid: true, tier: data.tier };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// Create lead record
async function createLead(tenantId, callData) {
  try {
    const { data } = await supabase
      .from('leads')
      .insert({
        tenant_id: tenantId,
        phone: callData.caller_phone,
        source: 'missed_call',
        status: 'new',
        tags: ['missed-call', 'auto-textback'],
        call_id: callData.call_id,
        call_time: callData.call_time,
        created_at: new Date().toISOString(),
        metadata: {
          caller_name: callData.caller_name || null,
          call_duration: callData.call_duration || 0
        }
      })
      .select('id')
      .single();
    return { success: true, leadId: data.id };
  } catch (err) {
    console.error('[Lead Creation Error]', err);
    return { success: false, error: err.message };
  }
}

// Send SMS via n8n webhook
async function triggerSMSWorkflow(tenantId, callData, templateSettings) {
  const n8nUrl = process.env.N8N_WEBHOOK_URL || '';
  const payload = {
    tenant_id: tenantId,
    caller_phone: callData.caller_phone,
    caller_name: callData.caller_name || 'Caller',
    call_id: callData.call_id,
    call_time: callData.call_time,
    tenant_business_name: templateSettings.business_name,
    tenant_phone: templateSettings.business_phone,
    tenant_owner_first_name: templateSettings.owner_first_name,
    tenant_owner_email: templateSettings.owner_email,
    delay_seconds: templateSettings.response_delay_seconds,
    is_business_hours: templateSettings.is_business_hours,
    tenant_settings: templateSettings
  };

  try {
    const response = await fetch(`${n8nUrl}/webhook/missed-call-textback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Auth': process.env.N8N_WEBHOOK_SECRET || ''
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`N8N webhook returned ${response.status}`);
    }
    return { success: true };
  } catch (err) {
    console.error('[N8N Trigger Error]', err);
    return { success: false, error: err.message };
  }
}

// Get tenant settings
async function getTenantSettings(tenantId) {
  try {
    const { data } = await supabase
      .from('tenants')
      .select(
        'id, business_name, phone, owner_first_name, owner_email, time_zone'
      )
      .eq('id', tenantId)
      .single();

    if (!data) {
      throw new Error('Tenant not found');
    }

    const { data: settings } = await supabase
      .from('module_configs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('module_code', 'missed_call_textback')
      .single();

    return {
      ...data,
      response_delay_seconds: settings?.response_delay_seconds || 30,
      quiet_hours_start: settings?.quiet_hours_start || '21:00',
      quiet_hours_end: settings?.quiet_hours_end || '09:00',
      owner_notification: settings?.owner_notification !== false,
      auto_create_lead: settings?.auto_create_lead !== false,
      is_business_hours: false // simplified for this example
    };
  } catch (err) {
    console.error('[Settings Error]', err);
    return null;
  }
}

// Log event for observability
async function logEvent(tenantId, eventType, eventData) {
  try {
    await supabase.from('module_events').insert({
      tenant_id: tenantId,
      module_code: 'missed_call_textback',
      event_type: eventType,
      event_data: eventData,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Event Log Error]', err);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate webhook signature
    const signature = req.headers['x-callscaler-signature'];
    if (!validateWebhookSignature(req.body, signature)) {
      console.warn('[Security] Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { tenant_id, caller_phone, caller_name, call_id, call_time } =
      req.body;

    // Validation
    if (!tenant_id || !caller_phone || !call_id) {
      return res.status(400).json({
        error: 'Missing required fields: tenant_id, caller_phone, call_id'
      });
    }

    // Step 1: Verify entitlement
    const entitlement = await checkTenantEntitlement(
      tenant_id,
      'missed_call_textback'
    );
    if (!entitlement.valid) {
      console.log('[Entitlement Check Failed]', entitlement.error);
      await logEvent(tenant_id, 'activation_check_failed', {
        reason: entitlement.error
      });
      return res
        .status(403)
        .json({ error: 'Module not activated for this tenant' });
    }

    // Step 2: Get tenant settings
    const tenantSettings = await getTenantSettings(tenant_id);
    if (!tenantSettings) {
      return res.status(500).json({ error: 'Failed to load tenant settings' });
    }

    // Step 3: Check quiet hours
    if (isWithinQuietHours(tenantSettings)) {
      console.log('[Quiet Hours Active] Skipping SMS send');
      await logEvent(tenant_id, 'skipped_quiet_hours', {
        quiet_hours_start: tenantSettings.quiet_hours_start,
        quiet_hours_end: tenantSettings.quiet_hours_end
      });
      return res.status(200).json({
        status: 'skipped',
        reason: 'Within quiet hours',
        scheduled_for_morning: true
      });
    }

    // Step 4: Check SMS opt-out
    const optedOut = await isOptedOut(tenant_id, caller_phone);
    if (optedOut) {
      console.log('[Opt-Out Check] Number is opted out');
      await logEvent(tenant_id, 'sms_opt_out_detected', { caller_phone });
      return res.status(200).json({
        status: 'skipped',
        reason: 'Number is opted out of SMS'
      });
    }

    // Step 5: Create lead record
    let leadResult = null;
    if (tenantSettings.auto_create_lead) {
      leadResult = await createLead(tenant_id, {
        caller_phone,
        caller_name,
        call_id,
        call_time
      });
      if (!leadResult.success) {
        console.error('[Lead Creation Failed]', leadResult.error);
        await logEvent(tenant_id, 'lead_creation_failed', {
          error: leadResult.error
        });
      }
    }

    // Step 6: Trigger SMS workflow
    const workflowResult = await triggerSMSWorkflow(tenant_id, {
      caller_phone,
      caller_name,
      call_id,
      call_time
    }, tenantSettings);

    if (!workflowResult.success) {
      console.error('[Workflow Trigger Failed]', workflowResult.error);
      await logEvent(tenant_id, 'workflow_trigger_failed', {
        error: workflowResult.error
      });
      return res.status(500).json({
        error: 'Failed to trigger SMS automation',
        details: workflowResult.error
      });
    }

    // Log success event
    await logEvent(tenant_id, 'missed_call_textback_processed', {
      caller_phone,
      lead_id: leadResult?.leadId,
      call_id
    });

    return res.status(200).json({
      status: 'success',
      message: 'Missed call processed, SMS queued for delivery',
      lead_id: leadResult?.leadId,
      call_id
    });
  } catch (error) {
    console.error('[Unhandled Error]', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
