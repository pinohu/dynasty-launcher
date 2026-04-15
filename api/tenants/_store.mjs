// api/tenants/_store.mjs — in-memory tenant store (MVP stub)
// -----------------------------------------------------------------------------
// IMPORTANT: This is an in-memory, process-scoped stub. It works for:
//   - local smoke tests
//   - single warm Vercel lambda instance (good enough for dev + early QA)
//
// It is NOT production-safe:
//   - Cold-started lambdas lose state
//   - Concurrent lambda instances don't share state
//   - No durability across deploys
//
// Track 4 (Tenant Model) replaces this with Postgres via api/neon.js. The
// interface below is the contract Postgres must honor — keep the function
// shapes stable so the swap is a drop-in.
// -----------------------------------------------------------------------------

const tenants = new Map(); // tenant_id -> tenant
const entitlements = new Map(); // `${tenant_id}:${module_code}` -> entitlement

function tid(tenant_id, module_code) {
  return `${tenant_id}:${module_code}`;
}

function makeTenantId() {
  // tnt_<timestamp36><random>  — human-readable enough, sortable by creation
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `tnt_${t}${r}`;
}

function makeEntitlementId() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `ent_${t}${r}`;
}

// -----------------------------------------------------------------------------
// Tenant CRUD
// -----------------------------------------------------------------------------

export function createTenant(input = {}) {
  const now = new Date().toISOString();
  const tenant = {
    schema_version: '1.0.0',
    tenant_id: input.tenant_id || makeTenantId(),
    business_name: input.business_name || 'Untitled Business',
    business_type: input.business_type || input.blueprint_code || 'general',
    plan: input.plan || 'core',
    subscription_status: input.subscription_status || 'active',
    onboarding_status: input.onboarding_status || 'in_progress',
    timezone: input.timezone || 'America/New_York',
    locale: input.locale || 'en-US',
    profile: input.profile || {},
    capabilities_enabled: Array.isArray(input.capabilities_enabled) ? [...input.capabilities_enabled] : [],
    modules_active: [],
    blueprint_installed: input.blueprint_code || null,
    created_at: now,
    updated_at: now,
  };
  tenants.set(tenant.tenant_id, tenant);
  return tenant;
}

export function getTenant(tenant_id) {
  return tenants.get(tenant_id) || null;
}

export function updateTenant(tenant_id, patch) {
  const t = tenants.get(tenant_id);
  if (!t) return null;
  const updated = { ...t, ...patch, updated_at: new Date().toISOString() };
  tenants.set(tenant_id, updated);
  return updated;
}

export function listTenants() {
  return [...tenants.values()];
}

// -----------------------------------------------------------------------------
// Capability state
// -----------------------------------------------------------------------------

export function getTenantCapabilities(tenant_id) {
  const t = tenants.get(tenant_id);
  if (!t) return null;
  return [...(t.capabilities_enabled || [])];
}

export function setTenantCapability(tenant_id, capability_code, enabled) {
  const t = tenants.get(tenant_id);
  if (!t) return null;
  const set = new Set(t.capabilities_enabled || []);
  if (enabled) set.add(capability_code);
  else set.delete(capability_code);
  return updateTenant(tenant_id, { capabilities_enabled: [...set] });
}

// -----------------------------------------------------------------------------
// Entitlement CRUD
// -----------------------------------------------------------------------------

export function getEntitlement(tenant_id, module_code) {
  return entitlements.get(tid(tenant_id, module_code)) || null;
}

export function upsertEntitlement(tenant_id, module_code, patch) {
  const key = tid(tenant_id, module_code);
  const existing = entitlements.get(key);
  const now = new Date().toISOString();
  const merged = {
    schema_version: '1.0.0',
    entitlement_id: existing?.entitlement_id || makeEntitlementId(),
    tenant_id,
    module_code,
    state: 'entitled',
    billing_source: { source_type: 'module' },
    ...existing,
    ...patch,
  };
  entitlements.set(key, merged);

  // Sync tenant.modules_active denormalized list
  const t = tenants.get(tenant_id);
  if (t) {
    const active = new Set(t.modules_active || []);
    if (merged.state === 'active') active.add(module_code);
    else active.delete(module_code);
    updateTenant(tenant_id, { modules_active: [...active] });
  }

  return merged;
}

export function listTenantEntitlements(tenant_id) {
  const results = [];
  const prefix = `${tenant_id}:`;
  for (const [k, v] of entitlements.entries()) {
    if (k.startsWith(prefix)) results.push(v);
  }
  return results;
}

// -----------------------------------------------------------------------------
// Test-only resets
// -----------------------------------------------------------------------------

export function _reset() {
  tenants.clear();
  entitlements.clear();
}

export function _stats() {
  return {
    tenants: tenants.size,
    entitlements: entitlements.size,
  };
}
