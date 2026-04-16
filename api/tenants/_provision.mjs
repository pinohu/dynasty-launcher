// api/tenants/_provision.mjs — shared zero-touch provisioning logic
// -----------------------------------------------------------------------------
// Pre-loads ALL automations as dormant entries for a tenant. Called by both
// create-tenant.js (automatically on signup) and provision-automations.js
// (manual re-run / repair endpoint).
//
// Every module gets:
//   - An entitlement row with state='dormant'
//   - An automations_config row with is_enabled=false
//
// Fully idempotent — safe to call multiple times for the same tenant.
// Uses batch INSERT ... ON CONFLICT DO NOTHING for efficiency.
// -----------------------------------------------------------------------------

import pg from 'pg';
const { Pool } = pg;
import { getCatalog } from '../catalog/_lib.mjs';
import { getTenant } from './_store.mjs';
import { emit } from '../events/_bus.mjs';

let _pool;
function pool() {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  _pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
  return _pool;
}

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Inline table creation — no file path resolution needed in lambda sandbox
let _tablesReady = false;
async function ensureAutomationTables() {
  if (_tablesReady) return;
  await pool().query(`
    CREATE TABLE IF NOT EXISTS automations_config (
      config_id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
      module_code text NOT NULL,
      is_enabled boolean NOT NULL DEFAULT false,
      settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      quiet_hours_start time,
      quiet_hours_end time,
      timezone text NOT NULL DEFAULT 'America/New_York',
      last_triggered_at timestamptz,
      trigger_count integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, module_code)
    );
    CREATE INDEX IF NOT EXISTS automations_config_tenant_idx ON automations_config (tenant_id);
    CREATE INDEX IF NOT EXISTS automations_config_module_idx ON automations_config (module_code);
  `);
  _tablesReady = true;
}

/**
 * Provision all automations as dormant for a tenant.
 *
 * @param {{ tenant_id: string, blueprint_code?: string }} opts
 * @returns {{ ok: boolean, total_provisioned: number, by_category: object, recommended_modules: string[], recommended_packs: string[] }}
 */
export async function provisionAllAutomations({ tenant_id, blueprint_code }) {
  // Validate tenant exists (triggers base schema migration via _store.mjs)
  const tenant = await getTenant(tenant_id);
  if (!tenant) throw new Error(`tenant '${tenant_id}' not found`);

  // Ensure automation tables exist before inserting
  await ensureAutomationTables();

  // Load full module catalog
  const catalog = getCatalog();
  const allModules = catalog.modules || [];
  const bundles = catalog.bundles || [];
  const blueprints = catalog.blueprints || [];

  if (allModules.length === 0) {
    return { ok: true, total_provisioned: 0, note: 'no modules in catalog' };
  }

  // Determine recommended modules/packs from blueprint
  const blueprint = blueprint_code
    ? blueprints.find((b) => b.blueprint_code === blueprint_code)
    : null;
  const recommendedModules = new Set(blueprint?.recommended_modules || []);
  const recommendedPacks = blueprint?.recommended_bundles || [];

  // Build category index
  const byCategory = {};

  // Batch-insert entitlements
  const entValues = [];
  const entParams = [];
  let entIdx = 1;

  // Batch-insert automations_config
  const configValues = [];
  const configParams = [];
  let cfgIdx = 1;

  const now = new Date().toISOString();

  for (const mod of allModules) {
    const code = mod.module_code;
    const category = mod.category || 'uncategorized';

    byCategory[category] = (byCategory[category] || 0) + 1;

    const entId = genId('ent');
    const configId = genId('acfg');
    const isRecommended = recommendedModules.has(code);

    // Entitlement row
    entValues.push(
      `($${entIdx++}, $${entIdx++}, $${entIdx++}, 'dormant', $${entIdx++}::jsonb, $${entIdx++}::jsonb)`
    );
    entParams.push(
      entId,
      tenant_id,
      code,
      JSON.stringify({ source_type: 'provision', provisioned_at: now }),
      isRecommended ? JSON.stringify({ recommended: true, blueprint: blueprint_code }) : null,
    );

    // Config row
    configValues.push(
      `($${cfgIdx++}, $${cfgIdx++}, $${cfgIdx++}, false, $${cfgIdx++}::jsonb, $${cfgIdx++})`
    );
    configParams.push(
      configId,
      tenant_id,
      code,
      JSON.stringify(isRecommended ? { recommended: true } : {}),
      tenant.timezone || 'America/New_York',
    );
  }

  const db = pool();

  // Batch insert entitlements (ON CONFLICT skip duplicates)
  if (entValues.length > 0) {
    await db.query(
      `INSERT INTO entitlements (entitlement_id, tenant_id, module_code, state, billing_source, config_state)
       VALUES ${entValues.join(', ')}
       ON CONFLICT (tenant_id, module_code) DO NOTHING`,
      entParams,
    );
  }

  // Batch insert automations_config (ON CONFLICT skip duplicates)
  if (configValues.length > 0) {
    await db.query(
      `INSERT INTO automations_config (config_id, tenant_id, module_code, is_enabled, settings, timezone)
       VALUES ${configValues.join(', ')}
       ON CONFLICT (tenant_id, module_code) DO NOTHING`,
      configParams,
    );
  }

  const summary = {
    ok: true,
    tenant_id,
    total_provisioned: allModules.length,
    by_category: byCategory,
    recommended_modules: [...recommendedModules],
    recommended_packs: recommendedPacks,
  };

  emit('tenant.automations_provisioned', {
    tenant_id,
    total: allModules.length,
    blueprint_code: blueprint_code || null,
  });

  return summary;
}
