// scripts/smoke-automation-webhook-security.mjs
// -----------------------------------------------------------------------------
// Regression checks for external automation webhooks:
//   - provider webhooks fail closed when secrets are missing or STUB-prefixed
//   - form webhooks require a real HMAC signature instead of trusting tenant_id
//   - invalid signatures are rejected before database writes or event emission
// -----------------------------------------------------------------------------

Reflect.deleteProperty(process.env, 'CALLSCALER_WEBHOOK_SECRET');
process.env.TRAFFT_WEBHOOK_SECRET = 'STUB_TRAFFT_SECRET';
Reflect.deleteProperty(process.env, 'STRIPE_WEBHOOK_SECRET');
Reflect.deleteProperty(process.env, 'FORM_WEBHOOK_SECRET');
Reflect.deleteProperty(process.env, 'AUTOMATION_FORM_WEBHOOK_SECRET');

function makeReq({ source, payload, headers = {} }) {
  const body = JSON.stringify(payload);
  return {
    method: 'POST',
    query: { source },
    headers,
    rawBody: body,
  };
}

function invoke(handlerModule, req) {
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
    Promise.resolve(handlerModule.default(req, res)).catch(reject);
  });
}

function log(ok, name, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
  return ok ? 0 : 1;
}

async function main() {
  const webhook = await import('../api/automations/webhook.js');
  let fails = 0;

  console.log('Smoke test: automation webhook signature gates');
  console.log('-'.repeat(60));

  {
    const r = await invoke(
      webhook,
      makeReq({
        source: 'callscaler',
        payload: { source: 'callscaler', tenant_id: 'tnt_demo', event_type: 'call.missed' },
        headers: { 'x-callscaler-signature': 'bad' },
      }),
    );
    fails += log(
      r.status === 503 && r.body.error === 'webhook_secret_missing',
      'CallScaler webhook fails closed when secret is missing',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    const r = await invoke(
      webhook,
      makeReq({
        source: 'trafft',
        payload: { source: 'trafft', tenant_id: 'tnt_demo', event: 'appointment.created' },
        headers: { 'x-trafft-signature': 'bad' },
      }),
    );
    fails += log(
      r.status === 503 && r.body.error === 'webhook_secret_missing',
      'Trafft webhook treats STUB secret as missing',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    const r = await invoke(
      webhook,
      makeReq({
        source: 'stripe',
        payload: {
          type: 'checkout.session.completed',
          data: { object: { metadata: { tenant_id: 'tnt_demo' } } },
        },
        headers: { 'stripe-signature': 't=123,v1=bad' },
      }),
    );
    fails += log(
      r.status === 503 && r.body.error === 'webhook_secret_missing',
      'backup Stripe automation webhook fails closed without secret',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    const r = await invoke(
      webhook,
      makeReq({
        source: 'form',
        payload: { source: 'form', tenant_id: 'tnt_demo', email: 'lead@example.com' },
      }),
    );
    fails += log(
      r.status === 503 && r.body.error === 'webhook_secret_missing',
      'form webhook requires a configured HMAC secret',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    process.env.FORM_WEBHOOK_SECRET = 'real-form-secret';
    const r = await invoke(
      webhook,
      makeReq({
        source: 'form',
        payload: { source: 'form', tenant_id: 'tnt_demo', email: 'lead@example.com' },
        headers: { 'x-form-signature': 'bad' },
      }),
    );
    fails += log(
      r.status === 401 && r.body.error === 'invalid_signature',
      'form webhook rejects invalid signatures before side effects',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  console.log('-'.repeat(60));
  if (fails === 0) {
    console.log('OK - automation webhook signature checks passed.');
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
