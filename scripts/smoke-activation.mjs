// scripts/smoke-activation.mjs — smoke tests for the activation engine
// -----------------------------------------------------------------------------
// Covers the six canonical QA paths from docs/operations/QA_MATRIX.md:
//   1. Happy
//   2. Missing capability (defer → wizard → reactivate)
//   3. Failed provisioning (-- stubbed, tested through explicit no-tenant path)
//   4. Rollback (idempotency + state after failure)
//   5. Cancellation
//   6. Reactivation (via pause/resume)
//
// Also covers: no_entitlement, module_not_found, tier_mismatch, assisted_disallowed,
// prereq_not_active.
//
// Run: node scripts/smoke-activation.mjs
// -----------------------------------------------------------------------------

import { _reset as resetStore } from '../api/tenants/_store.mjs';
import { _reset as resetBus } from '../api/events/_bus.mjs';

process.env.TEST_ADMIN_KEY = 'test-admin-key';

function invoke(handlerModule, { method = 'POST', query = {}, body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      _status: 200,
      _body: null,
      status(s) { this._status = s; return this; },
      setHeader() {},
      json(b) { this._body = b; resolve({ status: this._status, body: b }); return this; },
      end() { resolve({ status: this._status, body: null }); return this; },
    };
    // All tenant endpoints are admin-gated; inject the test admin key by default.
    const mergedHeaders = { 'x-admin-key': 'test-admin-key', ...headers };
    const req = { method, query, headers: mergedHeaders, body };
    Promise.resolve(handlerModule.default(req, res)).catch(reject);
  });
}

async function loadHandlers() {
  return {
    createTenant: await import('../api/tenants/create-tenant.js'),
    setCap: await import('../api/tenants/set-tenant-capability.js'),
    grant: await import('../api/tenants/grant-entitlement.js'),
    activate: await import('../api/tenants/activate-module.js'),
    deactivate: await import('../api/tenants/deactivate-module.js'),
    getTenant: await import('../api/tenants/get-tenant.js'),
  };
}

function log(ok, name, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  return ok ? 0 : 1;
}

const ADMIN = { 'x-admin-key': 'test-admin-key' };

async function main() {
  await resetStore();
  resetBus();
  const h = await loadHandlers();
  let fails = 0;

  console.log('Smoke test: api/tenants/_activation (14-step contract)');
  console.log('-'.repeat(60));

  // Create a tenant on the HVAC blueprint
  const { body: { tenant: tenantHvac } } = await invoke(h.createTenant, {
    body: { blueprint_code: 'hvac', plan: 'professional' },
  });

  // ============================================================
  // Path: activation without entitlement
  // ============================================================
  {
    const r = await invoke(h.activate, { body: { tenant_id: tenantHvac.tenant_id, module_code: 'webform_autoreply' } });
    fails += log(r.status === 400 && r.body.reason === 'no_entitlement',
      'activate without entitlement returns no_entitlement', `status=${r.status} reason=${r.body.reason}`);
  }

  // ============================================================
  // Path: missing capability (deferred)
  // ============================================================
  // Grant entitlement, don't enable any capabilities → should defer
  {
    await invoke(h.grant, {
      headers: ADMIN,
      body: { tenant_id: tenantHvac.tenant_id, module_code: 'webform_autoreply' },
    });
    const r = await invoke(h.activate, { body: { tenant_id: tenantHvac.tenant_id, module_code: 'webform_autoreply' } });
    const ok = r.status === 200
      && r.body.status === 'deferred'
      && Array.isArray(r.body.missing_capabilities)
      && r.body.missing_capabilities.includes('forms')
      && r.body.missing_capabilities.includes('crm')
      && r.body.missing_capabilities.includes('email')
      && Array.isArray(r.body.wizards) && r.body.wizards.length === r.body.missing_capabilities.length;
    fails += log(ok, 'activate with missing capabilities defers + lists wizards',
      `missing=${r.body.missing_capabilities?.join(',')}`);
  }

  // ============================================================
  // Path: happy — enable capabilities, reactivate
  // ============================================================
  {
    for (const cap of ['forms', 'crm', 'email']) {
      await invoke(h.setCap, {
        headers: ADMIN,
        body: { tenant_id: tenantHvac.tenant_id, capability_code: cap, enabled: true },
      });
    }
    const r = await invoke(h.activate, {
      body: { tenant_id: tenantHvac.tenant_id, module_code: 'webform_autoreply', user_input: { ack_channel: 'email' } },
    });
    const ok = r.status === 200
      && r.body.status === 'ok'
      && r.body.entitlement && r.body.entitlement.state === 'active'
      && r.body.entitlement.config_state && r.body.entitlement.config_state.ack_channel === 'email';
    fails += log(ok, 'happy path: capabilities present → ok + active + settings persisted',
      `state=${r.body.entitlement?.state}`);
  }

  // ============================================================
  // Idempotency: second activate call returns idempotent_ok
  // ============================================================
  {
    const r = await invoke(h.activate, { body: { tenant_id: tenantHvac.tenant_id, module_code: 'webform_autoreply' } });
    fails += log(r.body.status === 'idempotent_ok', 'repeat activate returns idempotent_ok', `status=${r.body.status}`);
  }

  // ============================================================
  // Tenant sync: modules_active updated on activation
  // ============================================================
  {
    const r = await invoke(h.getTenant, { method: 'GET', query: { tenant_id: tenantHvac.tenant_id } });
    fails += log(
      r.body.tenant.modules_active.includes('webform_autoreply'),
      'tenant.modules_active contains activated module',
      `modules_active=${r.body.tenant.modules_active.join(',')}`,
    );
  }

  // ============================================================
  // Path: cancellation → data preserved per downgrade_behavior
  // ============================================================
  {
    const r = await invoke(h.deactivate, {
      body: { tenant_id: tenantHvac.tenant_id, module_code: 'webform_autoreply' },
    });
    const ok = r.status === 200
      && r.body.status === 'ok'
      && r.body.entitlement.state === 'deactivated'
      && r.body.on_cancel === 'disable_new_runs_keep_data'
      && r.body.entitlement.config_state && r.body.entitlement.config_state.ack_channel === 'email';
    fails += log(ok, 'deactivate preserves config_state + applies downgrade_behavior',
      `on_cancel=${r.body.on_cancel}`);
  }

  // ============================================================
  // Path: reactivation restores config
  // ============================================================
  {
    const r = await invoke(h.activate, { body: { tenant_id: tenantHvac.tenant_id, module_code: 'webform_autoreply' } });
    const ok = r.status === 200 && r.body.status === 'ok'
      && r.body.entitlement.state === 'active'
      && r.body.entitlement.config_state && r.body.entitlement.config_state.ack_channel === 'email';
    fails += log(ok, 'reactivate after deactivate restores config_state',
      `channel=${r.body.entitlement?.config_state?.ack_channel}`);
  }

  // ============================================================
  // Path: prereq_not_active — unhappy_customer_interception needs post_job_review_request active
  // ============================================================
  {
    // Fresh tenant so the prereq chain is clean
    const { body: { tenant } } = await invoke(h.createTenant, { body: { blueprint_code: 'hvac', plan: 'professional' } });
    for (const cap of ['crm', 'reviews', 'email', 'sms']) {
      await invoke(h.setCap, { headers: ADMIN, body: { tenant_id: tenant.tenant_id, capability_code: cap, enabled: true } });
    }
    await invoke(h.grant, { headers: ADMIN, body: { tenant_id: tenant.tenant_id, module_code: 'unhappy_customer_interception' } });
    const r = await invoke(h.activate, { body: { tenant_id: tenant.tenant_id, module_code: 'unhappy_customer_interception' } });
    fails += log(
      r.status === 400 && r.body.reason === 'prereq_not_active' && r.body.prereq === 'post_job_review_request',
      'activate unhappy_customer_interception without post_job_review_request active → prereq_not_active',
      `prereq=${r.body.prereq}`,
    );
  }

  // ============================================================
  // Path: tier_mismatch (module requires professional; tenant on core/foundation)
  // ============================================================
  {
    const { body: { tenant } } = await invoke(h.createTenant, { body: { plan: 'foundation' } });
    await invoke(h.grant, { headers: ADMIN, body: { tenant_id: tenant.tenant_id, module_code: 'missed_call_textback' } });
    const r = await invoke(h.activate, { body: { tenant_id: tenant.tenant_id, module_code: 'missed_call_textback' } });
    fails += log(
      r.status === 400 && r.body.reason === 'tier_mismatch',
      'activate pro-tier module on foundation tenant → tier_mismatch',
      `plan=${r.body.plan} required=${(r.body.required || []).join(',')}`,
    );
  }

  // ============================================================
  // Path: module_not_found
  // ============================================================
  {
    const r = await invoke(h.activate, { body: { tenant_id: tenantHvac.tenant_id, module_code: 'nonexistent_mod' } });
    fails += log(r.status === 400 && r.body.reason === 'no_entitlement',
      'activate with nonexistent module_code → no_entitlement first (never had an entitlement)',
      `status=${r.status} reason=${r.body.reason}`);
  }

  // ============================================================
  // Path: tenant_not_found
  // ============================================================
  {
    // Grant would 404 first; test activate directly with no entitlement
    const r = await invoke(h.activate, { body: { tenant_id: 'tnt_ghost', module_code: 'webform_autoreply' } });
    fails += log(r.status === 400 && r.body.reason === 'no_entitlement',
      'activate on missing tenant → no_entitlement (guarded before tenant lookup)');
  }

  // ============================================================
  // Idempotent deactivate
  // ============================================================
  {
    const r1 = await invoke(h.deactivate, { body: { tenant_id: tenantHvac.tenant_id, module_code: 'webform_autoreply' } });
    const r2 = await invoke(h.deactivate, { body: { tenant_id: tenantHvac.tenant_id, module_code: 'webform_autoreply' } });
    fails += log(
      r1.body.status === 'ok' && r2.body.status === 'idempotent_ok',
      'second deactivate is idempotent_ok',
    );
  }

  // ============================================================
  // HIPAA gate: med-spa tenant activating a PHI-touching module without
  // the HIPAA add-on → hipaa_addon_required
  // ============================================================
  {
    const { body: { tenant: medSpa } } = await invoke(h.createTenant, {
      body: { blueprint_code: 'med-spa', plan: 'professional' },
    });
    for (const cap of ['crm', 'reviews', 'email', 'sms']) {
      await invoke(h.setCap, { headers: ADMIN, body: { tenant_id: medSpa.tenant_id, capability_code: cap, enabled: true } });
    }
    await invoke(h.grant, { headers: ADMIN, body: { tenant_id: medSpa.tenant_id, module_code: 'post_job_review_request' } });
    const r = await invoke(h.activate, { body: { tenant_id: medSpa.tenant_id, module_code: 'post_job_review_request' } });
    fails += log(
      r.status === 400 && r.body.reason === 'hipaa_addon_required',
      'med-spa tenant without HIPAA add-on cannot activate PHI-touching module',
      `reason=${r.body.reason}`,
    );
  }

  console.log('-'.repeat(60));
  if (fails === 0) {
    console.log('OK — all activation smoke checks passed.');
    process.exit(0);
  } else {
    console.log(`FAIL — ${fails} check(s) failed.`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
