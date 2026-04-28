import assert from 'node:assert/strict';

process.env.TEST_ADMIN_KEY = process.env.TEST_ADMIN_KEY || 'test_admin_key_for_deliverable_privacy';
process.env.PAYMENT_ACCESS_SECRET = process.env.PAYMENT_ACCESS_SECRET || 'test_payment_access_secret';
process.env.TENANT_ACTION_SECRET = process.env.TENANT_ACTION_SECRET || 'test_tenant_action_secret';

const provision = (await import('../api/deliverables/provision.js')).default;
const launch = (await import('../api/deliverables/launch.js')).default;
const leads = (await import('../api/deliverables/leads.js')).default;

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

const body = {
  offer: 'foundation-build',
  business_name: 'Privacy Regression',
  owner_name: 'Jordan Lee',
  owner_email: 'owner@example.com',
  public_phone: '+15551234567',
  market: 'HVAC',
  service_area: 'Atlanta metro',
  launch_slug: 'privacy-regression',
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
  body,
  headers: {
    host: 'www.yourdeputy.com',
    'x-forwarded-proto': 'https',
    'x-admin-key': process.env.TEST_ADMIN_KEY,
  },
});
assert.equal(res.code, 200);
const launchId = res.body.launch_id;

res = await call(launch, {
  method: 'POST',
  query: {},
  body: {
    launch_id: launchId,
    name: 'Private Prospect',
    contact: 'private@example.com',
    email: 'private@example.com',
    need: 'Please call me',
  },
  headers: {},
});
assert.equal(res.code, 200);
assert.equal(res.body.lead.status, 'captured');
assert.equal(res.body.lead.email, undefined, 'public POST response must not echo lead email');
assert.equal(res.body.lead.tenant_id, undefined, 'public POST response must not expose tenant id');

res = await call(launch, {
  method: 'GET',
  query: { launch_id: launchId, include_leads: '1' },
  body: {},
  headers: {},
});
assert.equal(res.code, 200);
assert.equal(res.body.launch.leads, undefined, 'public launch GET must never include leads');
assert.equal(res.body.launch.tenant_id, undefined, 'public launch GET must not expose tenant id');

res = await call(leads, {
  method: 'GET',
  query: { launch_id: launchId },
  body: {},
  headers: {},
});
assert.equal(res.code, 401, 'private lead list must require authorization');

res = await call(leads, {
  method: 'GET',
  query: { launch_id: launchId },
  body: {},
  headers: { 'x-admin-key': process.env.TEST_ADMIN_KEY },
});
assert.equal(res.code, 200);
assert.equal(res.body.count, 1);
assert.equal(res.body.leads[0].payload.email, 'private@example.com');

console.log('smoke-deliverable-privacy: ok');
