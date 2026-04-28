// scripts/smoke-privileged-api-security.mjs
// -----------------------------------------------------------------------------
// Regression checks for privileged API auth plumbing:
//   - protected routes expose the auth headers their browser callers require
//   - signed admin headers pass shared auth gates without provider calls
//   - body/query admin tokens do not grant AI/provider spend
// -----------------------------------------------------------------------------

import crypto from 'node:crypto';

process.env.TEST_ADMIN_KEY = 'privileged-api-smoke-admin-key';
process.env.ADMIN_KEY = '';
process.env.PAYMENT_ACCESS_SECRET = 'privileged-api-smoke-payment-secret';
process.env.DYNASTY_TOOL_CONFIG = '{}';
process.env.POSTGRES_URL = '';
process.env.DATABASE_URL = '';

function signAdminToken() {
  const expiry = Date.now() + 60 * 60 * 1000;
  const payload = `admin_test:${expiry}`;
  const sig = crypto.createHmac('sha256', process.env.TEST_ADMIN_KEY).update(payload).digest('hex');
  return `${payload}:${sig}`;
}

function invoke(handlerModule, { method = 'POST', query = {}, body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      _status: 200,
      _body: null,
      _headers: {},
      status(s) {
        this._status = s;
        return this;
      },
      setHeader(k, v) {
        this._headers[String(k).toLowerCase()] = v;
      },
      json(b) {
        this._body = b;
        resolve({ status: this._status, body: b, headers: this._headers });
        return this;
      },
      send(b) {
        this._body = b;
        resolve({ status: this._status, body: b, headers: this._headers });
        return this;
      },
      end() {
        resolve({ status: this._status, body: null, headers: this._headers });
        return this;
      },
      write() {},
    };
    const req = { method, query, headers, body, socket: { remoteAddress: '127.0.0.1' } };
    Promise.resolve(handlerModule.default(req, res)).catch(reject);
  });
}

function log(ok, name, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
  return ok ? 0 : 1;
}

function hasHeaders(actual, expected) {
  const lower = String(actual || '').toLowerCase();
  return expected.every((name) => lower.includes(name.toLowerCase()));
}

async function main() {
  const [aiSdk, research, memory, orchestrate, twentyi, provision, fireEvent] = await Promise.all([
    import('../api/ai-sdk.js'),
    import('../api/research.js'),
    import('../api/memory.js'),
    import('../api/orchestrate.js'),
    import('../api/twentyi.js'),
    import('../api/provision.js'),
    import('../api/admin/test-fire-event.js'),
  ]);
  const adminToken = signAdminToken();
  let fails = 0;

  console.log('Smoke test: privileged API auth plumbing');
  console.log('-'.repeat(60));

  for (const [name, handler] of [
    ['research', research],
    ['memory', memory],
    ['orchestrate', orchestrate],
    ['twentyi', twentyi],
    ['provision', provision],
  ]) {
    const r = await invoke(handler, { method: 'OPTIONS' });
    fails += log(
      r.status === 200 || r.status === 204,
      `${name} handles CORS preflight`,
      `status=${r.status}`,
    );
    fails += log(
      hasHeaders(r.headers['access-control-allow-headers'], [
        'authorization',
        'x-admin-key',
        'x-dynasty-admin-token',
        'x-dynasty-access-token',
      ]),
      `${name} allows shared privileged auth headers`,
      r.headers['access-control-allow-headers'],
    );
  }

  {
    const r = await invoke(aiSdk, {
      body: {
        action: 'unknown_action',
        prompt: 'hello',
        model: 'model-with-no-provider-key',
        admin_token: adminToken,
      },
    });
    fails += log(
      r.status === 401 && r.body.error === 'ai_authorization_required',
      '/api/ai-sdk rejects admin tokens in JSON bodies',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    const r = await invoke(research, {
      headers: { 'x-dynasty-admin-token': adminToken },
      body: { action: 'unknown' },
    });
    fails += log(
      r.status === 400 && r.body.error === 'Unknown action: unknown',
      '/api/research accepts signed admin header then dispatches safely',
      `status=${r.status}`,
    );
  }

  {
    const r = await invoke(orchestrate, {
      method: 'GET',
      query: { action: 'plan' },
      headers: { 'x-dynasty-admin-token': adminToken },
    });
    fails += log(
      r.status === 200 && Array.isArray(r.body.execution_plan),
      '/api/orchestrate accepts signed admin header for read-only plan',
      `status=${r.status}`,
    );
  }

  {
    const r = await invoke(twentyi, {
      method: 'GET',
      query: { action: 'check' },
      headers: { 'x-dynasty-admin-token': adminToken },
    });
    fails += log(
      r.status === 400 && r.body.manual === true,
      '/api/twentyi reaches configuration gate after shared auth',
      `status=${r.status}`,
    );
  }

  {
    const r = await invoke(fireEvent, {
      method: 'POST',
      headers: { 'x-dynasty-admin-token': adminToken },
      body: { tenant_id: 'missing_tenant', event_type: 'lead.created' },
    });
    fails += log(
      r.status === 404 && r.body.error === 'tenant_not_found',
      'admin test-fire-event accepts signed admin session headers',
      `status=${r.status}`,
    );
  }

  console.log('-'.repeat(60));
  if (fails === 0) {
    console.log('OK - privileged API auth plumbing checks passed.');
    process.exit(0);
  }
  console.log(`FAIL - ${fails} check(s) failed.`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
