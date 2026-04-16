import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEON_DATABASE_URL,
  process.env.NEON_API_KEY
);

// Validate webhook signature
function validateWebhookSignature(payload, signature) {
  const secret = process.env.CRMEVENT_WEBHOOK_SECRET;
  const hash = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}

// Check tenant entitlement
async function checkTenantEntitlement(tenantId, moduleCode) {
  try {
    const { data } = await supabase
      .from('module_entitlements')
      .select('status, tier')
      .eq('tenant_id', tenantId)
      .eq('module_code', moduleCode)
      .single();

    if (!data || data.status !== 'active') {
      return { valid: false, error: 'Module not activated' };
    }
    return { valid: true, tier: data.tier };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// Get tenant settings and preferences
async function getTenantSettings(tenantId) {
  try {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, business_name, phone, owner_first_name, owner_email, service_focus')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const { data: settings } = await supabase
      .from('module_configs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('module_code', 'instant_lead_ack')
      .single();

    return {
      ...tenant,
      enable_sms: settings?.enable_sms || false,
      assignment_method: settings?.assignment_method || 'round_robin',
      scoring_model: settings?.scoring_model || 'basic',
      auto_create_task: settings?.auto_create_task !== false,
      task_due_hours: settings?.task_due_hours || 24,
      enrich_lead_data: settings?.enrich_lead_data !== false,
      score_leads: settings?.score_leads !== false,
      personalization_level: settings?.personalization_level || 'medium'
    };
  } catch (err) {
    console.error('[Settings Error]', err);
    return null;
  }
}

// Trigger n8n workflow
async function triggerWorkflow(tenantId, leadData, tenantSettings) {
  const n8nUrl = process.env.N8N_WEBHOOK_URL || '';
  const payload = {
    tenant_id: tenantId,
    lead_id: leadData.id,
    lead_name: leadData.name,
    lead_first_name: (leadData.name || '').split(' ')[0],
    lead_email: leadData.email,
    lead_phone: leadData.phone || null,
    lead_company: leadData.company || null,
    tenant_business_name: tenantSettings.business_name,
    tenant_owner_first_name: tenantSettings.owner_first_name,
    tenant_service_focus: tenantSettings.service_focus || 'growing businesses',
    enable_sms: tenantSettings.enable_sms,
    assignment_method: tenantSettings.assignment_method,
    scoring_model: tenantSettings.scoring_model,
    task_due_hours: tenantSettings.task_due_hours
  };

  try {
    const response = await fetch(`${n8nUrl}/webhook/instant-lead-ack`, {
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

// Log event for observability
async function logEvent(tenantId, eventType, eventData) {
  try {
    await supabase.from('module_events').insert({
      tenant_id: tenantId,
      module_code: 'instant_lead_ack',
      event_type: eventType,
      event_data: eventData,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Event Log Error]', err);
  }
}

// Validate lead data
function validateLeadData(data) {
  const errors = [];

  if (!data.tenant_id) errors.push('tenant_id required');
  if (!data.id) errors.push('lead id required');
  if (!data.name || data.name.trim().length === 0) errors.push('lead name required');
  if (!data.email || !data.email.includes('@')) errors.push('valid email required');

  return {
    valid: errors.length === 0,
    errors
  };
}

// Check if lead is existing customer
async function isExistingCustomer(tenantId, leadEmail) {
  try {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('email', leadEmail)
      .eq('status', 'customer')
      .limit(1);

    return data && data.length > 0;
  } catch (err) {
    return false;
  }
}

// Update lead with enrichment data
async function updateLeadWithEnrichment(leadId, enrichmentData) {
  try {
    const { data } = await supabase
      .from('leads')
      .update({
        company_name: enrichmentData.company_name,
        company_size: enrichmentData.company_size,
        industry: enrichmentData.industry,
        job_title: enrichmentData.job_title,
        location: enrichmentData.location,
        enrichment_metadata: enrichmentData.metadata || {},
        enriched_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select('id');

    return { success: true };
  } catch (err) {
    console.error('[Enrichment Update Error]', err);
    return { success: false, error: err.message };
  }
}

// Update lead with score
async function updateLeadScore(leadId, score, scoreNotes) {
  try {
    const { data } = await supabase
      .from('leads')
      .update({
        lead_score: score,
        score_notes: scoreNotes,
        scored_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select('id');

    return { success: true, score };
  } catch (err) {
    console.error('[Score Update Error]', err);
    return { success: false, error: err.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate webhook signature
    const signature = req.headers['x-crm-event-signature'];
    if (!validateWebhookSignature(req.body, signature)) {
      console.warn('[Security] Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { tenant_id, lead } = req.body;

    // Validate data
    const validation = validateLeadData({ ...lead, tenant_id });
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid lead data',
        details: validation.errors
      });
    }

    // Step 1: Check if existing customer (skip automation if true)
    const isExisting = await isExistingCustomer(tenant_id, lead.email);
    if (isExisting) {
      console.log('[Skip] Lead is existing customer');
      await logEvent(tenant_id, 'skipped_existing_customer', { lead_id: lead.id });
      return res.status(200).json({
        status: 'skipped',
        reason: 'Lead is existing customer',
        lead_id: lead.id
      });
    }

    // Step 2: Verify entitlement
    const entitlement = await checkTenantEntitlement(tenant_id, 'instant_lead_ack');
    if (!entitlement.valid) {
      console.log('[Entitlement Check Failed]', entitlement.error);
      await logEvent(tenant_id, 'activation_check_failed', {
        reason: entitlement.error
      });
      return res
        .status(403)
        .json({ error: 'Module not activated for this tenant' });
    }

    // Step 3: Get tenant settings
    const tenantSettings = await getTenantSettings(tenant_id);
    if (!tenantSettings) {
      return res.status(500).json({ error: 'Failed to load tenant settings' });
    }

    // Step 4: Trigger n8n workflow for multi-step engagement
    const workflowResult = await triggerWorkflow(tenant_id, lead, tenantSettings);

    if (!workflowResult.success) {
      console.error('[Workflow Trigger Failed]', workflowResult.error);
      await logEvent(tenant_id, 'workflow_trigger_failed', {
        error: workflowResult.error,
        lead_id: lead.id
      });
      return res.status(500).json({
        error: 'Failed to engage lead',
        details: workflowResult.error
      });
    }

    // Log success event
    await logEvent(tenant_id, 'instant_lead_ack_triggered', {
      lead_id: lead.id,
      lead_email: lead.email,
      enable_sms: tenantSettings.enable_sms,
      assignment_method: tenantSettings.assignment_method
    });

    return res.status(200).json({
      status: 'success',
      message: 'Lead acknowledgment workflow triggered',
      lead_id: lead.id,
      actions: {
        welcome_email: 'queued',
        sms: tenantSettings.enable_sms ? 'queued' : 'disabled',
        assignment: 'processing',
        task_creation: 'processing'
      }
    });
  } catch (error) {
    console.error('[Unhandled Error]', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
