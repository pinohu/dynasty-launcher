// scripts/smoke-checkout-security.mjs
// -----------------------------------------------------------------------------
// Security regression coverage for /api/checkout:
//   - bare session_id cannot mint a paid access token
//   - browser-held checkout nonce can bind anonymous checkout verification
//   - recovery start does not reveal paid-customer existence
//   - recovery codes are random, stored, one-time values
// -----------------------------------------------------------------------------

import crypto from 'node:crypto';

process.env.STRIPE_SECRET_KEY = 'sk_test_checkout_security';
process.env.PAYMENT_ACCESS_SECRET = 'payment-secret-for-checkout-security';
process.env.EMAILIT_API_KEY = 'emailit-test-key';

const sentEmails = [];
const sessions = new Map();
const paidBuyerSession = {
  id: 'cs_recovery_paid',
  mode: 'payment',
  status: 'complete',
  payment_status: 'paid',
  customer_email: 'buyer@example.com',
  metadata: { plan: 'professional', user_id: 'user_recovery' },
  amount_total: 499700,
  currency: 'usd',
};

function nonceHash(nonce) {
  return crypto
    .createHmac('sha256', process.env.PAYMENT_ACCESS_SECRET)
    .update(`checkout-verify:${nonce}`)
    .digest('hex');
}

function oldDeterministicCode(email) {
  const window5m = Math.floor(Date.now() / 300000);
  return crypto
    .createHmac('sha256', process.env.PAYMENT_ACCESS_SECRET)
    .update(`recover:${email.toLowerCase()}:${window5m}`)
    .digest('hex')
    .slice(-6)
    .toUpperCase();
}

global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('/v1/checkout/sessions?limit=100')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [paidBuyerSession] }),
      text: async () => JSON.stringify({ data: [paidBuyerSession] }),
    };
  }
  if (u.includes('/v1/checkout/sessions/')) {
    const id = decodeURIComponent(u.split('/v1/checkout/sessions/')[1]);
    const session = sessions.get(id);
    return {
      ok: !!session,
      status: session ? 200 : 404,
      json: async () => session || { error: { message: 'not found' } },
      text: async () => JSON.stringify(session || { error: { message: 'not found' } }),
    };
  }
  if (u.includes('/v1/checkout/sessions') && opts.method === 'POST') {
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'cs_created', url: 'https://checkout.stripe.test/session' }),
      text: async () =>
        JSON.stringify({ id: 'cs_created', url: 'https://checkout.stripe.test/session' }),
    };
  }
  if (u.includes('api.emailit.com')) {
    const body = JSON.parse(opts.body || '{}');
    sentEmails.push(body);
    return {
      ok: true,
      status: 202,
      json: async () => ({ ok: true }),
      text: async () => '',
    };
  }
  throw new Error(`Unexpected fetch: ${u}`);
};

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
        this._headers[k] = v;
        return this;
      },
      json(b) {
        this._body = b;
        resolve({ status: this._status, body: b, headers: this._headers });
        return this;
      },
      end() {
        resolve({ status: this._status, body: null, headers: this._headers });
        return this;
      },
    };
    const req = { method, query, headers, body, socket: { remoteAddress: '127.0.0.1' } };
    Promise.resolve(handlerModule.default(req, res)).catch(reject);
  });
}

function extractCodeFromLastEmail() {
  const last = sentEmails[sentEmails.length - 1];
  const match = String(last?.text || '').match(/\b(\d{6})\b/);
  return match?.[1] || '';
}

function log(ok, name, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
  return ok ? 0 : 1;
}

async function main() {
  const checkout = await import('../api/checkout.js');
  let fails = 0;

  console.log('Smoke test: checkout verification and recovery security');
  console.log('-'.repeat(60));

  const nonce = 'nonce_1234567890abcdef';
  sessions.set('cs_anon_bound', {
    id: 'cs_anon_bound',
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    metadata: { plan: 'professional', verify_nonce_hash: nonceHash(nonce) },
    amount_total: 499700,
    currency: 'usd',
  });
  sessions.set('cs_anon_old', {
    id: 'cs_anon_old',
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    metadata: { plan: 'professional' },
    amount_total: 499700,
    currency: 'usd',
  });
  sessions.set('cs_user_bound', {
    id: 'cs_user_bound',
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    metadata: { plan: 'professional', user_id: 'user_owner' },
    amount_total: 499700,
    currency: 'usd',
  });

  {
    const r = await invoke(checkout, {
      query: { action: 'verify' },
      body: { session_id: 'cs_anon_old' },
    });
    fails += log(
      r.status === 403 && r.body.error === 'Session verification binding required',
      'bare anonymous session_id cannot mint access',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    const r = await invoke(checkout, {
      query: { action: 'verify' },
      body: { session_id: 'cs_anon_bound' },
    });
    fails += log(
      r.status === 403 && r.body.error === 'Session verification failed',
      'nonce-bound session rejects missing nonce',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    const r = await invoke(checkout, {
      query: { action: 'verify' },
      body: { session_id: 'cs_anon_bound', verify_nonce: nonce },
    });
    fails += log(
      r.status === 200 &&
        r.body.paid === true &&
        String(r.body.access_token || '').startsWith('pay:cs_anon_bound:anon:professional:'),
      'correct checkout nonce mints anonymous paid token',
      `status=${r.status}`,
    );
  }

  {
    const r = await invoke(checkout, {
      query: { action: 'verify' },
      body: { session_id: 'cs_user_bound' },
    });
    fails += log(
      r.status === 403 && r.body.error === 'Session ownership mismatch',
      'user-bound session requires matching user or nonce',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    const r = await invoke(checkout, {
      query: { action: 'verify' },
      body: { session_id: 'cs_user_bound', user_id: 'user_owner' },
    });
    fails += log(
      r.status === 200 &&
        r.body.paid === true &&
        String(r.body.access_token || '').startsWith('pay:cs_user_bound:user_owner:professional:'),
      'matching user-bound session can mint paid token',
      `status=${r.status}`,
    );
  }

  {
    const r1 = await invoke(checkout, {
      query: { action: 'recover_start' },
      body: { email: 'nobody@example.com' },
    });
    const emailCountAfterUnknown = sentEmails.length;
    const r2 = await invoke(checkout, {
      query: { action: 'recover_start' },
      body: { email: 'buyer@example.com' },
    });
    fails += log(
      r1.status === 200 &&
        r2.status === 200 &&
        r1.body.sent === true &&
        r2.body.sent === true &&
        emailCountAfterUnknown === 0 &&
        sentEmails.length === 1,
      'recovery start uses generic response without paid-customer enumeration',
      `unknownEmails=${emailCountAfterUnknown} totalEmails=${sentEmails.length}`,
    );
  }

  const code = extractCodeFromLastEmail();
  {
    const oldCode = oldDeterministicCode('buyer@example.com');
    const r = await invoke(checkout, {
      query: { action: 'recover_verify' },
      body: { email: 'buyer@example.com', code: oldCode },
    });
    fails += log(
      r.status === 200 && r.body.ok === false && r.body.error === 'Invalid or expired code',
      'old deterministic recovery code is not accepted',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    const r = await invoke(checkout, {
      query: { action: 'recover_verify' },
      body: { email: 'buyer@example.com', code },
    });
    fails += log(
      r.status === 200 &&
        r.body.ok === true &&
        r.body.session_id === 'cs_recovery_paid' &&
        String(r.body.access_token || '').startsWith('pay:cs_recovery_paid:anon:professional:'),
      'stored random recovery code verifies and mints paid token',
      `status=${r.status}`,
    );
  }

  {
    const r = await invoke(checkout, {
      query: { action: 'recover_verify' },
      body: { email: 'buyer@example.com', code },
    });
    fails += log(
      r.status === 200 && r.body.ok === false && r.body.error === 'Invalid or expired code',
      'recovery code is one-time use',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  console.log('-'.repeat(60));
  if (fails === 0) {
    console.log('OK - checkout security checks passed.');
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
