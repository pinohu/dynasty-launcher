// scripts/smoke-tenant-auth.mjs
// -----------------------------------------------------------------------------
// Regression checks for tenant-scoped authorization:
//   - tenant IDs alone cannot read tenant data
//   - admin/key can issue short-lived tenant tokens
//   - tenant token works only for its tenant/owner
//   - payment access tokens can issue tenant tokens only when owner-bound
// -----------------------------------------------------------------------------

import crypto from 'node:crypto';

import { _reset as resetStore } from '../api/tenants/_store.mjs';

process.env.TEST_ADMIN_KEY = 'test-admin-key';
process.env.TENANT_ACTION_SECRET = 'tenant-action-secret-for-auth-smoke';
process.env.PAYMENT_ACCESS_SECRET = 'payment-access-secret-for-auth-smoke';

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

async function loadHandlers() {
  return {
    createTenant: await import('../api/tenants/create-tenant.js'),
    issueToken: await import('../api/tenants/issue-token.js'),
    getTenant: await import('../api/tenants/get-tenant.js'),
    caps: await import('../api/tenants/get-tenant-capabilities.js'),
  };
}

function signTenantToken(tenantId, subject) {
  const exp = Date.now() + 60 * 60 * 1000;
  const payload = `tenant:${tenantId}:${subject}:${exp}`;
  const sig = crypto
    .createHmac('sha256', process.env.TENANT_ACTION_SECRET)
    .update(payload)
    .digest('hex');
  return `${payload}:${sig}`;
}

function signPaymentToken(subject) {
  const exp = Date.now() + 60 * 60 * 1000;
  const payload = `pay:cs_test_owner:${subject}:professional:${exp}`;
  const sig = crypto
    .createHmac('sha256', process.env.PAYMENT_ACCESS_SECRET)
    .update(payload)
    .digest('hex');
  return `${payload}:${sig}`;
}

function log(ok, name, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
  return ok ? 0 : 1;
}

const ADMIN = { 'x-admin-key': 'test-admin-key' };

async function main() {
  await resetStore();
  const h = await loadHandlers();
  let fails = 0;

  console.log('Smoke test: tenant authorization');
  console.log('-'.repeat(60));

  const owner = 'user_auth_owner';
  const {
    body: { tenant },
  } = await invoke(h.createTenant, {
    method: 'POST',
    headers: ADMIN,
    body: {
      blueprint_code: 'hvac',
      plan: 'professional',
      user_id: owner,
      business_name: 'Auth HVAC',
    },
  });

  // Tenant ID by itself is not a credential.
  {
    const r = await invoke(h.getTenant, { query: { tenant_id: tenant.tenant_id } });
    fails += log(
      r.status === 401 && r.body.error === 'tenant_authorization_required',
      'get-tenant rejects raw tenant_id without auth',
      `status=${r.status}`,
    );
  }

  // Admin can issue a tenant action token.
  let issuedToken = '';
  {
    const r = await invoke(h.issueToken, {
      method: 'POST',
      headers: { 'x-admin-key': 'test-admin-key' },
      body: { tenant_id: tenant.tenant_id, subject: owner },
    });
    issuedToken = r.body.token;
    fails += log(
      r.status === 200 &&
        r.body.ok === true &&
        issuedToken?.startsWith(`tenant:${tenant.tenant_id}:${owner}:`),
      'admin can issue tenant action token',
      `auth_type=${r.body.auth_type}`,
    );
  }

  // Correct tenant token can read tenant data.
  {
    const r = await invoke(h.getTenant, {
      query: { tenant_id: tenant.tenant_id },
      headers: { authorization: `Bearer ${issuedToken}` },
    });
    fails += log(
      r.status === 200 && r.body.tenant?.tenant_id === tenant.tenant_id,
      'tenant action token can read its tenant',
      `status=${r.status}`,
    );
  }

  // Wrong tenant token cannot read this tenant.
  {
    const wrong = signTenantToken('tnt_wrongtenant', owner);
    const r = await invoke(h.getTenant, {
      query: { tenant_id: tenant.tenant_id },
      headers: { authorization: `Bearer ${wrong}` },
    });
    fails += log(
      r.status === 403 && r.body.error === 'tenant_token_mismatch',
      'wrong-tenant token is rejected',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  // Owner-bound payment token can issue a tenant action token.
  {
    const paymentToken = signPaymentToken(owner);
    const r = await invoke(h.issueToken, {
      method: 'POST',
      headers: { authorization: `Bearer ${paymentToken}` },
      body: { tenant_id: tenant.tenant_id, subject: owner },
    });
    fails += log(
      r.status === 200 && r.body.auth_type === 'payment_token' && r.body.token,
      'owner payment token can issue tenant token',
      `status=${r.status}`,
    );
  }

  // Non-owner payment token cannot issue tenant tokens.
  {
    const paymentToken = signPaymentToken('user_not_owner');
    const r = await invoke(h.issueToken, {
      method: 'POST',
      headers: { authorization: `Bearer ${paymentToken}` },
      body: { tenant_id: tenant.tenant_id, subject: 'user_not_owner' },
    });
    fails += log(
      r.status === 403 && r.body.error === 'tenant_owner_mismatch',
      'non-owner payment token cannot issue tenant token',
      `status=${r.status}`,
    );
  }

  // Capability read is protected by the same token.
  {
    const r = await invoke(h.caps, {
      query: { tenant_id: tenant.tenant_id },
      headers: { authorization: `Bearer ${issuedToken}` },
    });
    fails += log(
      r.status === 200 && Array.isArray(r.body.all_capabilities),
      'tenant token can read capabilities',
      `caps=${r.body.all_capabilities?.length}`,
    );
  }

  console.log('-'.repeat(60));
  if (fails === 0) {
    console.log('OK - tenant authorization checks passed.');
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
