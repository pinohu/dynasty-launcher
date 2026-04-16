// api/tenants/provision-automations.js — POST /api/tenants/provision-automations
// -----------------------------------------------------------------------------
// When a new tenant is created, pre-load ALL automations as dormant entries.
// Every automation is configured and ready to go, but only activates when paid.
//
// Body: { tenant_id, blueprint_code? }
//
// Responses:
//   200 { ok: true, tenant_id, total_provisioned, by_category: {...}, recommended_modules: [...], recommended_packs: [...] }
//   400 { error }                                           (validation failed)
//   404 { error }                                           (tenant not found)
// Fully idempotent — calling again skips already-provisioned modules.
// Emits: tenant.automations_provisioned
// -----------------------------------------------------------------------------

import { corsPreflight, methodGuard, readBody } from './_lib.mjs';
import { getTenant } from './_store.mjs';
import { getCatalog, indexModules } from '../catalog/_lib.mjs';
import { emit } from '../events/_bus.mjs';
import pg from 'pg';

const { Pool } = pg;

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

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const now = () => new Date().toISOString();

export const maxDuration = 60;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;

  let body;
  try { body = await readBody(req); } catch (e) {
    return res.status(400).json({ error: 'invalid_json' });
  }

  const { tenant_id, blueprint_code } = body || {};
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });

  // Verify tenant exists
  const tenant = await getTenant(tenant_id);
  if (!tenant) return res.status(404).json({ error: 'tenant_not_found' });

  try {
    const result = await provisionAutomations(tenant_id, blueprint_code);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[provision-automations]', err);
    return res.status(500).json({ error: 'provision_failed', details: String(err.message || err) });
  }
}

async function provisionAutomations(tenant_id, blueprint_code) {
  const catalog = getCatalog();
  const modules = catalog.modules || [];
  const blueprints = catalog.blueprints || [];
  const bundles = catalog.bundles || [];

  // Find the blueprint if specified to get recommended modules
  const blueprint = blueprint_code
    ? blueprints.find((b) => b.blueprint_code === blueprint_code)
    : null;

  const recommendedModules = new Set(blueprint?.recommended_modules || []);
  const recommendedBundles = new Set(blueprint?.recommended_bundles || []);

  // Build category index
  const byCategory = {};
  for (const mod of modules) {
    const cat = mod.category || 'uncategorized';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(mod);
  }

  // Prepare bulk insert data for entitlements and automations_config
  const entitlementRows = [];
  const automationsRows = [];
  const provisionedModules = [];

  for (const module of modules) {
    const { module_code } = module;
    if (!module_code) continue;

    const config_state = recommendedModules.has(module_code) ? { recommended: true, blueprint: blueprint_code } : null;

    const ent_id = newId('ent');
    const config_id = newId('cfg');

    entitlementRows.push({
      entitlement_id: ent_id,
      tenant_id,
      module_code,
      state: 'dormant',
      billing_source: { source_type: 'provision_automation' },
      config_state,
      prereq_check: null,
      activated_at: null,
      deactivated_at: null,
    });

    automationsRows.push({
      config_id,
      tenant_id,
      module_code,
      is_enabled: false,
      settings: {},
      quiet_hours_start: null,
      quiet_hours_end: null,
      timezone: 'America/New_York',
      last_triggered_at: null,
      trigger_count: 0,
      created_at: now(),
      updated_at: now(),
    });

    provisionedModules.push({
      module_code,
      category: module.category,
      is_recommended: recommendedModules.has(module_code),
    });
  }

  // Batch insert via direct pool connection
  const insertEntitlementsSql = `
    INSERT INTO entitlements (
      entitlement_id, tenant_id, module_code, state,
      billing_source, config_state, prereq_check, activated_at, deactivated_at
    )
    VALUES
    ${entitlementRows.map((_, i) => `($${i * 9 + 1}, $${i * 9 + 2}, $${i * 9 + 3}, $${i * 9 + 4}, $${i * 9 + 5}::jsonb, $${i * 9 + 6}::jsonb, $${i * 9 + 7}::jsonb, $${i * 9 + 8}, $${i * 9 + 9})`).join(',')}
    ON CONFLICT (tenant_id, module_code) DO NOTHING
  `;

  const entParams = entitlementRows.flatMap((r) => [
    r.entitlement_id,
    r.tenant_id,
    r.module_code,
    r.state,
    JSON.stringify(r.billing_source),
    r.config_state ? JSON.stringify(r.config_state) : null,
    r.prereq_check ? JSON.stringify(r.prereq_check) : null,
    r.activated_at,
    r.deactivated_at,
  ]);

  const insertAutomationsSql = `
    INSERT INTO automations_config (
      config_id, tenant_id, module_code, is_enabled, settings,
      quiet_hours_start, quiet_hours_end, timezone, last_triggered_at, trigger_count,
      created_at, updated_at
    )
    VALUES
    ${automationsRows.map((_, i) => `($${i * 12 + 1}, $${i * 12 + 2}, $${i * 12 + 3}, $${i * 12 + 4}, $${i * 12 + 5}::jsonb, $${i * 12 + 6}::time, $${i * 12 + 7}::time, $${i * 12 + 8}, $${i * 12 + 9}, $${i * 12 + 10}, $${i * 12 + 11}, $${i * 12 + 12})`).join(',')}
    ON CONFLICT (tenant_id, module_code) DO NOTHING
  `;

  const autParams = automationsRows.flatMap((r) => [
    r.config_id,
    r.tenant_id,
    r.module_code,
    r.is_enabled,
    JSON.stringify(r.settings),
    r.quiet_hours_start,
    r.quiet_hours_end,
    r.timezone,
    r.last_triggered_at,
    r.trigger_count,
    r.created_at,
    r.updated_at,
  ]);

  // Execute both inserts
  const p = pool();
  try {
    await p.query(insertEntitlementsSql, entParams);
    await p.query(insertAutomationsSql, autParams);
  } catch (err) {
    console.error('[provision-automations] batch insert failed', err);
    throw err;
  }

  // Build response
  const categoryStats = {};
  for (const [cat, mods] of Object.entries(byCategory)) {
    categoryStats[cat] = mods.length;
  }

  const recommended = provisionedModules.filter((m) => m.is_recommended).map((m) => m.module_code);
  const recommendedPacks = Array.from(recommendedBundles);

  const summary = {
    ok: true,
    tenant_id,
    total_provisioned: modules.length,
    by_category: categoryStats,
    recommended_modules: recommended,
    recommended_packs: recommendedPacks,
  };

  // Emit event
  emit('tenant.automations_provisioned', summary);

  return summary;
}
