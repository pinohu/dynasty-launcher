import assert from 'node:assert/strict';
import { requiredFactoryEnv, runBusinessFactory } from '../api/_business_factory.mjs';
import handler from '../api/business-factory.js';
import { _resetMemoryJobs } from '../api/jobs/_store.mjs';

process.env.TEST_ADMIN_KEY = 'business-factory-test-key';
process.env.DATABASE_URL = '';

function invoke(body, headers = { 'x-admin-key': process.env.TEST_ADMIN_KEY }) {
  return new Promise((resolve, reject) => {
    const req = { method: 'POST', headers, body };
    const res = {
      code: 200,
      headers: {},
      setHeader(key, value) {
        this.headers[key] = value;
      },
      status(code) {
        this.code = code;
        return this;
      },
      json(payload) {
        resolve({ status: this.code, payload, headers: this.headers });
        return this;
      },
      end() {
        resolve({ status: this.code, payload: null, headers: this.headers });
        return this;
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

const validPayload = {
  market: 'HVAC service businesses',
  target_customer: 'multi-truck HVAC owners',
  pain_signals: [
    'Missed call response is slow and causes lost revenue.',
    'Manual follow up means urgent estimate requests go cold.',
    'Owners pay for leads but do not know which calls convert.',
  ],
  monetization_goal: 'cash_first',
  launch_channel: 'partner',
  build_profile: 'micro_saas',
  mode: 'dry_run',
  max_days_to_revenue: 10,
};

async function main() {
  _resetMemoryJobs();

  assert.deepEqual(Object.keys(requiredFactoryEnv()).sort(), [
    'launch',
    'operate',
    'optional',
    'outreach',
  ]);

  const direct = runBusinessFactory(validPayload, {});
  assert.equal(direct.ok, true);
  assert.equal(direct.status, 'ready_for_launch');
  assert.equal(direct.offer.core_offer.price_usd >= 197, true);
  assert.equal(
    direct.application.generated_files['.env.example'].includes('STRIPE_SECRET_KEY='),
    true,
  );
  assert.equal(direct.revenue.stripe_catalog.length, 3);
  assert.equal(direct.automations.workflows.length >= 4, true);
  assert.equal(direct.agents.callable_interfaces.includes('/api/business-factory'), true);

  const unauthenticated = await invoke(validPayload, {});
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.payload.ok, false);

  const invalid = await invoke({ market: 'x', pain_signals: [] });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.payload.error, 'invalid_business_factory_input');

  const queued = await invoke({ ...validPayload, enqueue_job: true });
  assert.equal(queued.status, 200);
  assert.equal(queued.payload.queued_job.type, 'business_factory.launch');
  assert.equal(queued.payload.queued_job.queue, 'factory');

  const launchBlocked = await invoke({ ...validPayload, mode: 'launch' });
  assert.equal(launchBlocked.status, 409);
  assert.equal(launchBlocked.payload.status, 'blocked');
  assert.equal(
    launchBlocked.payload.blockers.some((b) => b === 'missing_env:GITHUB_TOKEN'),
    true,
  );

  const launchReady = runBusinessFactory(
    { ...validPayload, mode: 'launch' },
    {
      ADMIN_KEY: 'prod-admin',
      GITHUB_TOKEN: 'gh-token',
      VERCEL_TOKEN: 'vercel-token',
      STRIPE_SECRET_KEY: 'sk_live_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      DATABASE_URL: 'postgres://example',
      TENANT_ACTION_SECRET: 'tenant-secret',
      PAYMENT_ACCESS_SECRET: 'payment-secret',
    },
  );
  assert.equal(launchReady.status, 'ready_for_launch');
  assert.equal(launchReady.env_validation.can_launch, true);

  console.log('business-factory-smoke: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
