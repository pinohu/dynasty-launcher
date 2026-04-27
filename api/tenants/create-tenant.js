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

export const maxDuration = 30;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;

  let body;
  try { body = await readBody(req); } catch (e) {
    return res.status(400).json({ error: 'invalid_json' });
  }

  const { business_name, blueprint_code, plan, timezone, locale, profile, user_id, owner_user_id, owner_email } = body || {};

  let blueprint = null;
  if (blueprint_code) {
    blueprint = getCatalog().blueprints.find((b) => b.blueprint_code === blueprint_code);
    if (!blueprint) {
      return res.status(400).json({ error: `blueprint '${blueprint_code}' not found` });
    }
  }

  const ownerSubject = owner_user_id || user_id || profile?.owner_user_id || profile?.user_id || profile?.clerk_user_id || owner_email || profile?.email || null;
  const input = {
    business_name: business_name || (blueprint ? `New ${blueprint.name}` : 'Untitled Business'),
    business_type: blueprint_code || 'general',
    blueprint_code: blueprint_code || null,
    plan: plan || 'core',
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
