// api/tenants/create-tenant.js — POST /api/tenants/create-tenant
// -----------------------------------------------------------------------------
// Provisions a new tenant workspace. If a blueprint_code is provided, applies
// the blueprint's defaults (business hours, tone, capability assumptions, etc).
//
// Request body:
//   {
//     business_name?: string,
//     blueprint_code?: "hvac" | "plumbing" | ... (see product/blueprints/),
//     plan?: "core" | "foundation" | "professional" | "enterprise",
//     timezone?: string,
//     locale?: string,
//     profile?: object
//   }
//
// Response: the created tenant record.
// -----------------------------------------------------------------------------

import { corsPreflight, methodGuard, readBody } from './_lib.mjs';
import { createTenant } from './_store.mjs';
import { getCatalog } from '../catalog/_lib.mjs';
import { provisionAllAutomations } from './_provision.mjs';
import { verifyPaidOrAdminCredential } from './_auth.mjs';

export const maxDuration = 30;

const CREATE_TENANT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const CREATE_TENANT_RATE_LIMIT_MAX = 20;
const createTenantRateLimits = new Map();

function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'] || req.headers?.['X-Forwarded-For'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return String(first || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim() || 'unknown';
}

function enforceRateLimit(key) {
  const now = Date.now();
  const bucket = createTenantRateLimits.get(key);
  if (!bucket || now > bucket.resetAt) {
    createTenantRateLimits.set(key, { count: 1, resetAt: now + CREATE_TENANT_RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }
  bucket.count += 1;
  if (bucket.count > CREATE_TENANT_RATE_LIMIT_MAX) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true };
}

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;

  let body;
  try { body = await readBody(req, { maxBytes: 64_000 }); } catch (e) {
    return res.status(e.code === 'payload_too_large' ? 413 : 400).json({
      error: e.code === 'payload_too_large' ? 'payload_too_large' : 'invalid_json',
    });
  }

  const { business_name, blueprint_code, plan, timezone, locale, profile, user_id, owner_user_id, owner_email } = body || {};
  const requestedOwnerSubject = owner_user_id || user_id || profile?.owner_user_id || profile?.user_id || profile?.clerk_user_id || owner_email || profile?.email || '';
  const authCheck = verifyPaidOrAdminCredential(req, body || {}, {
    subject: requestedOwnerSubject,
    tier: plan || body?.tier || '',
  });
  if (!authCheck.ok) {
    return res.status(authCheck.status || 401).json({ error: authCheck.error || 'authentication_required' });
  }

  const rateKey = authCheck.admin
    ? `admin:${getClientIp(req)}`
    : `pay:${authCheck.session_id || authCheck.subject || getClientIp(req)}`;
  const rate = enforceRateLimit(rateKey);
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    return res.status(429).json({ error: 'tenant_create_rate_limited', retry_after_seconds: rate.retryAfter });
  }

  let blueprint = null;
  if (blueprint_code) {
    blueprint = getCatalog().blueprints.find((b) => b.blueprint_code === blueprint_code);
    if (!blueprint) {
      return res.status(400).json({ error: `blueprint '${blueprint_code}' not found` });
    }
  }

  const ownerSubject = authCheck.admin
    ? (requestedOwnerSubject || null)
    : (authCheck.subject && authCheck.subject !== 'anon' ? authCheck.subject : null);
  if (!authCheck.admin && !ownerSubject) {
    return res.status(403).json({ error: 'tenant_owner_required' });
  }
  const input = {
    business_name: business_name || (blueprint ? `New ${blueprint.name}` : 'Untitled Business'),
    business_type: blueprint_code || 'general',
    blueprint_code: blueprint_code || null,
    plan: authCheck.admin ? (plan || 'core') : (authCheck.tier || plan || 'core'),
    timezone: timezone || 'America/New_York',
    locale: locale || 'en-US',
    profile: {
      ...(blueprint?.default_hours ? { hours: blueprint.default_hours } : {}),
      ...(profile || {}),
      ...(ownerSubject ? { owner_user_id: ownerSubject, user_id: ownerSubject } : {}),
      ...(owner_email ? { email: owner_email } : {}),
    },
    // New tenants start with zero capabilities — they get enabled by wizards.
    capabilities_enabled: [],
  };

  const tenant = await createTenant(input);

  // Pre-seed catalog: load all automations as dormant so they're ready to activate
  // on button-click. This is fire-and-forget — tenant creation succeeds even if
  // provisioning hits an edge case. The provision endpoint is idempotent and can
  // be re-called later.
  let provisioning = null;
  try {
    provisioning = await provisionAllAutomations({
      tenant_id: tenant.tenant_id,
      blueprint_code: blueprint_code || null,
    });
  } catch (e) {
    console.error('[create-tenant] automation provisioning failed (non-fatal):', e.message);
    provisioning = { ok: false, error: e.message };
  }

  return res.status(201).json({
    tenant,
    blueprint_applied: blueprint
      ? {
          code: blueprint.blueprint_code,
          recommended_modules: blueprint.recommended_modules || [],
          recommended_bundles: blueprint.recommended_bundles || [],
          dashboard_kpis: blueprint.dashboard_kpis || [],
        }
      : null,
    automations_provisioned: provisioning,
  });
}
