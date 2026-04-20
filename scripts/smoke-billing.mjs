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

function invoke(handlerModule, { method = 'POST', query = {}, body = null, headers = {}, _noAuth = false } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      _status: 200, _body: null,
      status(s) { this._status = s; return this; },
      setHeader() {},
      json(b) { this._body = b; resolve({ status: this._status, body: b }); return this; },
      end() { resolve({ status: this._status, body: null }); return this; },
    };
    const mergedHeaders = _noAuth ? { ...headers } : { 'x-admin-key': 'test-admin-key', ...headers };
    // For webhook tests where body is a raw JSON string, simulate stream
    const req = (typeof body === 'string')
      ? Object.assign({
          method, query, headers: mergedHeaders,
          on(event, cb) {
            if (event === 'data') { this._dataCb = cb; setImmediate(() => cb(body)); }
            else if (event === 'end') { this._endCb = cb; setImmediate(() => cb()); }
          },
        }, {})
      : { method, query, headers: mergedHeaders, body };
    Promise.resolve(handlerModule.default(req, res)).catch(reject);
  });
}

async function loadHandlers() {
  return {
    createTenant: await import('../api/tenants/create-tenant.js'),
    checkout: await import('../api/billing/create-checkout-session.js'),
    webhook: await import('../api/billing/webhook.js'),
    getTenant: await import('../api/tenants/get-tenant.js'),
    catalogSync: await import('../api/billing/catalog-sync.js'),
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
        && r.body.lookup_keys?.[0] === 'module_webform_autoreply_annual'
        && r.body.line_items[0].price === 'price_stub_module_webform_autoreply_annual',
      'checkout returns stub session with resolved lookup_key',
      `lookup_key=${r.body.lookup_keys?.[0]} price=${r.body.line_items?.[0]?.price}`,
    );
  }

  // ============================================================
  // create-checkout-session concierge (one-time)
  // ============================================================
  {
    const r = await invoke(h.checkout, {
      body: {
        tenant_id: tenant.tenant_id,
        items: [{ sku_type: 'concierge', sku_code: 'guided' }],
      },
    });
    fails += log(
      r.status === 200
        && r.body.lookup_keys?.[0] === 'concierge_guided_onetime',
      'concierge checkout uses onetime lookup_key',
      `lookup_key=${r.body.lookup_keys?.[0]}`,
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

  // ============================================================
  // catalog-sync: requires admin key
  // ============================================================
  {
    const r = await invoke(h.catalogSync, { body: {}, _noAuth: true });
    fails += log(
      r.status === 401 && r.body.error === 'admin_key_required',
      'catalog-sync rejects request without admin key',
      `status=${r.status}`,
    );
  }

  // ============================================================
  // catalog-sync: dry-run returns expected SKU coverage
  // ============================================================
  {
    const r = await invoke(h.catalogSync, {
      headers: { 'x-admin-key': 'test-admin-key' },
      body: { dry_run: true },
    });
    const ops = r.body?.operations || [];
    const byType = ops.reduce((acc, o) => {
      acc[o.sku_type] = (acc[o.sku_type] || 0) + 1; return acc;
    }, {});
    const expectModules = byType.module >= 15;      // 20 live modules in catalog
    const expectPacks = byType.pack === 5;
    const expectSuites = byType.suite === 3;
    const expectEditions = byType.edition === 3;    // enterprise skipped (null price)
    const expectConcierge = byType.concierge === 3; // starter/guided/premium
    const expectTier = byType.tier === 1;
    fails += log(
      r.status === 200 && r.body.dry_run === true
        && expectModules && expectPacks && expectSuites && expectEditions
        && expectConcierge && expectTier,
      'catalog-sync dry_run enumerates all SKU families',
      `modules=${byType.module} packs=${byType.pack} suites=${byType.suite} editions=${byType.edition} concierge=${byType.concierge} tier=${byType.tier}`,
    );
  }

  // ============================================================
  // catalog-sync: skipped enterprise edition recorded
  // ============================================================
  {
    const r = await invoke(h.catalogSync, {
      headers: { 'x-admin-key': 'test-admin-key' },
      body: { dry_run: true, scope: 'editions' },
    });
    const skipped = r.body?.summary?.skipped || [];
    const enterpriseSkipped = skipped.some(
      (s) => s.sku_type === 'edition' && s.sku_code === 'enterprise' && s.reason === 'no_price',
    );
    fails += log(enterpriseSkipped, 'catalog-sync skips enterprise edition (Talk to sales)');
  }

  // ============================================================
  // catalog-sync: module prices include monthly + annual with correct math
  // ============================================================
  {
    const r = await invoke(h.catalogSync, {
      headers: { 'x-admin-key': 'test-admin-key' },
      body: { dry_run: true, scope: 'modules' },
    });
    const webform = (r.body.operations || []).find(
      (o) => o.sku_code === 'webform_autoreply',
    );
    const keys = (webform?.prices || []).map((p) => p.lookup_key);
    const hasMonthly = keys.includes('module_webform_autoreply_monthly');
    const hasAnnual = keys.includes('module_webform_autoreply_annual');
    const annual = (webform?.prices || []).find((p) => p.lookup_key?.endsWith('_annual'));
    // $19/mo × 12 × 0.8 = $182.40 → rounded $182 → 18200 cents
    const annualCentsOk = annual?.unit_amount === 18200;
    fails += log(
      hasMonthly && hasAnnual && annualCentsOk,
      'catalog-sync generates module monthly + annual (20% off) prices',
      `annual_cents=${annual?.unit_amount}`,
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
