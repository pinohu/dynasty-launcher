// scripts/smoke-storefront-security.mjs
// -----------------------------------------------------------------------------
// Security regression coverage for /api/storefront/catalog:
//   - purchase-module / purchase-pack require a signed tenant/admin token
//   - deactivate requires a signed tenant/admin token
//   - live Stripe mode refuses local entitlement activation without billable state
//   - stub mode still allows local smoke activation when signed
// -----------------------------------------------------------------------------

import crypto from 'node:crypto';

import { _reset as resetBus } from '../api/events/_bus.mjs';
import {
  getEntitlement,
  _reset as resetStore,
  setTenantCapability,
} from '../api/tenants/_store.mjs';

process.env.TENANT_ACTION_SECRET = 'tenant-action-secret-for-smoke';
Reflect.deleteProperty(process.env, 'STRIPE_SECRET_KEY');
Reflect.deleteProperty(process.env, 'STRIPE_WEBHOOK_SECRET');

function invoke(handlerModule, { method = 'POST', query = {}, body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      _status: 200,
      _body: null,
      status(s) {
        this._status = s;
        return this;
      },
      setHeader() {},
      json(b) {
        this._body = b;
        resolve({ status: this._status, body: b });
        return this;
      },
      end() {
        resolve({ status: this._status, body: null });
        return this;
      },
    };
    const req = { method, query, headers, body };
    Promise.resolve(handlerModule.default(req, res)).catch(reject);
  });
}

async function loadHandlers() {
  return {
    createTenant: await import('../api/tenants/create-tenant.js'),
    storefront: await import('../api/storefront/catalog.js'),
  };
}

function tenantToken(tenantId, subject, ttlMs = 15 * 60 * 1000) {
  const exp = Date.now() + ttlMs;
  const payload = `tenant:${tenantId}:${subject}:${exp}`;
  const sig = crypto
    .createHmac('sha256', process.env.TENANT_ACTION_SECRET)
    .update(payload)
    .digest('hex');
  return `${payload}:${sig}`;
}

function log(ok, name, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
  return ok ? 0 : 1;
}

async function main() {
  await resetStore();
  resetBus();
  const h = await loadHandlers();
  let fails = 0;

  console.log('Smoke test: storefront security gates');
  console.log('-'.repeat(60));

  const owner = 'user_storefront_owner';
  const {
    body: { tenant },
  } = await invoke(h.createTenant, {
    body: {
      blueprint_code: 'hvac',
      plan: 'professional',
      profile: { user_id: owner },
    },
  });

  for (const capability of ['forms', 'crm', 'email']) {
    await setTenantCapability(tenant.tenant_id, capability, true);
  }

  // ============================================================
  // purchase-module requires signed tenant auth
  // ============================================================
  {
    const r = await invoke(h.storefront, {
      query: { action: 'purchase-module' },
      body: { tenant_id: tenant.tenant_id, module_code: 'webform_autoreply' },
    });
    const ent = await getEntitlement(tenant.tenant_id, 'webform_autoreply');
    fails += log(
      r.status === 401 &&
        r.body.error === 'tenant_authorization_required' &&
        ent?.state !== 'active',
      'purchase-module rejects missing authorization',
      `status=${r.status} state=${ent?.state}`,
    );
  }

  // ============================================================
  // purchase-pack is also guarded
  // ============================================================
  {
    const r = await invoke(h.storefront, {
      query: { action: 'purchase-pack' },
      body: { tenant_id: tenant.tenant_id, bundle_code: 'lead_capture_pack' },
    });
    fails += log(
      r.status === 401 && r.body.error === 'tenant_authorization_required',
      'purchase-pack rejects missing authorization',
      `status=${r.status}`,
    );
  }

  // ============================================================
  // invalid tenant token cannot mutate entitlements
  // ============================================================
  {
    const r = await invoke(h.storefront, {
      query: { action: 'purchase-module' },
      headers: { authorization: 'Bearer tenant:tnt_wrong:user_storefront_owner:9999999999999:bad' },
      body: { tenant_id: tenant.tenant_id, module_code: 'webform_autoreply' },
    });
    const ent = await getEntitlement(tenant.tenant_id, 'webform_autoreply');
    fails += log(
      r.status === 403 && ent?.state !== 'active',
      'purchase-module rejects invalid tenant token',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  const token = tenantToken(tenant.tenant_id, owner);

  // ============================================================
  // live Stripe mode requires billable customer/payment state
  // ============================================================
  {
    process.env.STRIPE_SECRET_KEY = 'sk_live_fake_for_storefront_gate';
    const r = await invoke(h.storefront, {
      query: { action: 'purchase-module' },
      headers: { authorization: `Bearer ${token}` },
      body: {
        tenant_id: tenant.tenant_id,
        module_code: 'webform_autoreply',
        payment_method_id: 'pm_fake',
      },
    });
    const ent = await getEntitlement(tenant.tenant_id, 'webform_autoreply');
    fails += log(
      r.status === 402 && r.body.error === 'stripe_customer_required' && ent?.state !== 'active',
      'purchase-module refuses activation in live Stripe mode without customer binding',
      `status=${r.status} error=${r.body.error} state=${ent?.state}`,
    );
    Reflect.deleteProperty(process.env, 'STRIPE_SECRET_KEY');
  }

  // ============================================================
  // signed stub-mode purchase can activate locally
  // ============================================================
  {
    const r = await invoke(h.storefront, {
      query: { action: 'purchase-module' },
      headers: { authorization: `Bearer ${token}` },
      body: { tenant_id: tenant.tenant_id, module_code: 'webform_autoreply' },
    });
    const ent = await getEntitlement(tenant.tenant_id, 'webform_autoreply');
    fails += log(
      r.status === 200 && r.body.status === 'active' && ent?.state === 'active',
      'signed purchase-module activates only after auth and billing gate',
      `status=${r.status} state=${ent?.state}`,
    );
  }

  // ============================================================
  // deactivate requires signed tenant auth
  // ============================================================
  {
    const r = await invoke(h.storefront, {
      query: { action: 'deactivate' },
      body: { tenant_id: tenant.tenant_id, module_code: 'webform_autoreply' },
    });
    const ent = await getEntitlement(tenant.tenant_id, 'webform_autoreply');
    fails += log(
      r.status === 401 && ent?.state === 'active',
      'deactivate rejects missing authorization and leaves entitlement active',
      `status=${r.status} state=${ent?.state}`,
    );
  }

  // ============================================================
  // signed deactivate pauses the entitlement
  // ============================================================
  {
    const r = await invoke(h.storefront, {
      query: { action: 'deactivate' },
      headers: { authorization: `Bearer ${token}` },
      body: { tenant_id: tenant.tenant_id, module_code: 'webform_autoreply' },
    });
    const ent = await getEntitlement(tenant.tenant_id, 'webform_autoreply');
    fails += log(
      r.status === 200 && r.body.status === 'paused' && ent?.state === 'paused',
      'signed deactivate pauses entitlement',
      `status=${r.status} state=${ent?.state}`,
    );
  }

  console.log('-'.repeat(60));
  if (fails === 0) {
    console.log('OK - storefront security checks passed.');
    process.exit(0);
  } else {
    console.log(`FAIL - ${fails} check(s) failed.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
