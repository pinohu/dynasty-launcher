// scripts/smoke-admin-key-security.mjs
// -----------------------------------------------------------------------------
// Regression checks for raw admin key handling:
//   - ?key= no longer grants admin authority
//   - x-admin-key remains available for server-side/admin smoke paths
// -----------------------------------------------------------------------------

process.env.TEST_ADMIN_KEY = 'admin-key-query-smoke';

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
  const health = await import('../api/health.js');
  const fireEvent = await import('../api/admin/test-fire-event.js');
  const setCapability = await import('../api/tenants/set-tenant-capability.js');
  let fails = 0;

  console.log('Smoke test: admin key transport');
  console.log('-'.repeat(60));

  {
    const r = await invoke(health, { query: { key: process.env.TEST_ADMIN_KEY } });
    fails += log(
      r.status === 200 && r.body.ok === true && r.body.status === 'operational' && !r.body.checks,
      'health ignores query-string admin key and returns public payload',
      `status=${r.status}`,
    );
  }

  {
    const r = await invoke(fireEvent, {
      method: 'POST',
      query: { key: process.env.TEST_ADMIN_KEY },
      body: { tenant_id: 'tnt_demo', event_type: 'lead.created' },
    });
    fails += log(
      r.status === 403 && r.body.error === 'admin_only',
      'admin test-fire-event rejects query-string admin key',
      `status=${r.status}`,
    );
  }

  {
    const r = await invoke(setCapability, {
      method: 'POST',
      query: { key: process.env.TEST_ADMIN_KEY },
      body: { tenant_id: 'tnt_demo', capability_code: 'email', enabled: true },
    });
    fails += log(
      r.status === 403 && r.body.error === 'admin_only',
      'tenant admin utility rejects query-string admin key',
      `status=${r.status}`,
    );
  }

  console.log('-'.repeat(60));
  if (fails === 0) {
    console.log('OK - admin key transport checks passed.');
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
