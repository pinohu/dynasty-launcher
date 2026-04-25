// scripts/smoke-tenants.mjs — smoke tests for api/tenants/*
// -----------------------------------------------------------------------------
// Verifies tenant creation, capability management, and store idempotency.
// Run: node scripts/smoke-tenants.mjs
// -----------------------------------------------------------------------------

import { _reset } from '../api/tenants/_store.mjs';

process.env.TEST_ADMIN_KEY = 'test-admin-key';

function invoke(handlerModule, { method = 'GET', query = {}, body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      _status: 200,
      _body: null,
      _headers: {},
      status(s) { this._status = s; return this; },
      setHeader(k, v) { this._headers[k] = v; },
      json(b) { this._body = b; resolve({ status: this._status, body: b }); return this; },
      end() { resolve({ status: this._status, body: null }); return this; },
    };
    const req = { method, query, headers, body };
    Promise.resolve(handlerModule.default(req, res)).catch(reject);
  });
}

async function loadHandlers() {
  return {
    create: await import('../api/tenants/create-tenant.js'),
    get: await import('../api/tenants/get-tenant.js'),
    caps: await import('../api/tenants/get-tenant-capabilities.js'),
    setCap: await import('../api/tenants/set-tenant-capability.js'),
  };
}

function log(ok, name, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  return ok ? 0 : 1;
}

async function main() {
  await _reset();
  const h = await loadHandlers();
  let fails = 0;

  console.log('Smoke test: api/tenants/*');
  console.log('-'.repeat(60));

  // 1. Create without blueprint
  let tenantA;
  {
    const r = await invoke(h.create, { method: 'POST', body: { business_name: 'Test Biz' } });
    tenantA = r.body.tenant;
    const ok = r.status === 201 && tenantA && tenantA.tenant_id.startsWith('tnt_');
    fails += log(ok, 'POST create-tenant (no blueprint)', `id=${tenantA?.tenant_id}`);
  }

  // 2. Create with HVAC blueprint
  let tenantHvac;
  {
    const r = await invoke(h.create, { method: 'POST', body: { blueprint_code: 'hvac', business_name: 'HVAC Shop' } });
    tenantHvac = r.body.tenant;
    const ok = r.status === 201
      && tenantHvac && tenantHvac.blueprint_installed === 'hvac'
      && r.body.blueprint_applied && r.body.blueprint_applied.recommended_modules.length > 0;
    fails += log(ok, 'POST create-tenant with blueprint=hvac', `recs=${r.body.blueprint_applied?.recommended_modules.length}`);
  }

  // 3. Create with bad blueprint
  {
    const r = await invoke(h.create, { method: 'POST', body: { blueprint_code: 'xyz-not-real' } });
    fails += log(r.status === 400, 'POST create-tenant with unknown blueprint returns 400', `status=${r.status}`);
  }

  // 4. GET tenant
  {
    const r = await invoke(h.get, { query: { tenant_id: tenantA.tenant_id } });
    const ok = r.status === 200 && r.body.tenant && r.body.tenant.tenant_id === tenantA.tenant_id
      && Array.isArray(r.body.entitlements)
      && r.body.entitlements.length >= 15
      && r.body.entitlements.every((e) => e.state === 'dormant');
    fails += log(ok, 'GET get-tenant returns pre-provisioned dormant entitlements',
      `entitlements=${r.body.entitlements?.length}`);
  }

  // 5. GET nonexistent
  {
    const r = await invoke(h.get, { query: { tenant_id: 'tnt_nope' } });
    fails += log(r.status === 404, 'GET get-tenant nonexistent returns 404', `status=${r.status}`);
  }

  // 6. GET capabilities (none enabled)
  {
    const r = await invoke(h.caps, { query: { tenant_id: tenantA.tenant_id } });
    const ok = r.status === 200
      && Array.isArray(r.body.all_capabilities)
      && r.body.all_capabilities.length === 10
      && r.body.all_capabilities.every((c) => c.enabled === false);
    fails += log(ok, 'GET capabilities: 10 caps listed, all disabled for new tenant', `total=${r.body.all_capabilities?.length}`);
  }

  // 7. Set capability admin-gated (should 403 without key)
  {
    const r = await invoke(h.setCap, { method: 'POST', body: { tenant_id: tenantA.tenant_id, capability_code: 'email', enabled: true } });
    fails += log(r.status === 403, 'POST set-tenant-capability without admin key returns 403', `status=${r.status}`);
  }

  // 8. Set capability with admin key
  {
    const r = await invoke(h.setCap, {
      method: 'POST',
      headers: { 'x-admin-key': 'test-admin-key' },
      body: { tenant_id: tenantA.tenant_id, capability_code: 'email', enabled: true },
    });
    const ok = r.status === 200 && r.body.tenant && r.body.tenant.capabilities_enabled.includes('email');
    fails += log(ok, 'POST set-tenant-capability enables email', `caps=${r.body.tenant?.capabilities_enabled.join(',')}`);
  }

  // 9. Unknown capability
  {
    const r = await invoke(h.setCap, {
      method: 'POST',
      headers: { 'x-admin-key': 'test-admin-key' },
      body: { tenant_id: tenantA.tenant_id, capability_code: 'warp_drive', enabled: true },
    });
    fails += log(r.status === 400, 'POST set-tenant-capability rejects unknown capability', `status=${r.status}`);
  }

  // 10. GET capabilities after enable
  {
    const r = await invoke(h.caps, { query: { tenant_id: tenantA.tenant_id } });
    const email = r.body.all_capabilities.find((c) => c.capability_code === 'email');
    fails += log(email?.enabled === true && email.required_by.length > 0,
      'GET capabilities shows email enabled + required_by list', `required_by=${email?.required_by.length}`);
  }

  console.log('-'.repeat(60));
  if (fails === 0) {
    console.log('OK — all tenant smoke checks passed.');
    process.exit(0);
  } else {
    console.log(`FAIL — ${fails} check(s) failed.`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
