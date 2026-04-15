// api/tenants/_store_memory.mjs — in-memory adapter (MVP default)
// -----------------------------------------------------------------------------
// Process-scoped stores. Same interface as _store_postgres.mjs.
// -----------------------------------------------------------------------------

const tenants = new Map();
const entitlements = new Map();

const tid = (t, m) => `${t}:${m}`;
const now = () => new Date().toISOString();

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export const backend = 'memory';

export async function createTenant(input = {}) {
  const t = {
    schema_version: '1.0.0',
    tenant_id: input.tenant_id || newId('tnt'),
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
    compliance_mode: input.compliance_mode || null,
    created_at: now(),
    updated_at: now(),
  };
  tenants.set(t.tenant_id, t);
  return t;
}

export async function getTenant(tenant_id) {
  return tenants.get(tenant_id) || null;
}

export async function updateTenant(tenant_id, patch) {
  const t = tenants.get(tenant_id);
  if (!t) return null;
  const u = { ...t, ...patch, updated_at: now() };
  tenants.set(tenant_id, u);
  return u;
}

export async function listTenants() {
  return [...tenants.values()];
}

export async function setTenantCapability(tenant_id, cap, enabled) {
  const t = tenants.get(tenant_id);
  if (!t) return null;
  const s = new Set(t.capabilities_enabled || []);
  if (enabled) s.add(cap); else s.delete(cap);
  return updateTenant(tenant_id, { capabilities_enabled: [...s] });
}

export async function getEntitlement(tenant_id, module_code) {
  return entitlements.get(tid(tenant_id, module_code)) || null;
}

export async function upsertEntitlement(tenant_id, module_code, patch) {
  const key = tid(tenant_id, module_code);
  const existing = entitlements.get(key);
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
  entitlements.set(key, merged);

  // Sync tenant.modules_active
  const t = tenants.get(tenant_id);
  if (t) {
    const active = new Set(t.modules_active || []);
    if (merged.state === 'active') active.add(module_code);
    else active.delete(module_code);
    await updateTenant(tenant_id, { modules_active: [...active] });
  }

  return merged;
}

export async function listTenantEntitlements(tenant_id) {
  const out = [];
  const prefix = `${tenant_id}:`;
  for (const [k, v] of entitlements.entries()) {
    if (k.startsWith(prefix)) out.push(v);
  }
  return out;
}

export async function _reset() {
  tenants.clear();
  entitlements.clear();
}

export async function _stats() {
  return { tenants: tenants.size, entitlements: entitlements.size };
}

export async function healthcheck() {
  return { ok: true, backend: 'memory' };
}
