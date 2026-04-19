// scripts/smoke-auth.mjs — verifies admin-auth rejects bogus tokens and
// accepts a valid HMAC token.
import { createHmac } from 'node:crypto';

const { verifyAdminToken, requireAdmin } = await import('../api/_lib/admin-auth.mjs');

const ADMIN_SECRET = 'test-secret-key-for-audit-only';
process.env.ADMIN_KEY = ADMIN_SECRET;
process.env.USE_MODULAR_AGENTS = 'true';

function mockReq(token) {
  return { headers: token ? { 'x-dynasty-admin-token': token } : {} };
}
function mockRes() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

let failed = 0;

// 1. No token -> reject
if (await verifyAdminToken(mockReq(null))) { console.error('FAIL: empty token accepted'); failed++; }
else console.log('PASS empty token rejected');

// 2. Wrong-format token -> reject
if (await verifyAdminToken(mockReq('not-a-real-token'))) { console.error('FAIL: non-formatted token accepted'); failed++; }
else console.log('PASS non-formatted token rejected');

// 3. Valid format, wrong secret -> reject
const expiry = Date.now() + 60_000;
const badHash = createHmac('sha256', 'wrong-secret').update('admin:' + expiry).digest('hex');
if (await verifyAdminToken(mockReq(`admin:${expiry}:${badHash}`))) { console.error('FAIL: wrong-secret accepted'); failed++; }
else console.log('PASS wrong-secret HMAC rejected');

// 4. Expired valid token -> reject
const pastExpiry = Date.now() - 60_000;
const expiredHash = createHmac('sha256', ADMIN_SECRET).update('admin:' + pastExpiry).digest('hex');
if (await verifyAdminToken(mockReq(`admin:${pastExpiry}:${expiredHash}`))) { console.error('FAIL: expired accepted'); failed++; }
else console.log('PASS expired token rejected');

// 5. Valid token -> accept
const goodHash = createHmac('sha256', ADMIN_SECRET).update('admin:' + expiry).digest('hex');
if (!(await verifyAdminToken(mockReq(`admin:${expiry}:${goodHash}`)))) { console.error('FAIL: valid token rejected'); failed++; }
else console.log('PASS valid token accepted');

// 6. requireAdmin wrapper returns 401 on bad, runs handler on good
let handlerRan = false;
const wrapped = requireAdmin(async (req, res) => { handlerRan = true; res.status(200).json({ ok: true }); });
const res1 = mockRes();
await wrapped(mockReq('bad'), res1);
if (res1.statusCode !== 401 || handlerRan) { console.error('FAIL: wrapper let bad token through'); failed++; }
else console.log('PASS wrapper returns 401 on bad token');

const res2 = mockRes();
await wrapped(mockReq(`admin:${expiry}:${goodHash}`), res2);
if (!handlerRan || res2.statusCode !== 200) { console.error('FAIL: wrapper did not run handler'); failed++; }
else console.log('PASS wrapper runs handler on valid token');

// 7. Flag off -> 501 even on valid token
process.env.USE_MODULAR_AGENTS = 'false';
handlerRan = false;
const res3 = mockRes();
await wrapped(mockReq(`admin:${expiry}:${goodHash}`), res3);
if (res3.statusCode !== 501 || handlerRan) { console.error('FAIL: flag-off let request through'); failed++; }
else console.log('PASS flag-off returns 501');

if (failed > 0) { console.error(`\n${failed} check(s) failed.`); process.exit(1); }
console.log('\nAll 7 auth checks passed.');
