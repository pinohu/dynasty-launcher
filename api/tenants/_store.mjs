// api/tenants/_store.mjs — storage adapter router
// -----------------------------------------------------------------------------
// Selects the storage backend at module load:
//   - DATABASE_URL set → Postgres (api/tenants/_store_postgres.mjs)
//   - otherwise       → in-memory (api/tenants/_store_memory.mjs)
//
// The interface is async across both backends. Existing call sites that were
// synchronous have been updated to await.
//
// Migration: to enable Postgres, set DATABASE_URL and run:
//   psql "$DATABASE_URL" -f scripts/migrations/001_initial.sql
//
// Then redeploy. No code changes required — this router picks up the env var.
// -----------------------------------------------------------------------------

const USE_POSTGRES = !!process.env.DATABASE_URL;

const adapter = USE_POSTGRES
  ? await import('./_store_postgres.mjs')
  : await import('./_store_memory.mjs');

// Re-export every function the app uses
export const backend = adapter.backend;
export const createTenant = adapter.createTenant;
export const getTenant = adapter.getTenant;
export const updateTenant = adapter.updateTenant;
export const listTenants = adapter.listTenants;
export const setTenantCapability = adapter.setTenantCapability;
export const getEntitlement = adapter.getEntitlement;
export const upsertEntitlement = adapter.upsertEntitlement;
export const listTenantEntitlements = adapter.listTenantEntitlements;
export const _reset = adapter._reset;
export const _stats = adapter._stats;
export const healthcheck = adapter.healthcheck;
