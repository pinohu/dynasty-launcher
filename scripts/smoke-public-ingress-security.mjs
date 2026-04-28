import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.ADMIN_KEY = 'test-admin-key';
process.env.TEST_ADMIN_KEY = 'test-admin-key';
process.env.DYNASTY_TOOL_CONFIG = '{}';
process.env.NEON_API_KEY = '';
process.env.POSTGRES_URL = '';
process.env.DATABASE_URL = '';
process.env.POSTHOG_API_KEY = '';
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.TELEGRAM_CHAT_ID = '';

function res() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

async function invoke(handler, { method = 'POST', query = {}, headers = {}, body = {} } = {}) {
  const response = res();
  await handler({ method, query, headers, body }, response);
  return response;
}

const waitlist = (await import('../api/waitlist.js')).default;
const telemetry = (await import('../api/telemetry.js')).default;
const neon = (await import('../api/neon.js')).default;

let failures = 0;
function log(ok, label, detail = '') {
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`  ${status}  ${label}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures += 1;
}

console.log('Smoke test: public ingress abuse guards');
console.log('------------------------------------------------------------');

for (let i = 0; i < 5; i += 1) {
  await invoke(waitlist, {
    headers: { 'x-forwarded-for': '198.51.100.10' },
    body: { email: `person${i}@example.com`, name: 'Test User', tier_interest: 'professional' },
  });
}
{
  const r = await invoke(waitlist, {
    headers: { 'x-forwarded-for': '198.51.100.10' },
    body: { email: 'person6@example.com', name: 'Test User', tier_interest: 'professional' },
  });
  log(
    r.statusCode === 429 && r.headers['retry-after'] === '600',
    'waitlist throttles repeated signup attempts before provider calls',
    `status=${r.statusCode}`,
  );
}

for (let i = 0; i < 60; i += 1) {
  const r = await invoke(telemetry, {
    headers: { 'x-forwarded-for': '198.51.100.20' },
    body: { event: 'test_event', distinct_id: `anon_${i}`, properties: { page: 'security-smoke' } },
  });
  assert.notEqual(r.statusCode, 429);
}
{
  const r = await invoke(telemetry, {
    headers: { 'x-forwarded-for': '198.51.100.20' },
    body: { event: 'test_event', distinct_id: 'anon_61' },
  });
  log(
    r.statusCode === 429 && r.headers['retry-after'] === '600',
    'telemetry throttles anonymous event floods',
    `status=${r.statusCode}`,
  );
}

{
  const r = await invoke(neon, { method: 'GET', query: { action: 'check' } });
  log(
    r.statusCode === 401 && r.body?.error === 'admin_auth_required',
    'Neon credential check rejects unauthenticated callers',
    `status=${r.statusCode}`,
  );
}
{
  const r = await invoke(neon, {
    method: 'POST',
    query: { action: 'create_project' },
    headers: { 'x-admin-key': 'test-admin-key' },
    body: { project_name: 'Security Smoke' },
  });
  log(
    r.statusCode === 200 && r.body?.manual === true,
    'Neon mutating path uses shared admin credential helper',
    `status=${r.statusCode}`,
  );
}

{
  const files = ['api/admin.js', 'api/provision.js', 'api/waitlist.js'];
  const offenders = files.filter((file) =>
    /https:\/\/acumbamail\.com[^`'"]*auth_token=/.test(readFileSync(file, 'utf8')),
  );
  log(
    offenders.length === 0,
    'Acumbamail auth tokens are not placed in request URLs',
    offenders.length ? offenders.join(',') : 'ok',
  );
}

console.log('------------------------------------------------------------');
if (failures) {
  console.error(`FAIL - ${failures} public ingress security check(s) failed.`);
  process.exit(1);
}
console.log('OK - public ingress abuse guards passed.');
