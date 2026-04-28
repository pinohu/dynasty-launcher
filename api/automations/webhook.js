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
    alter table automation_runs add column if not exists trigger_type text;
    alter table automation_runs add column if not exists result jsonb;
    alter table automation_runs add column if not exists webhook_source text;
    alter table automation_runs add column if not exists webhook_id text;
    alter table automation_runs alter column tenant_id drop not null;
    alter table automation_runs alter column module_code drop not null;
    alter table automation_runs alter column trigger_type drop not null;
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
  if (!realWebhookSecret(secret)) return { ok: false, status: 503, error: 'webhook_secret_missing' };
  if (!signature) return { ok: false, status: 401, error: 'webhook_signature_required' };
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return timingSafeEqualString(hash, signature)
    ? { ok: true }
    : { ok: false, status: 401, error: 'invalid_signature' };
}

function header(headers, name) {
  const needle = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() === needle) {
      return Array.isArray(value) ? String(value[0] || '') : String(value || '');
    }
  }
  return '';
}

function queryValue(query, name) {
  const value = query?.[name];
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function tokenMatchesSecret(value, secret) {
  const supplied = String(value || '').trim();
  if (!supplied) return false;
  const bearer = supplied.replace(/^bearer\s+/i, '').replace(/^token\s+/i, '').trim();
  return timingSafeEqualString(supplied, secret) || timingSafeEqualString(bearer, secret);
}

function validateProviderWebhookAuth({ body, headers, query, signatureHeader, tokenHeaders = [], secret, allowQueryToken = false }) {
  const realSecret = realWebhookSecret(secret);
  if (!realSecret) return { ok: false, status: 503, error: 'webhook_secret_missing' };

  const signature = signatureHeader ? header(headers, signatureHeader) : '';
  if (signature) {
    const hmac = validateHmacSignature(body, signature, realSecret);
    if (hmac.ok) return hmac;
  }

  for (const name of tokenHeaders) {
    if (tokenMatchesSecret(header(headers, name), realSecret)) return { ok: true };
  }

  if (allowQueryToken) {
    const token = queryValue(query, 'webhook_token') || queryValue(query, 'token');
    if (tokenMatchesSecret(token, realSecret)) return { ok: true };
  }

  return {
    ok: false,
    status: 401,
    error: signature ? 'invalid_signature' : 'webhook_signature_required',
  };
}

// Stripe signature validation (using key from env or DYNASTY_TOOL_CONFIG)
function validateStripeSignature(body, stripeSignature, secret) {
  if (!realWebhookSecret(secret)) return { ok: false, status: 503, error: 'webhook_secret_missing' };
  if (!stripeSignature) return { ok: false, status: 401, error: 'webhook_signature_required' };
  const parsed = {};
  for (const part of String(stripeSignature).split(',')) {
    const [key, value] = part.split('=');
    if (!key || !value) continue;
    if (!parsed[key]) parsed[key] = [];
    parsed[key].push(value);
  }
  const timestamp = parsed.t?.[0];
  const signatures = parsed.v1 || [];
  if (!timestamp || !signatures.length) return { ok: false, status: 401, error: 'invalid_signature' };
  const ts = Number(timestamp);
  const toleranceSec = Number.parseInt(process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS || '300', 10);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSec) {
    return { ok: false, status: 401, error: 'signature_timestamp_out_of_tolerance' };
  }
  const signed = `${timestamp}.${body}`;
  const hash = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  return signatures.some((sig) => timingSafeEqualString(hash, sig))
    ? { ok: true }
    : { ok: false, status: 401, error: 'invalid_signature' };
}

function realWebhookSecret(value) {
  const v = String(value || '').trim();
  return v && !v.startsWith('STUB') && !v.startsWith('EXPIRED') ? v : '';
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function rejectSignature(res, check) {
  return res.status(check.status || 401).json({ ok: false, error: check.error || 'invalid_signature' });
}

function resolveTenantId(data, query) {
  return data.tenant_id
    || data.metadata?.tenant_id
    || data.data?.object?.metadata?.tenant_id
    || queryValue(query, 'tenant_id')
    || null;
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

async function handleCallScalerWebhook(body, headers, query, res) {
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;

    const secret = process.env.CALLSCALER_WEBHOOK_SECRET || '';
    const signatureCheck = validateProviderWebhookAuth({
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers,
      query,
      signatureHeader: 'x-callscaler-signature',
      tokenHeaders: ['authorization', 'x-callscaler-token', 'x-webhook-token'],
      secret,
      allowQueryToken: true,
    });
    if (!signatureCheck.ok) return rejectSignature(res, signatureCheck);

    const webhook_id = newId('wh');

    // Map CallScaler event to automation trigger
    const event_type = data.event_type || 'call.missed';
    const tenant_id = resolveTenantId(data, query);

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

async function handleStripeWebhook(body, headers, query, res) {
  try {
    const signature = headers['stripe-signature'] || '';
    const secret = process.env.STRIPE_WEBHOOK_SECRET || '';

    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    const signatureCheck = validateStripeSignature(raw, signature, secret);
    if (!signatureCheck.ok) return rejectSignature(res, signatureCheck);

    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const webhook_id = newId('wh');

    // For this handler, we focus on automation triggers (not entitlement mutations).
    // Primary Stripe handling is in api/billing/webhook.js.

    const event_type = data.type || 'unknown';
    const tenant_id = resolveTenantId(data, query);

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

async function handleTrafftWebhook(body, headers, query, res) {
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;

    const secret = process.env.TRAFFT_WEBHOOK_SECRET || '';
    const signatureCheck = validateProviderWebhookAuth({
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers,
      query,
      signatureHeader: 'x-trafft-signature',
      tokenHeaders: ['authorization', 'x-trafft-token', 'x-webhook-token'],
      secret,
    });
    if (!signatureCheck.ok) return rejectSignature(res, signatureCheck);

    const webhook_id = newId('wh');
    const event_type = data.event || 'appointment.created';
    const tenant_id = resolveTenantId(data, query);

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

async function handleFormWebhook(body, headers, query, res) {
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const webhook_id = newId('wh');

    const secret = process.env.FORM_WEBHOOK_SECRET || process.env.AUTOMATION_FORM_WEBHOOK_SECRET || '';
    const signatureCheck = validateProviderWebhookAuth({
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers,
      query,
      signatureHeader: header(headers, 'x-form-signature') ? 'x-form-signature' : 'x-webhook-signature',
      tokenHeaders: ['authorization', 'x-formaloo-token', 'x-form-token', 'x-webhook-token'],
      secret,
      allowQueryToken: true,
    });
    if (!signatureCheck.ok) return rejectSignature(res, signatureCheck);

    // tenant_id is required.
    const tenant_id = resolveTenantId(data, query);
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

    return res.status(200).end();
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-callscaler-signature, stripe-signature, x-trafft-signature, x-form-signature, x-webhook-signature, x-callscaler-token, x-trafft-token, x-formaloo-token, x-form-token, x-webhook-token');

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

  if (source === 'callscaler' || req.headers['x-callscaler-signature']) {
    return await handleCallScalerWebhook(body, req.headers, req.query || {}, res);
  }

  if (source === 'stripe' || req.headers['stripe-signature']) {
    return await handleStripeWebhook(body, req.headers, req.query || {}, res);
  }

  if (source === 'trafft' || req.headers['x-trafft-signature']) {
    return await handleTrafftWebhook(body, req.headers, req.query || {}, res);
  }

  if (source === 'form') {
    return await handleFormWebhook(body, req.headers, req.query || {}, res);
  }

  // Unknown source
  return res.status(400).json({
    ok: false,
    error: 'Unknown webhook source',
    hint: 'Set ?source=callscaler|stripe|trafft|form or include provider signature header',
  });
}
