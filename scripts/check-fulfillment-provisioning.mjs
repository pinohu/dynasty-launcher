import assert from 'node:assert/strict';

process.env.TEST_ADMIN_KEY = process.env.TEST_ADMIN_KEY || 'test_admin_key_for_fulfillment';
process.env.PAYMENT_ACCESS_SECRET = process.env.PAYMENT_ACCESS_SECRET || 'test_payment_access_secret';

const provision = (await import('../api/deliverables/provision.js')).default;
const launch = (await import('../api/deliverables/launch.js')).default;

function mockRes() {
  return {
    code: 200,
    headers: {},
    body: null,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.code = code;
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

async function call(handler, req) {
  const res = mockRes();
  await handler(req, res);
  return res;
}

const baseBody = {
  offer: 'foundation-build',
  business_name: 'Fulfillment Regression',
  owner_name: 'Jordan Lee',
  owner_email: 'owner@example.com',
  public_phone: '+15551234567',
  market: 'HVAC',
  service_area: 'Atlanta metro',
  launch_slug: 'fulfillment-regression',
  customer_authorization: true,
  booking_url: 'https://calendar.example.com/acme',
  crm_owner_email: 'owner@example.com',
  crm_import_approved: true,
  sender_email: 'hello@example.com',
  resend_api_key: 'secret-resend',
  website_url: 'https://example.com',
  stripe_secret_key: 'secret-stripe',
  invoice_sender_email: 'billing@example.com',
  stripe_price_id: 'price_123',
  twilio_account_sid: 'twilio-account-sid-for-tests',
  twilio_auth_token: 'secret-twilio',
  twilio_from_number: '+15551234567',
  voice_webhook_authorized: true,
  google_review_url: 'https://g.page/r/example/review',
  sms_compliance_ack: true,
};

let res = await call(provision, {
  method: 'POST',
  query: {},
  body: baseBody,
  headers: { host: 'www.yourdeputy.com', 'x-forwarded-proto': 'https' },
});
assert.equal(res.code, 401, 'public provisioning POST must require paid/admin auth');

res = await call(provision, {
  method: 'POST',
  query: {},
  body: baseBody,
  headers: {
    host: 'www.yourdeputy.com',
    'x-forwarded-proto': 'https',
    'x-admin-key': process.env.TEST_ADMIN_KEY,
  },
});
assert.equal(res.code, 200, 'admin provisioning should succeed');
assert.equal(res.body.ok, true);
assert.equal(res.body.status_text, 'created_and_launched');
assert.ok(res.body.tenant_id, 'provisioning must create a tenant');
assert.ok(res.body.launched_url.includes('?launch_id='), 'launched URL must use durable launch id');
assert.ok(res.body.activations.some((a) => a.status === 'ok' || a.status === 'idempotent_ok'), 'modules must activate');
assert.ok(!JSON.stringify(res.body).includes('secret-twilio'), 'response must not leak secret values');

const launchId = res.body.launch_id;

res = await call(launch, {
  method: 'GET',
  query: { launch_id: launchId },
  body: {},
  headers: {},
});
assert.equal(res.code, 200, 'launch GET should load durable runtime');
assert.equal(res.body.ok, true);
assert.equal(res.body.launch.launch_id, launchId);
assert.ok(res.body.launch.runtime.modules.length > 0, 'launch runtime must include modules');

res = await call(launch, {
  method: 'POST',
  query: {},
  body: {
    launch_id: launchId,
    name: 'Casey Prospect',
    contact: 'casey@example.com',
    email: 'casey@example.com',
    need: 'Need service this week',
  },
  headers: {},
});
assert.equal(res.code, 200, 'lead POST should be accepted');
assert.equal(res.body.ok, true);
assert.equal(res.body.lead.status, 'captured');
assert.ok(res.body.dispatch.dispatched >= 1, 'lead capture must fire at least one active workflow');

console.log('check-fulfillment-provisioning: ok');
