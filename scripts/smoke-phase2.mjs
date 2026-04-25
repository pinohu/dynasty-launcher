// scripts/smoke-phase2.mjs — verifies Phase 2 modules load & the tenant
// override resolution works without hitting any vendor API.
import { loadAgent, clearCache } from '../agents/_lib/prompt-loader.mjs';

let failed = 0;

// 1. Default (no tenant) still loads.
try {
  const { system } = await loadAgent('orchestrator');
  if (!system.includes('Dynasty Launcher Orchestrator')) throw new Error('no orchestrator role');
  console.log('PASS default orchestrator loads');
} catch (e) { console.error('FAIL default orchestrator:', e.message); failed++; }

// 2. Tenant override resolves when file exists.
clearCache();
try {
  const { system } = await loadAgent('orchestrator', { tenantId: '_example' });
  if (!system.includes('WordPress only')) throw new Error('tenant override not applied');
  console.log('PASS _example tenant overrides dynasty-principles');
} catch (e) { console.error('FAIL _example tenant:', e.message); failed++; }

// 3. Tenant falls back to shared when override absent.
clearCache();
try {
  const { system } = await loadAgent('orchestrator', { tenantId: '_example' });
  if (!system.includes('Blue Ocean Hungry Market Framework')) throw new Error('blue-ocean fallback missing');
  console.log('PASS _example tenant falls back to shared blue-ocean');
} catch (e) { console.error('FAIL _example fallback:', e.message); failed++; }

// 4. Planner module imports and exports planRun.
try {
  const mod = await import('../agents/_lib/planner.mjs');
  if (typeof mod.planRun !== 'function') throw new Error('planRun not exported');
  console.log('PASS planner.mjs exports planRun');
} catch (e) { console.error('FAIL planner:', e.message); failed++; }

// 5. Datasource module imports and exports query.
try {
  const mod = await import('../agents/_lib/datasource.mjs');
  if (typeof mod.query !== 'function') throw new Error('query not exported');
  console.log('PASS datasource.mjs exports query');
} catch (e) { console.error('FAIL datasource:', e.message); failed++; }

// 6. Datasource rejects cross-tenant Neon queries. (Skip gracefully if pg
//    isn't installed in this environment — the guard is source-level, not
//    runtime-dependent on pg being reachable.)
try {
  const hasPg = await import('pg').then(() => true).catch(() => false);
  if (!hasPg) {
    console.log('SKIP datasource tenant guard (pg not installed in this env)');
  } else {
    const { query } = await import('../agents/_lib/datasource.mjs');
    process.env.DATABASE_URL = 'postgres://unused';
    try {
      await query({ source: 'neon', query: 'select * from tenants', tenantId: 'acme' });
      throw new Error('should have rejected');
    } catch (e) {
      if (!/without tenant_id filter/.test(e.message)) throw e;
      console.log('PASS datasource rejects cross-tenant neon query');
    }
  }
} catch (e) { console.error('FAIL datasource tenant guard:', e.message); failed++; }

if (failed > 0) { console.error(`\n${failed} check(s) failed.`); process.exit(1); }
console.log('\nAll Phase 2 checks passed.');
