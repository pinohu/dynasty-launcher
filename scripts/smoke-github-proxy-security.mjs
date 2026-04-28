// scripts/smoke-github-proxy-security.mjs
// -----------------------------------------------------------------------------
// Regression coverage for /api/github:
//   - unauthenticated callers cannot proxy through the server token
//   - paid tokens may reach read paths only
//   - mutable GitHub methods require admin auth
// -----------------------------------------------------------------------------

import crypto from 'node:crypto';

process.env.PAYMENT_ACCESS_SECRET = 'payment-secret-for-github-smoke';
process.env.TEST_ADMIN_KEY = 'github-admin-secret';
Reflect.deleteProperty(process.env, 'GITHUB_TOKEN');

function signPaymentToken(subject = 'user_github_smoke') {
  const exp = Date.now() + 60 * 60 * 1000;
  const payload = `pay:cs_test_github:${subject}:professional:${exp}`;
  const sig = crypto
    .createHmac('sha256', process.env.PAYMENT_ACCESS_SECRET)
    .update(payload)
    .digest('hex');
  return `${payload}:${sig}`;
}

function signAdminToken() {
  const exp = Date.now() + 60 * 60 * 1000;
  const payload = `admin_test:${exp}`;
  const sig = crypto.createHmac('sha256', process.env.TEST_ADMIN_KEY).update(payload).digest('hex');
  return `${payload}:${sig}`;
}

function invoke(handlerModule, { method = 'GET', query = {}, body = null, headers = {} } = {}) {
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
      send(b) {
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

function log(ok, name, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
  return ok ? 0 : 1;
}

async function main() {
  const github = await import('../api/github.js');
  let fails = 0;

  console.log('Smoke test: GitHub proxy security');
  console.log('-'.repeat(60));

  {
    const r = await invoke(github, { query: { path: '/repos/pinohu/dynasty-launcher' } });
    fails += log(
      r.status === 401 && r.body.error === 'Authentication required',
      'GitHub proxy rejects unauthenticated reads',
      `status=${r.status}`,
    );
  }

  const paidToken = signPaymentToken();
  {
    const r = await invoke(github, {
      query: { path: '/repos/pinohu/dynasty-launcher' },
      headers: { 'x-dynasty-access-token': paidToken },
    });
    fails += log(
      r.status === 500 && r.body.error === 'GITHUB_TOKEN not configured',
      'paid token can reach read path after auth',
      `status=${r.status}`,
    );
  }

  {
    const r = await invoke(github, {
      method: 'PATCH',
      query: { path: '/repos/pinohu/dynasty-launcher' },
      headers: { 'x-dynasty-access-token': paidToken },
      body: { description: 'blocked', access_token: paidToken },
    });
    fails += log(
      r.status === 403 && r.body.error === 'admin_required_for_mutation',
      'paid token cannot mutate GitHub through server token',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    const r = await invoke(github, {
      query: { path: '/user/repos' },
      headers: { 'x-dynasty-access-token': paidToken },
    });
    fails += log(
      r.status === 403 && r.body.error === 'Path not allowed',
      'paid token cannot list server-account repositories',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    const r = await invoke(github, {
      query: { path: '/repos/pinohu/dynasty-launcher/actions/secrets' },
      headers: { 'x-dynasty-access-token': paidToken },
    });
    fails += log(
      r.status === 403 && r.body.error === 'Path not allowed',
      'paid token cannot read sensitive repo API subpaths',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    const r = await invoke(github, {
      method: 'PATCH',
      query: { path: '/repos/pinohu/dynasty-launcher' },
      headers: { 'x-dynasty-admin-token': signAdminToken() },
      body: { description: 'would require configured token' },
    });
    fails += log(
      r.status === 500 && r.body.error === 'GITHUB_TOKEN not configured',
      'admin token can reach mutation path after auth',
      `status=${r.status}`,
    );
  }

  {
    const r = await invoke(github, {
      query: { path: '/user/repos' },
      headers: { 'x-dynasty-admin-token': signAdminToken() },
    });
    fails += log(
      r.status === 500 && r.body.error === 'GITHUB_TOKEN not configured',
      'admin token can still reach operational repo-list path',
      `status=${r.status}`,
    );
  }

  console.log('-'.repeat(60));
  if (fails === 0) {
    console.log('OK - GitHub proxy security checks passed.');
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
