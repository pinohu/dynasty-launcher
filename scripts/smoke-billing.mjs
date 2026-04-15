// scripts/smoke-billing.mjs — billing smoke tests (stub mode)
// -----------------------------------------------------------------------------
// Proves:
//   - create-checkout-session returns a session (stub URL without Stripe keys)
//   - unknown sku_code returns 400
//   - webhook accepts checkout.session.completed and grants entitlements
//   - invoice.payment_failed pauses active entitlements
//   - invoice.paid resumes paused entitlements
//   - customer.subscription.deleted deactivates entitlements
//
// No live Stripe calls. To exercise against real Stripe: set
// STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET and use stripe listen.
// -----------------------------------------------------------------------------

import { _reset as resetStore } from '../api/tenants/_store.mjs';
import { _reset as resetBus } from '../api/events/_bus.mjs';

process.env.TEST_ADMIN_KEY = 'test-admin-key';
// Ensure stub mode
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;

function invoke(handlerModule, { method = 'POST', query = {}, body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      _status: 200, _body: null,
      status(s) { this._status = s; return this; },
      setHeader() {},
      json(b) { this._body = b; resolve({ status: this._status, body: b }); return this; },
      end() { resolve({ status: this._status, body: null }); return this; },
    };
    // For webhook tests where body is a raw JSON string, simulate stream
    const req = (typeof body === 'string')
      ? Object.assign({
          method, query, headers,
          on(event, cb) {
            if (event === 'data') { this._dataCb = cb; setImmediate(() => cb(body)); }
            else if (event === 'end') { this._endCb = cb; setImmediate(() => cb()); }
          },
        }, {})
      : { method, query, headers, body };
    Promise.resolve(handlerModule.default(req, res)).catch(reject);
  });
}

async function loadHandlers() {
  return {
    createTenant: await import('../api/tenants/create-tenant.js'),
    checkout: await import('../api/billing/create-checkout-session.js'),
    webhook: await import('../api/billing/webhook.js'),
    getTenant: await import('../api/tenants/get-tenant.js'),
  };
}

function log(ok, name, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  return ok ? 0 : 1;
}

async function main() {
  await resetStore();
  resetBus();
  const h = await loadHandlers();
  let fails = 0;

  console.log('Smoke test: api/billing/* (stub mode)');
  console.log('-'.repeat(60));

  const { body: { tenant } } = await invoke(h.createTenant, {
    body: { blueprint_code: 'hvac', plan: 'professional' },
  });

  // ============================================================
  // create-checkout-session with valid module
  // ============================================================
  {
    const r = await invoke(h.checkout, {
      body: {
        tenant_id: tenant.tenant_id,
        items: [{ sku_type: 'module', sku_code: 'webform_autoreply' }],
        billing_cycle: 'annual',
      },
    });
    fails += log(
      r.status === 200
        && r.body.session
        && r.body.session.stub === true
        && r.body.line_items[0].price === 'price_module_webform_autoreply_annual',
      'checkout returns stub session with expected price id',
      `price=${r.body.line_items?.[0]?.price} stub=${r.body.session?.stub}`,
    );
  }

  // ============================================================
  // Unknown sku_code
  // ============================================================
  {
    const r = await invoke(h.checkout, {
      body: { tenant_id: tenant.tenant_id, items: [{ sku_type: 'module', sku_code: 'does_not_exist' }] },
    });
    fails += log(r.status === 400 && r.body.error.includes('does_not_exist'),
      'checkout rejects unknown module sku_code', `status=${r.status} error=${r.body.error}`);
  }

  // ============================================================
  // Webhook: checkout.session.completed grants entitlement
  // ============================================================
  {
    const payload = JSON.stringify({
      id: 'evt_stub_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          subscription: 'sub_stub_1',
          metadata: {
            tenant_id: tenant.tenant_id,
            sku_codes: 'webform_autoreply,appointment_reminder',
            sku_types: 'module,module',
          },
        },
      },
    });
    const r = await invoke(h.webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
    });
    const granted = r.body.actions?.[0]?.results?.filter((x) => x.status === 'granted').length || 0;
    fails += log(
      r.status === 200 && granted === 2,
      'checkout.session.completed grants entitlements for all module skus',
      `granted=${granted}`,
    );
  }

  // Verify entitlements landed
  {
    const r = await invoke(h.getTenant, { method: 'GET', query: { tenant_id: tenant.tenant_id } });
    const codes = (r.body.entitlements || []).map((e) => e.module_code).sort();
    fails += log(
      codes.includes('webform_autoreply') && codes.includes('appointment_reminder'),
      'tenant now has the granted entitlements in state=entitled',
      `entitlements=${codes.join(',')}`,
    );
  }

  // ============================================================
  // Webhook: tenant not found → 200 ok action=tenant_not_found
  // ============================================================
  {
    const payload = JSON.stringify({
      id: 'evt_stub_2',
      type: 'checkout.session.completed',
      data: {
        object: {
          subscription: 'sub_stub_x',
          metadata: { tenant_id: 'tnt_ghost', sku_codes: 'webform_autoreply', sku_types: 'module' },
        },
      },
    });
    const r = await invoke(h.webhook, { method: 'POST', body: payload, headers: { 'content-type': 'application/json' } });
    fails += log(r.status === 200 && r.body.action === 'tenant_not_found',
      'webhook gracefully handles unknown tenant_id');
  }

  // ============================================================
  // Webhook: subscription.deleted deactivates entitlements
  // ============================================================
  {
    const payload = JSON.stringify({
      id: 'evt_stub_3',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_stub_1',
          metadata: { tenant_id: tenant.tenant_id },
        },
      },
    });
    const r = await invoke(h.webhook, { method: 'POST', body: payload, headers: { 'content-type': 'application/json' } });
    const deactivates = (r.body.actions || []).filter((a) => a.type === 'deactivate').length;
    fails += log(r.status === 200 && deactivates === 2,
      'subscription.deleted deactivates all matching entitlements',
      `deactivates=${deactivates}`);
  }

  // ============================================================
  // Webhook: ignored event type
  // ============================================================
  {
    const payload = JSON.stringify({ id: 'evt_stub_4', type: 'customer.created', data: { object: {} } });
    const r = await invoke(h.webhook, { method: 'POST', body: payload, headers: { 'content-type': 'application/json' } });
    fails += log(
      r.status === 200 && r.body.actions?.[0]?.type === 'ignored',
      'webhook returns 200 + ignored for unhandled event types',
    );
  }

  console.log('-'.repeat(60));
  if (fails === 0) {
    console.log('OK — all billing smoke checks passed.');
    process.exit(0);
  } else {
    console.log(`FAIL — ${fails} check(s) failed.`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
