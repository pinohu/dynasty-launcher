// api/admin/metrics.js — GET (admin-gated)
// -----------------------------------------------------------------------------
// Unified observability aggregator. Single endpoint returns everything an
// operator needs to understand the state of the platform:
//
//   system      — backend, DB/Stripe/admin config status
//   catalog     — module/pack/suite/edition/concierge counts by status
//   tenants     — totals, by plan, blueprint, onboarding, subscription, recent
//   entitlements — totals, by state, by module, activated/deactivated recently
//   activations — success/fail/deferred counts from events_log
//   events      — total, rate buckets (1h/24h/7d), by type, recent failures
//   billing     — Stripe config, recent webhook events, checkout sessions
//   workflows   — templates available, executed, skipped counts
//
// Admin-gated: requires x-admin-key header matching ADMIN_KEY.
// Response is intentionally large — the dashboard renders it all.
// -----------------------------------------------------------------------------

import { backend, healthcheck, _stats } from '../tenants/_store.mjs';
import { getCatalog, indexModules, effectiveBundleStatus } from '../catalog/_lib.mjs';
import { isConfigured as stripeConfigured } from '../billing/_stripe.mjs';
import { getEventStats } from '../events/_events_store.mjs';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
export const maxDuration = 30;

const selfDir = dirname(fileURLToPath(import.meta.url));

let _pool = null;
function pool() {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  _pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
  return _pool;
}

function isAuthorized(req) {
  const supplied = req.headers['x-admin-key'] || req.headers['X-Admin-Key'];
  const expected = process.env.ADMIN_KEY || process.env.TEST_ADMIN_KEY;
  return !!expected && supplied === expected;
}

// ---- Catalog summary ----
function catalogSummary() {
  const { modules, bundles, tiers, personas, blueprints, capabilities } = getCatalog();
  const modsByCode = indexModules(modules);
  const modulesByStatus = {};
  for (const m of modules) {
    const s = m.status || 'spec';
    modulesByStatus[s] = (modulesByStatus[s] || 0) + 1;
  }
  const modulesByCategory = {};
  for (const m of modules) {
    const c = m.category || 'uncategorized';
    modulesByCategory[c] = (modulesByCategory[c] || 0) + 1;
  }
  const bundleStatuses = {};
  for (const b of bundles) {
    const es = effectiveBundleStatus(b, modsByCode);
    bundleStatuses[es] = (bundleStatuses[es] || 0) + 1;
  }
  return {
    modules: { total: modules.length, by_status: modulesByStatus, by_category: modulesByCategory },
    bundles: { total: bundles.length, by_effective_status: bundleStatuses },
    suites: (tiers?.suites || []).length,
    editions: (tiers?.editions || []).length,
    concierge: Object.keys(tiers?.concierge_setup || {}).length,
    personas: (personas || []).length,
    blueprints: (blueprints || []).length,
    capabilities: (capabilities || []).length,
  };
}

// ---- Tenant aggregates (Postgres) ----
async function tenantAggregates() {
  const p = pool();
  if (!p) return null;
  const [totalR, byPlanR, byBpR, byOnbR, bySubR, byCmR, recent7R, recent30R] = await Promise.all([
    p.query(`select count(*)::int as n from tenants`),
    p.query(`select plan, count(*)::int as n from tenants group by plan order by n desc`),
    p.query(`select coalesce(blueprint_installed, 'none') as bp, count(*)::int as n from tenants group by bp order by n desc`),
    p.query(`select onboarding_status, count(*)::int as n from tenants group by onboarding_status order by n desc`),
    p.query(`select subscription_status, count(*)::int as n from tenants group by subscription_status order by n desc`),
    p.query(`select coalesce(compliance_mode, 'none') as cm, count(*)::int as n from tenants group by cm order by n desc`),
    p.query(`select count(*)::int as n from tenants where created_at > now() - interval '7 days'`),
    p.query(`select count(*)::int as n from tenants where created_at > now() - interval '30 days'`),
  ]);
  return {
    total: totalR.rows[0].n,
    by_plan: Object.fromEntries(byPlanR.rows.map((r) => [r.plan, r.n])),
    by_blueprint: Object.fromEntries(byBpR.rows.map((r) => [r.bp, r.n])),
    by_onboarding_status: Object.fromEntries(byOnbR.rows.map((r) => [r.onboarding_status, r.n])),
    by_subscription_status: Object.fromEntries(bySubR.rows.map((r) => [r.subscription_status, r.n])),
    by_compliance_mode: Object.fromEntries(byCmR.rows.map((r) => [r.cm, r.n])),
    created_last_7d: recent7R.rows[0].n,
    created_last_30d: recent30R.rows[0].n,
  };
}

// ---- Entitlement aggregates (Postgres) ----
async function entitlementAggregates() {
  const p = pool();
  if (!p) return null;
  const [totalR, byStateR, byModR, act7R, deact7R, recentR] = await Promise.all([
    p.query(`select count(*)::int as n from entitlements`),
    p.query(`select state, count(*)::int as n from entitlements group by state order by n desc`),
    p.query(`select module_code, state, count(*)::int as n from entitlements group by module_code, state order by module_code`),
    p.query(`select count(*)::int as n from entitlements where activated_at > now() - interval '7 days'`),
    p.query(`select count(*)::int as n from entitlements where deactivated_at > now() - interval '7 days'`),
    p.query(`select entitlement_id, tenant_id, module_code, state, activated_at, deactivated_at from entitlements order by coalesce(activated_at, deactivated_at, now()) desc limit 20`),
  ]);

  const byModule = {};
  for (const r of byModR.rows) {
    if (!byModule[r.module_code]) byModule[r.module_code] = {};
    byModule[r.module_code][r.state] = r.n;
  }

  return {
    total: totalR.rows[0].n,
    by_state: Object.fromEntries(byStateR.rows.map((r) => [r.state, r.n])),
    by_module: byModule,
    activated_last_7d: act7R.rows[0].n,
    deactivated_last_7d: deact7R.rows[0].n,
    recent: recentR.rows,
  };
}

// ---- Workflow templates ----
function workflowTemplateStats() {
  const candidates = [
    join(process.cwd(), 'templates', 'workflow-templates'),
    join(selfDir, '..', '..', 'templates', 'workflow-templates'),
  ];
  let root = null;
  for (const c of candidates) {
    if (existsSync(c)) { root = c; break; }
  }
  if (!root) return { templates_root_found: false, templates: [] };
  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  return {
    templates_root_found: true,
    total: dirs.length,
    templates: dirs,
  };
}

// ---- Activation summary from events ----
async function activationSummary() {
  const p = pool();
  if (!p) return null;
  const [succR, failR, defR, failByReasonR] = await Promise.all([
    p.query(`select count(*)::int as n from events_log where event_type = 'module.activated'`),
    p.query(`select count(*)::int as n from events_log where event_type = 'module.activation_failed'`),
    p.query(`select count(*)::int as n from events_log where event_type = 'module.activation_deferred'`),
    p.query(`select payload->>'reason' as reason, count(*)::int as n from events_log where event_type = 'module.activation_failed' group by reason order by n desc`),
  ]);
  return {
    activated: succR.rows[0].n,
    failed: failR.rows[0].n,
    deferred: defR.rows[0].n,
    failed_by_reason: Object.fromEntries(failByReasonR.rows.map((r) => [r.reason || 'unknown', r.n])),
  };
}

// ---- Billing summary from events ----
async function billingSummary() {
  const p = pool();
  if (!p) return { stripe_configured: stripeConfigured(), events: null };
  const [whR, chkR] = await Promise.all([
    p.query(`select event_type, count(*)::int as n from events_log where event_type like 'stripe.%' or event_type like 'checkout.%' or event_type like 'invoice.%' or event_type like 'customer.%' group by event_type order by n desc`),
    p.query(`select * from events_log where event_type = 'checkout.session.completed' order by emitted_at desc limit 5`),
  ]);
  return {
    stripe_configured: stripeConfigured(),
    webhook_event_counts: Object.fromEntries(whR.rows.map((r) => [r.event_type, r.n])),
    recent_checkouts: chkR.rows.map((r) => ({
      event_id: r.event_id,
      tenant_id: r.tenant_id,
      emitted_at: r.emitted_at,
      payload: r.payload,
    })),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'admin_key_required' });

  const result = {
    timestamp: new Date().toISOString(),
    system: {
      backend,
      database_url_set: !!process.env.DATABASE_URL,
      stripe_configured: stripeConfigured(),
      admin_key_set: !!(process.env.ADMIN_KEY || process.env.TEST_ADMIN_KEY),
    },
  };

  // Run in parallel for speed
  const [health, storeStats, catalog, tenants, entitlements, events, activations, billing] =
    await Promise.allSettled([
      healthcheck(),
      _stats(),
      Promise.resolve(catalogSummary()),
      tenantAggregates(),
      entitlementAggregates(),
      getEventStats(),
      activationSummary(),
      billingSummary(),
    ]);

  result.system.health = health.status === 'fulfilled' ? health.value : { error: String(health.reason) };
  result.system.store_stats = storeStats.status === 'fulfilled' ? storeStats.value : { error: String(storeStats.reason) };
  result.catalog = catalog.status === 'fulfilled' ? catalog.value : { error: String(catalog.reason) };
  result.tenants = tenants.status === 'fulfilled' ? tenants.value : { error: String(tenants.reason) };
  result.entitlements = entitlements.status === 'fulfilled' ? entitlements.value : { error: String(entitlements.reason) };
  result.events = events.status === 'fulfilled' ? events.value : { error: String(events.reason) };
  result.activations = activations.status === 'fulfilled' ? activations.value : { error: String(activations.reason) };
  result.billing = billing.status === 'fulfilled' ? billing.value : { error: String(billing.reason) };
  result.workflows = workflowTemplateStats();

  return res.status(200).json(result);
}
