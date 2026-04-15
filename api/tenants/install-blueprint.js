// api/tenants/install-blueprint.js — POST /api/tenants/install-blueprint
// -----------------------------------------------------------------------------
// Applies a blueprint's recommended_modules to a tenant by creating
// entitlement rows in state='entitled'. Does NOT activate (capabilities
// still need wizards). This is the "your starter stack is now available to
// turn on" step that happens after signup.
//
// In production, billing (Track 7) decides which modules are paid for and
// therefore entitled. This endpoint is admin-gated because it bypasses that
// path; it's for onboarding, test tenants, and concierge comp.
//
// Body: { tenant_id, blueprint_code }
// Response: { tenant, entitlements_created: [...] }
// -----------------------------------------------------------------------------

import { corsPreflight, methodGuard, readBody, adminOnly } from './_lib.mjs';
import { getTenant, updateTenant } from './_store.mjs';
import { grantEntitlement } from './_activation.mjs';
import { getCatalog } from '../catalog/_lib.mjs';

export const maxDuration = 30;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;
  if (!adminOnly(req, res)) return;

  let body;
  try { body = await readBody(req); } catch (e) {
    return res.status(400).json({ error: 'invalid_json' });
  }
  const { tenant_id, blueprint_code } = body || {};
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });
  if (!blueprint_code) return res.status(400).json({ error: 'blueprint_code required' });

  const tenant = await getTenant(tenant_id);
  if (!tenant) return res.status(404).json({ error: 'tenant_not_found' });

  const blueprint = getCatalog().blueprints.find((b) => b.blueprint_code === blueprint_code);
  if (!blueprint) return res.status(404).json({ error: `blueprint '${blueprint_code}' not found` });

  const recommended = blueprint.recommended_modules || [];
  const knownModules = new Set(getCatalog().modules.map((m) => m.module_code));

  const created = [];
  const skipped = [];
  for (const module_code of recommended) {
    if (!knownModules.has(module_code)) {
      skipped.push({ module_code, reason: 'unknown_module' });
      continue;
    }
    const ent = await grantEntitlement({
      tenant_id,
      module_code,
      billing_source: { source_type: 'plan_included', source_code: `blueprint:${blueprint_code}` },
    });
    created.push({ module_code, entitlement_id: ent.entitlement_id, state: ent.state });
  }

  // Record blueprint on tenant (create-tenant already sets this; this is a
  // safety-net if install-blueprint is called on an existing tenant).
  await updateTenant(tenant_id, { blueprint_installed: blueprint_code, business_type: blueprint_code });

  return res.status(200).json({
    tenant: await getTenant(tenant_id),
    blueprint: {
      code: blueprint_code,
      name: blueprint.name,
      recommended_modules: recommended,
      dashboard_kpis: blueprint.dashboard_kpis || [],
    },
    entitlements_created: created,
    entitlements_skipped: skipped,
  });
}
