// api/automations/webhook.js — Inbound webhook handler
// =============================================================================
// Accepts webhooks from external platforms:
//   - CallScaler: missed calls
//   - Stripe: payments (backup to billing/webhook.js)
//   - Trafft: appointments
//   - Form submissions: inbound leads
//
// For each webhook:
//   1. Validate signature (where applicable)
//   2. Map event to automation trigger format
//   3. Call event bus emit() to trigger matching automations
//   4. Log the webhook to automation_runs
//
// Response: {ok: true/false, webhook_id, status}
// =============================================================================

import pg from 'pg';
import crypto from 'crypto';
import { emit } from '../events/_bus.mjs';

const { Pool } = pg;

export const maxDuration = 30;

// Database pool
let _pool = null;

function pool() {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  _pool = new Pool({
    connectionString: url,
    ssl: url?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
  return _pool;
}

// Utility: ensure automation_runs table exists
async function ensureSchema() {
  const sql = `
    create table if not exists automation_runs (
      run_id text primary key,
      tenant_id text references tenants(tenant_id) on delete cascade,
      module_code text,
      trigger_type text not null,
      status text not null default 'pending',
      result jsonb,
      error_message text,
      started_at timestamptz not null default now(),
      completed_at timestamptz,
      duration_ms int,
      webhook_source text,
      webhook_id text
    );
    create index if not exists automation_runs_tenant_idx on automation_runs(tenant_id);
    create index if not exists automation_runs_webhook_idx on automation_runs(webhook_id);
  `;
  try {
    await pool().query(sql);
  } catch (e) {
    console.error('[webhooks] schema error:', e.message);
  }
}

// Generate IDs
function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const now = () => new Date().toISOString();

// =============================================================================
// SIGNATURE VALIDATION
// =============================================================================

function validateHmacSignature(body, signature, secret) {
  if (!secret || secret.startsWith('STUB')) return true; // Stub mode
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return hash === signature;
}

// Stripe signature validation (using key from env or DYNASTY_TOOL_CONFIG)
function validateStripeSignature(body, stripeSignature, secret) {
  if (!secret || secret.startsWith('STUB')) return true; // Stub mode
  const [timestamp, signature] = stripeSignature.split(',').map((s) => s.split('=')[1]);
  if (!timestamp || !signature) return false;
  const signed = `${timestamp}.${body}`;
  const hash = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  return hash === signature;
}

// =============================================================================
// READ RAW BODY (required for signature validation)
// =============================================================================

async function readRawBody(req) {
  if (req.rawBody) return req.rawBody;
  const chunks = [];
  return new Promise((resolve, reject) => {
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// =============================================================================
// CALLSCALER: MISSED CALLS
// =============================================================================

async function handleCallScalerWebhook(body, headers, res) {
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;

    // Validate signature
    const signature = headers['x-callscaler-signature'] || '';
    const secret = process.env.CALLSCALER_WEBHOOK_SECRET || '';
    if (!validateHmacSignature(typeof body === 'string' ? body : JSON.stringify(body), signature, secret)) {
      return res.status(401).json({ ok: false, error: 'Invalid signature' });
    }

    const webhook_id = newId('wh');

    // Map CallScaler event to automation trigger
    const event_type = data.event_type || 'call.missed';
    const tenant_id = data.tenant_id || data.metadata?.tenant_id;

    if (!tenant_id) {
      return res.status(400).json({ ok: false, error: 'tenant_id required in webhook' });
    }

    // Log webhook
    const run_id = newId('arun');
    await ensureSchema();
    await pool().query(
      `insert into automation_runs (run_id, tenant_id, trigger_type, status, result, started_at, webhook_source, webhook_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [run_id, tenant_id, 'webhook:callscaler', 'success', JSON.stringify(data), now(), 'callscaler', webhook_id],
    );

    // Emit event to bus (automation dispatcher will pick it up)
    emit(`webhook.callscaler.${event_type}`, {
      tenant_id,
      webhook_id,
      source: 'callscaler',
      original_event: data,
      missed_call: {
        caller: data.caller_number,
        timestamp: data.timestamp,
        duration: data.duration || 0,
      },
    });

    return res.json({ ok: true, webhook_id, status: 'received' });
  } catch (e) {
    console.error('[webhooks.callscaler]', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// =============================================================================
// STRIPE: PAYMENTS (backup handler, primary is billing/webhook.js)
// =============================================================================

async function handleStripeWebhook(body, headers, res) {
  try {
    const signature = headers['stripe-signature'] || '';
    const secret = process.env.STRIPE_WEBHOOK_SECRET || '';

    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    if (!validateStripeSignature(raw, signature, secret)) {
      return res.status(401).json({ ok: false, error: 'Invalid signature' });
    }

    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const webhook_id = newId('wh');

    // For this handler, we focus on automation triggers (not entitlement mutations).
    // Primary Stripe handling is in api/billing/webhook.js.

    const event_type = data.type || 'unknown';
    const tenant_id = data.data?.object?.metadata?.tenant_id;

    if (!tenant_id) {
      // Still log it, but don't fail
      await ensureSchema();
      await pool().query(
        `insert into automation_runs (run_id, trigger_type, status, result, started_at, webhook_source, webhook_id)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [newId('arun'), 'webhook:stripe', 'pending', JSON.stringify({ event_type }), now(), 'stripe', webhook_id],
      );
      return res.json({ ok: true, webhook_id, status: 'received (no tenant)' });
    }

    await pool().query(
      `insert into automation_runs (run_id, tenant_id, trigger_type, status, result, started_at, webhook_source, webhook_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [newId('arun'), tenant_id, 'webhook:stripe', 'success', JSON.stringify(data), now(), 'stripe', webhook_id],
    );

    // Emit to event bus
    emit(`webhook.stripe.${event_type}`, {
      tenant_id,
      webhook_id,
      source: 'stripe',
      original_event: data,
      event_type,
    });

    return res.json({ ok: true, webhook_id, status: 'received' });
  } catch (e) {
    console.error('[webhooks.stripe]', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// =============================================================================
// TRAFFT: APPOINTMENTS
// =============================================================================

async function handleTrafftWebhook(body, headers, res) {
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;

    // Validate signature
    const signature = headers['x-trafft-signature'] || '';
    const secret = process.env.TRAFFT_WEBHOOK_SECRET || '';
    if (!validateHmacSignature(typeof body === 'string' ? body : JSON.stringify(body), signature, secret)) {
      return res.status(401).json({ ok: false, error: 'Invalid signature' });
    }

    const webhook_id = newId('wh');
    const event_type = data.event || 'appointment.created';
    const tenant_id = data.tenant_id || data.metadata?.tenant_id;

    if (!tenant_id) {
      return res.status(400).json({ ok: false, error: 'tenant_id required in webhook' });
    }

    // Log webhook
    const run_id = newId('arun');
    await ensureSchema();
    await pool().query(
      `insert into automation_runs (run_id, tenant_id, trigger_type, status, result, started_at, webhook_source, webhook_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [run_id, tenant_id, 'webhook:trafft', 'success', JSON.stringify(data), now(), 'trafft', webhook_id],
    );

    // Emit event
    emit(`webhook.trafft.${event_type}`, {
      tenant_id,
      webhook_id,
      source: 'trafft',
      original_event: data,
      appointment: {
        id: data.appointment_id,
        start_time: data.start_time,
        end_time: data.end_time,
        resource: data.resource_id,
        customer: data.customer_id,
      },
    });

    return res.json({ ok: true, webhook_id, status: 'received' });
  } catch (e) {
    console.error('[webhooks.trafft]', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// =============================================================================
// FORM SUBMISSIONS: INBOUND LEADS
// =============================================================================

async function handleFormWebhook(body, headers, res) {
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const webhook_id = newId('wh');

    // Form webhooks are trusted (authenticated client sends them).
    // tenant_id is required.
    const tenant_id = data.tenant_id || data.metadata?.tenant_id;
    if (!tenant_id) {
      return res.status(400).json({ ok: false, error: 'tenant_id required in webhook' });
    }

    const run_id = newId('arun');
    await ensureSchema();
    await pool().query(
      `insert into automation_runs (run_id, tenant_id, trigger_type, status, result, started_at, webhook_source, webhook_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [run_id, tenant_id, 'webhook:form', 'success', JSON.stringify(data), now(), 'form', webhook_id],
    );

    // Emit event
    emit('webhook.form.submission', {
      tenant_id,
      webhook_id,
      source: 'form',
      original_event: data,
      form_data: {
        form_id: data.form_id,
        email: data.email,
        phone: data.phone,
        name: data.name,
        fields: data.fields || {},
      },
    });

    return res.json({ ok: true, webhook_id, status: 'received' });
  } catch (e) {
    console.error('[webhooks.form]', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// =============================================================================
// ROUTER: Dispatch by source
// =============================================================================

export default async function handler(req, res) {
  // CORS preflight
  const allowedOrigin = process.env.CORS_ORIGIN || 'https://yourdeputy.com';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-callscaler-signature, stripe-signature, x-trafft-signature');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }

  // Determine webhook source
  let body;
  try {
    body = await readRawBody(req);
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'Failed to read body' });
  }

  // Parse for routing
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid JSON' });
  }

  const source = req.query?.source || parsed.source || 'unknown';
  const req_with_body = { ...req, rawBody: body };

  if (source === 'callscaler' || req.headers['x-callscaler-signature']) {
    return await handleCallScalerWebhook(parsed, req.headers, res);
  }

  if (source === 'stripe' || req.headers['stripe-signature']) {
    return await handleStripeWebhook(body, req.headers, res);
  }

  if (source === 'trafft' || req.headers['x-trafft-signature']) {
    return await handleTrafftWebhook(parsed, req.headers, res);
  }

  if (source === 'form') {
    return await handleFormWebhook(parsed, req.headers, res);
  }

  // Unknown source
  return res.status(400).json({
    ok: false,
    error: 'Unknown webhook source',
    hint: 'Set ?source=callscaler|stripe|trafft|form or include provider signature header',
  });
}
