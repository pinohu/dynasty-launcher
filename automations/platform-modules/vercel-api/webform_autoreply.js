import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEON_DATABASE_URL,
  process.env.NEON_API_KEY
);

// Validate webhook signature
function validateWebhookSignature(payload, signature) {
  const secret = process.env.FORMS_WEBHOOK_SECRET;
  const hash = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
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

    if (!data || data.status !== 'active') {
      return { valid: false, error: 'Module not activated' };
    }
    return { valid: true, tier: data.tier };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// Check for existing lead by email
async function checkExistingLead(tenantId, email) {
  try {
    const { data } = await supabase
      .from('leads')
      .select('id, name, status, assigned_to')
      .eq('tenant_id', tenantId)
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      return { exists: true, lead: data[0] };
    }
    return { exists: false };
  } catch (err) {
    console.error('[Lead Check Error]', err);
    return { exists: false };
  }
}

// Create or update lead
async function createOrUpdateLead(tenantId, formData) {
  try {
    const existing = await checkExistingLead(tenantId, formData.email);

    let leadId;
    if (existing.exists) {
      const { data } = await supabase
        .from('leads')
        .update({
          updated_at: new Date().toISOString(),
          submission_count: (existing.lead.submission_count || 1) + 1,
          last_submission: new Date().toISOString()
        })
        .eq('id', existing.lead.id)
        .select('id')
        .single();
      leadId = data.id;
    } else {
      const { data } = await supabase
        .from('leads')
        .insert({
          tenant_id: tenantId,
          email: formData.email,
          name: formData.name,
          phone: formData.phone || null,
          source: 'website_form',
          form_source: formData.form_name,
          status: 'new',
          tags: ['web-form', 'auto-acknowledged'],
          priority: formData.priority || 'medium',
          form_id: formData.form_id,
          submission_data: formData.form_data || {},
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();
      leadId = data.id;
    }

    return { success: true, leadId };
  } catch (err) {
    console.error('[Lead Creation Error]', err);
    return { success: false, error: err.message };
  }
}

// Assign lead to team member
async function assignLead(tenantId, leadId, assignmentMethod) {
  try {
    const { data: teamData } = await supabase
      .from('team_members')
      .select('id, email, name')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    if (!teamData || teamData.length === 0) {
      return {
        success: false,
        error: 'No active team members available'
      };
    }

    let assignedUser;
    if (assignmentMethod === 'round_robin') {
      const { data: countData } = await supabase
        .from('leads')
        .select('assigned_to', { count: 'exact' })
        .eq('assigned_to', teamData[0].id)
        .eq('tenant_id', tenantId);
      assignedUser = teamData[0];
    } else {
      assignedUser = teamData[0];
    }

    const { data } = await supabase
      .from('leads')
      .update({
        assigned_to: assignedUser.id,
        assigned_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select('id')
      .single();

    return {
      success: true,
      assignedUserId: assignedUser.id,
      assignedUserEmail: assignedUser.email,
      assignedUserName: assignedUser.name
    };
  } catch (err) {
    console.error('[Lead Assignment Error]', err);
    return { success: false, error: err.message };
  }
}

// Get tenant settings
async function getTenantSettings(tenantId) {
  try {
    const { data } = await supabase
      .from('tenants')
      .select('id, business_name, phone, owner_first_name, owner_email')
      .eq('id', tenantId)
      .single();

    if (!data) {
      throw new Error('Tenant not found');
    }

    const { data: settings } = await supabase
      .from('module_configs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('module_code', 'webform_autoreply')
      .single();

    return {
      ...data,
      reply_delay_seconds: settings?.reply_delay_seconds || 2,
      assignment_method: settings?.assignment_method || 'round_robin',
      auto_create_lead: settings?.auto_create_lead !== false,
      auto_create_task: settings?.auto_create_task !== false,
      notify_assignee: settings?.notify_assignee !== false
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
      module_code: 'webform_autoreply',
      event_type: eventType,
      event_data: eventData,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Event Log Error]', err);
  }
}

// Trigger n8n workflow
async function triggerWorkflow(tenantId, formData, tenantSettings) {
  const n8nUrl = process.env.N8N_WEBHOOK_URL || '';
  const payload = {
    tenant_id: tenantId,
    submitter_name: formData.name,
    submitter_email: formData.email,
    submitter_phone: formData.phone || null,
    form_id: formData.form_id,
    form_name: formData.form_name,
    form_data: formData.form_data || {},
    form_message: formData.message || '',
    form_priority: formData.priority || 'medium',
    tenant_business_name: tenantSettings.business_name,
    tenant_owner_first_name: tenantSettings.owner_first_name,
    assignment_method: tenantSettings.assignment_method,
    reply_delay_seconds: tenantSettings.reply_delay_seconds
  };

  try {
    const response = await fetch(`${n8nUrl}/webhook/webform-autoreply`, {
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

// Validate form data
function validateFormData(data) {
  const errors = [];

  if (!data.tenant_id) errors.push('tenant_id required');
  if (!data.form_id) errors.push('form_id required');
  if (!data.form_name) errors.push('form_name required');
  if (!data.name || data.name.trim().length === 0) errors.push('submitter name required');
  if (!data.email || !data.email.includes('@')) errors.push('valid email required');

  return {
    valid: errors.length === 0,
    errors
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate webhook signature
    const signature = req.headers['x-forms-signature'];
    if (!validateWebhookSignature(req.body, signature)) {
      console.warn('[Security] Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Validate form data
    const validation = validateFormData(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid form data',
        details: validation.errors
      });
    }

    const { tenant_id, form_id, form_name, name, email, phone, message, priority, form_data } = req.body;

    // Step 1: Verify entitlement
    const entitlement = await checkTenantEntitlement(tenant_id, 'webform_autoreply');
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

    // Step 3: Create or update lead
    let leadResult = null;
    if (tenantSettings.auto_create_lead) {
      leadResult = await createOrUpdateLead(tenant_id, {
        name,
        email,
        phone,
        form_id,
        form_name,
        priority,
        message,
        form_data
      });

      if (!leadResult.success) {
        console.error('[Lead Creation Failed]', leadResult.error);
        await logEvent(tenant_id, 'lead_creation_failed', {
          error: leadResult.error
        });
        return res.status(500).json({
          error: 'Failed to create lead record',
          details: leadResult.error
        });
      }
    }

    // Step 4: Assign lead
    let assignmentResult = null;
    if (leadResult && tenantSettings.auto_create_lead) {
      assignmentResult = await assignLead(
        tenant_id,
        leadResult.leadId,
        tenantSettings.assignment_method
      );

      if (!assignmentResult.success) {
        console.error('[Assignment Failed]', assignmentResult.error);
        await logEvent(tenant_id, 'lead_assignment_failed', {
          error: assignmentResult.error
        });
      }
    }

    // Step 5: Trigger n8n workflow
    const workflowResult = await triggerWorkflow(tenant_id, {
      name,
      email,
      phone,
      form_id,
      form_name,
      message,
      priority,
      form_data
    }, tenantSettings);

    if (!workflowResult.success) {
      console.error('[Workflow Trigger Failed]', workflowResult.error);
      await logEvent(tenant_id, 'workflow_trigger_failed', {
        error: workflowResult.error
      });
      return res.status(500).json({
        error: 'Failed to process form submission',
        details: workflowResult.error
      });
    }

    // Log success event
    await logEvent(tenant_id, 'webform_autoreply_processed', {
      form_id,
      form_name,
      submitter_email: email,
      lead_id: leadResult?.leadId,
      assigned_to: assignmentResult?.assignedUserId
    });

    return res.status(200).json({
      status: 'success',
      message: 'Form submission processed and auto-reply queued',
      lead_id: leadResult?.leadId,
      form_id,
      assigned_to: assignmentResult?.assignedUserName || null
    });
  } catch (error) {
    console.error('[Unhandled Error]', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
