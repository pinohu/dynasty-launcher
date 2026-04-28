// api/tenants/_store_postgres.mjs — Postgres adapter (Track 4)
// -----------------------------------------------------------------------------
// Drop-in replacement for _store_memory.mjs backed by Postgres via `pg`.
// Activated when DATABASE_URL is set.
//
// Schema is defined in scripts/migrations/001_initial.sql. Run with:
//   psql $DATABASE_URL < scripts/migrations/001_initial.sql
//
// The memory adapter remains the default for local dev and tests; this file
// is loaded by _store.mjs when DATABASE_URL is present.
// -----------------------------------------------------------------------------

import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;

let _pool = null;
let _migrated = false;

function normalizedDatabaseUrl(value) {
  const raw = String(value || '');
  try {
    const url = new URL(raw);
    const sslmode = url.searchParams.get('sslmode');
    if (['prefer', 'require', 'verify-ca'].includes(sslmode)) {
      url.searchParams.set('sslmode', 'verify-full');
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function pool() {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set; Postgres adapter requires it');
  _pool = new Pool({
    connectionString: normalizedDatabaseUrl(url),
    max: 10,
  });
  return _pool;
}

function migrationCandidates(selfDir, file) {
  return [
    join(process.cwd(), 'scripts', 'migrations', file),
    join(selfDir, '..', '..', 'scripts', 'migrations', file),
    join(selfDir, 'scripts', 'migrations', file),
  ];
}

function readMigration(selfDir, file) {
  for (const c of migrationCandidates(selfDir, file)) {
    if (existsSync(c)) return readFileSync(c, 'utf-8');
  }
  return '';
}

async function applyMigration(selfDir, file) {
  const sql = readMigration(selfDir, file);
  if (!sql) throw new Error(`missing bundled migration ${file}`);
  await pool().query(sql);
}

// Auto-migrate on first use. Safe on every cold start because the migrations
// use idempotent DDL. Required migrations fail closed so production cannot run
// with a partially initialized control plane.
async function ensureSchema() {
  if (_migrated) return;
  const selfDir = dirname(fileURLToPath(import.meta.url));
  let sql = readMigration(selfDir, '001_initial.sql');
  if (!sql) {
    // Inline fallback so the lambda works even if the migration file wasn't bundled.
    sql = `
      create table if not exists tenants (
        tenant_id text primary key,
        business_name text not null,
        business_type text not null default 'general',
        plan text not null default 'core',
        subscription_status text not null default 'active',
        onboarding_status text not null default 'in_progress',
        timezone text not null default 'America/New_York',
        locale text not null default 'en-US',
        profile jsonb not null default '{}'::jsonb,
        capabilities_enabled jsonb not null default '[]'::jsonb,
        modules_active jsonb not null default '[]'::jsonb,
        blueprint_installed text,
        compliance_mode text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create table if not exists entitlements (
        entitlement_id text primary key,
        tenant_id text not null references tenants(tenant_id) on delete cascade,
        module_code text not null,
        state text not null default 'entitled',
        billing_source jsonb not null default '{"source_type":"module"}'::jsonb,
        activated_at timestamptz,
        deactivated_at timestamptz,
        config_state jsonb,
        prereq_check jsonb,
        unique (tenant_id, module_code)
      );
      create index if not exists entitlements_tenant_idx on entitlements (tenant_id);
    `;
  }
  await pool().query(sql);

  for (const file of ['002_automation_tables.sql', '003_factory_jobs.sql']) {
    await applyMigration(selfDir, file);
  }

  _migrated = true;
}

const now = () => new Date().toISOString();
function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export const backend = 'postgres';

// -----------------------------------------------------------------------------
// Tenants
// -----------------------------------------------------------------------------

export async function createTenant(input = {}) {
  await ensureSchema();
  const tenant_id = input.tenant_id || newId('tnt');
  const row = {
    tenant_id,
    business_name: input.business_name || 'Untitled Business',
    business_type: input.business_type || input.blueprint_code || 'general',
    plan: input.plan || 'core',
    subscription_status: input.subscription_status || 'active',
    onboarding_status: input.onboarding_status || 'in_progress',
    timezone: input.timezone || 'America/New_York',
    locale: input.locale || 'en-US',
    profile: input.profile || {},
    capabilities_enabled: Array.isArray(input.capabilities_enabled) ? input.capabilities_enabled : [],
    modules_active: [],
    blueprint_installed: input.blueprint_code || null,
    compliance_mode: input.compliance_mode || null,
    created_at: now(),
    updated_at: now(),
  };
  await pool().query(
    `insert into tenants
      (tenant_id, business_name, business_type, plan, subscription_status,
       onboarding_status, timezone, locale, profile, capabilities_enabled,
       modules_active, blueprint_installed, compliance_mode, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14,$15)`,
    [
      row.tenant_id, row.business_name, row.business_type, row.plan, row.subscription_status,
      row.onboarding_status, row.timezone, row.locale, JSON.stringify(row.profile),
      JSON.stringify(row.capabilities_enabled), JSON.stringify(row.modules_active),
      row.blueprint_installed, row.compliance_mode, row.created_at, row.updated_at,
    ],
  );
  return { schema_version: '1.0.0', ...row };
}

function rowToTenant(r) {
  if (!r) return null;
  return {
    schema_version: '1.0.0',
    tenant_id: r.tenant_id,
    business_name: r.business_name,
    business_type: r.business_type,
    plan: r.plan,
    subscription_status: r.subscription_status,
    onboarding_status: r.onboarding_status,
    timezone: r.timezone,
    locale: r.locale,
    profile: r.profile || {},
    capabilities_enabled: r.capabilities_enabled || [],
    modules_active: r.modules_active || [],
    blueprint_installed: r.blueprint_installed,
    compliance_mode: r.compliance_mode,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function getTenant(tenant_id) {
  await ensureSchema();
  const { rows } = await pool().query(`select * from tenants where tenant_id = $1`, [tenant_id]);
  return rowToTenant(rows[0]);
}

export async function updateTenant(tenant_id, patch) {
  await ensureSchema();
  const t = await getTenant(tenant_id);
  if (!t) return null;
  const u = { ...t, ...patch, updated_at: now() };
  await pool().query(
    `update tenants set
       business_name = $2, business_type = $3, plan = $4, subscription_status = $5,
       onboarding_status = $6, timezone = $7, locale = $8, profile = $9::jsonb,
       capabilities_enabled = $10::jsonb, modules_active = $11::jsonb,
       blueprint_installed = $12, compliance_mode = $13, updated_at = $14
     where tenant_id = $1`,
    [
      tenant_id, u.business_name, u.business_type, u.plan, u.subscription_status,
      u.onboarding_status, u.timezone, u.locale, JSON.stringify(u.profile || {}),
      JSON.stringify(u.capabilities_enabled || []), JSON.stringify(u.modules_active || []),
      u.blueprint_installed, u.compliance_mode, u.updated_at,
    ],
  );
  return u;
}

export async function listTenants() {
  await ensureSchema();
  const { rows } = await pool().query(`select * from tenants order by created_at desc`);
  return rows.map(rowToTenant);
}

export async function setTenantCapability(tenant_id, cap, enabled) {
  await ensureSchema();
  const t = await getTenant(tenant_id);
  if (!t) return null;
  const s = new Set(t.capabilities_enabled || []);
  if (enabled) s.add(cap); else s.delete(cap);
  return updateTenant(tenant_id, { capabilities_enabled: [...s] });
}

// -----------------------------------------------------------------------------
// Entitlements
// -----------------------------------------------------------------------------

function rowToEntitlement(r) {
  if (!r) return null;
  return {
    schema_version: '1.0.0',
    entitlement_id: r.entitlement_id,
    tenant_id: r.tenant_id,
    module_code: r.module_code,
    state: r.state,
    billing_source: r.billing_source || { source_type: 'module' },
    activated_at: r.activated_at,
    deactivated_at: r.deactivated_at,
    config_state: r.config_state,
    prereq_check: r.prereq_check,
  };
}

export async function getEntitlement(tenant_id, module_code) {
  await ensureSchema();
  const { rows } = await pool().query(
    `select * from entitlements where tenant_id = $1 and module_code = $2`,
    [tenant_id, module_code],
  );
  return rowToEntitlement(rows[0]);
}

export async function upsertEntitlement(tenant_id, module_code, patch) {
  await ensureSchema();
  const existing = await getEntitlement(tenant_id, module_code);
  const merged = {
    schema_version: '1.0.0',
    entitlement_id: existing?.entitlement_id || newId('ent'),
    tenant_id,
    module_code,
    state: 'entitled',
    billing_source: { source_type: 'module' },
    ...existing,
    ...patch,
  };
  await pool().query(
    `insert into entitlements
       (entitlement_id, tenant_id, module_code, state, billing_source,
        activated_at, deactivated_at, config_state, prereq_check)
     values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9::jsonb)
     on conflict (tenant_id, module_code) do update set
       state = excluded.state,
       billing_source = excluded.billing_source,
       activated_at = excluded.activated_at,
       deactivated_at = excluded.deactivated_at,
       config_state = excluded.config_state,
       prereq_check = excluded.prereq_check`,
    [
      merged.entitlement_id, merged.tenant_id, merged.module_code, merged.state,
      JSON.stringify(merged.billing_source || {}), merged.activated_at || null,
      merged.deactivated_at || null, JSON.stringify(merged.config_state || null),
      JSON.stringify(merged.prereq_check || null),
    ],
  );

  // Sync modules_active
  const t = await getTenant(tenant_id);
  if (t) {
    const active = new Set(t.modules_active || []);
    if (merged.state === 'active') active.add(module_code);
    else active.delete(module_code);
    await updateTenant(tenant_id, { modules_active: [...active] });
  }

  return merged;
}

export async function listTenantEntitlements(tenant_id) {
  await ensureSchema();
  const { rows } = await pool().query(
    `select * from entitlements where tenant_id = $1`,
    [tenant_id],
  );
  return rows.map(rowToEntitlement);
}

export async function _reset() {
  await ensureSchema();
  await pool().query('truncate table entitlements');
  await pool().query('truncate table tenants cascade');
}

export async function _stats() {
  await ensureSchema();
  const a = await pool().query(`select count(*)::int as n from tenants`);
  const b = await pool().query(`select count(*)::int as n from entitlements`);
  return { tenants: a.rows[0].n, entitlements: b.rows[0].n };
}

export async function healthcheck() {
  await ensureSchema();
  try {
    await pool().query('select 1');
    return { ok: true, backend: 'postgres' };
  } catch (e) {
    return { ok: false, backend: 'postgres', error: e.message };
  }
}
