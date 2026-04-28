import assert from 'node:assert/strict';
import {
  _closeJobStore,
  _resetMemoryJobs,
  claimNextJob,
  completeJob,
  enqueueJob,
  failJob,
  listJobs,
} from '../api/jobs/_store.mjs';
import claimHandler from '../api/jobs/claim.js';
import completeHandler from '../api/jobs/complete.js';
import enqueueHandler from '../api/jobs/enqueue.js';

process.env.DATABASE_URL = '';
process.env.TEST_ADMIN_KEY = 'jobs-test-key';

function invoke(handler, { method = 'POST', body = {}, query = {}, headers = undefined } = {}) {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      body,
      query,
      headers: headers === undefined ? { 'x-admin-key': process.env.TEST_ADMIN_KEY } : headers,
    };
    const res = {
      code: 200,
      setHeader() {},
      status(code) {
        this.code = code;
        return this;
      },
      json(payload) {
        resolve({ status: this.code, payload });
        return this;
      },
      end() {
        resolve({ status: this.code, payload: null });
        return this;
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

async function main() {
  _resetMemoryJobs();

  const unauthorized = await invoke(enqueueHandler, { headers: {} });
  assert.equal(unauthorized.status, 401);

  const first = await enqueueJob({
    type: 'business_factory.launch',
    queue: 'factory',
    priority: 20,
    max_attempts: 2,
    idempotency_key: 'launch-hvac-1',
    payload: { market: 'HVAC' },
  });
  const duplicate = await enqueueJob({
    type: 'business_factory.launch',
    queue: 'factory',
    priority: 20,
    idempotency_key: 'launch-hvac-1',
    payload: { market: 'HVAC duplicate' },
  });
  assert.equal(duplicate.job_id, first.job_id);

  const high = await enqueueJob({
    type: 'business_factory.money_first',
    queue: 'factory',
    priority: 90,
    payload: { offer: 'scorecard' },
  });

  const claimed = await claimNextJob({ queue: 'factory', worker_id: 'worker-a', lease_ms: 10000 });
  assert.equal(claimed.job_id, high.job_id);
  assert.equal(claimed.status, 'running');
  assert.equal(claimed.attempts, 1);

  const retried = await failJob(claimed.job_id, 'transient gateway error', { retry_delay_ms: 0 });
  assert.equal(retried.status, 'retry');
  assert.equal(retried.last_error, 'transient gateway error');

  const claimedAgain = await claimNextJob({
    queue: 'factory',
    worker_id: 'worker-b',
    lease_ms: 10000,
  });
  assert.equal(claimedAgain.job_id, high.job_id);
  const completed = await completeJob(claimedAgain.job_id, { deployed: true });
  assert.equal(completed.status, 'completed');
  assert.deepEqual(completed.result, { deployed: true });

  const enqueuedViaApi = await invoke(enqueueHandler, {
    body: {
      type: 'business_factory.weekly_optimization',
      queue: 'factory',
      payload: { run: true },
    },
  });
  assert.equal(enqueuedViaApi.status, 200);
  assert.equal(enqueuedViaApi.payload.ok, true);

  const claimedViaApi = await invoke(claimHandler, {
    body: { queue: 'factory', worker_id: 'api-worker' },
  });
  assert.equal(claimedViaApi.status, 200);
  assert.equal(claimedViaApi.payload.job.status, 'running');

  const completedViaApi = await invoke(completeHandler, {
    body: { job_id: claimedViaApi.payload.job.job_id, result: { ok: true } },
  });
  assert.equal(completedViaApi.status, 200);
  assert.equal(completedViaApi.payload.job.status, 'completed');

  const listed = await listJobs({ queue: 'factory' });
  assert.equal(listed.length >= 2, true);

  await _closeJobStore();
  console.log('jobs-smoke: ok');
}

main().catch(async (error) => {
  await _closeJobStore();
  console.error(error);
  process.exit(1);
});
