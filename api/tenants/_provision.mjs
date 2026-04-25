// api/tenants/_provision.mjs — shared dormant-catalog provisioning (idempotent)
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
import { backend, getTenant, upsertEntitlement } from './_store.mjs';
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

  const byCategory = {};
  const now = new Date().toISOString();
  const configRows = [];

  for (const mod of allModules) {
    const code = mod.module_code;
    const category = mod.category || 'uncategorized';

    byCategory[category] = (byCategory[category] || 0) + 1;

    const configId = genId('acfg');
    const isRecommended = recommendedModules.has(code);

    await upsertEntitlement(tenant_id, code, {
      state: 'dormant',
      billing_source: { source_type: 'registration_provision', provisioned_at: now },
      config_state: isRecommended ? { recommended: true, blueprint: blueprint_code } : null,
    });

    configRows.push({
      configId,
      tenant_id,
      code,
      settings: isRecommended ? { recommended: true } : {},
      timezone: tenant.timezone || 'America/New_York',
    });
  }

  if (backend === 'postgres' && configRows.length > 0) {
    await ensureAutomationTables();
    const db = pool();
    const configValues = [];
    const configParams = [];
    let cfgIdx = 1;
    for (const row of configRows) {
      configValues.push(
        `($${cfgIdx++}, $${cfgIdx++}, $${cfgIdx++}, false, $${cfgIdx++}::jsonb, $${cfgIdx++})`
      );
      configParams.push(
        row.configId,
        row.tenant_id,
        row.code,
        JSON.stringify(row.settings),
        row.timezone,
      );
    }
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
