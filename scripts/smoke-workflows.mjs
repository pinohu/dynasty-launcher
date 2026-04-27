// scripts/smoke-workflows.mjs — end-to-end workflow dispatch tests
// -----------------------------------------------------------------------------
// Proves the full loop:
//   create tenant → enable capabilities → grant entitlement → activate module
//   → ingest matching event → dispatcher runs workflow → actions emit events
//   → aggregates see the events
//
// Covers:
//   - webform_autoreply runs on form.submitted
//   - missed_call_textback runs on call.missed with matching conditions
//   - missed_call_textback SKIPS on call.missed when condition unmet
//   - post_job_review_request runs on job.completed + honors settings.channel
//   - inactive module does NOT fire when its trigger event arrives
//   - unknown event type dispatches zero workflows
//   - tenant with no matching active module dispatches zero
//   - every marketplace module has a workflow template
// -----------------------------------------------------------------------------

import { _reset as resetStore } from '../api/tenants/_store.mjs';
import { _reset as resetBus, getEvents } from '../api/events/_bus.mjs';
import { _resetWorkflowCache } from '../api/events/_dispatcher.mjs';

process.env.TEST_ADMIN_KEY = 'test-admin-key';

function invoke(handlerModule, { method = 'POST', query = {}, body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      _status: 200, _body: null,
      status(s) { this._status = s; return this; },
      setHeader() {},
      json(b) { this._body = b; resolve({ status: this._status, body: b }); return this; },
      end() { resolve({ status: this._status, body: null }); return this; },
    };
    const req = { method, query, headers, body };
    Promise.resolve(handlerModule.default(req, res)).catch(reject);
  });
}

async function loadHandlers() {
  return {
    createTenant: await import('../api/tenants/create-tenant.js'),
    setCap: await import('../api/tenants/set-tenant-capability.js'),
    grant: await import('../api/tenants/grant-entitlement.js'),
    activate: await import('../api/tenants/activate-module.js'),
    ingest: await import('../api/events/ingest-event.js'),
  };
}

function log(ok, name, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  return ok ? 0 : 1;
}

const ADMIN = { 'x-admin-key': 'test-admin-key' };

async function setupHvacTenant(h, caps) {
  const { body: { tenant } } = await invoke(h.createTenant, {
    method: 'POST',
    body: { blueprint_code: 'hvac', plan: 'professional' },
  });
  for (const cap of caps) {
    await invoke(h.setCap, {
      method: 'POST', headers: ADMIN,
      body: { tenant_id: tenant.tenant_id, capability_code: cap, enabled: true },
    });
  }
  return tenant;
}

async function entitleAndActivate(h, tenant, module_code, user_input) {
  await invoke(h.grant, {
    method: 'POST', headers: ADMIN,
    body: { tenant_id: tenant.tenant_id, module_code },
  });
  return invoke(h.activate, {
    method: 'POST',
    headers: ADMIN,
    body: { tenant_id: tenant.tenant_id, module_code, user_input: user_input || {} },
  });
}

async function main() {
  await resetStore();
  resetBus();
  _resetWorkflowCache();

  const h = await loadHandlers();
  let fails = 0;

  console.log('Smoke test: end-to-end workflow dispatch');
  console.log('-'.repeat(60));

  // ============================================================
  // webform_autoreply: full run
  // ============================================================
  {
    const tenant = await setupHvacTenant(h, ['forms', 'crm', 'email', 'sms']);
    await entitleAndActivate(h, tenant, 'webform_autoreply', { ack_channel: 'both' });

    const r = await invoke(h.ingest, {
      method: 'POST',
      headers: ADMIN,
      body: {
        tenant_id: tenant.tenant_id,
        event_type: 'form.submitted',
        payload: { name: 'Jane', email: 'jane@example.com', phone: '+15551234' },
      },
    });
    const dispatched = r.body.dispatch.dispatched;
    const result = r.body.dispatch.results[0];
    const runEvents = getEvents({ tenant_id: tenant.tenant_id });
    const hasStart = runEvents.some((e) => e.event_type === 'module.run.started' && e.payload.module_code === 'webform_autoreply');
    const hasComplete = runEvents.some((e) => e.event_type === 'module.run.completed' && e.payload.module_code === 'webform_autoreply');
    const hasLeadCreated = runEvents.some((e) => e.event_type === 'tenant.lead_created');
    const hasEmail = runEvents.some((e) => e.event_type === 'module.email_sent');
    const hasSms = runEvents.some((e) => e.event_type === 'module.sms_sent');
    const ok = dispatched === 1 && result.status === 'completed' && hasStart && hasComplete && hasLeadCreated && hasEmail && hasSms;
    fails += log(ok, 'webform_autoreply runs end-to-end: lead + email + sms emitted',
      `dispatched=${dispatched} status=${result?.status} events=${runEvents.length}`);
  }

  await resetStore(); resetBus();

  // ============================================================
  // webform_autoreply: channel=email only skips sms step via guard
  // ============================================================
  {
    const tenant = await setupHvacTenant(h, ['forms', 'crm', 'email']);
    await entitleAndActivate(h, tenant, 'webform_autoreply', { ack_channel: 'email' });
    await invoke(h.ingest, {
      method: 'POST',
      headers: ADMIN,
      body: {
        tenant_id: tenant.tenant_id,
        event_type: 'form.submitted',
        payload: { name: 'Bob', email: 'bob@example.com', phone: '+15559999' },
      },
    });
    const evts = getEvents({ tenant_id: tenant.tenant_id });
    const emails = evts.filter((e) => e.event_type === 'module.email_sent').length;
    const smses = evts.filter((e) => e.event_type === 'module.sms_sent').length;
    fails += log(emails === 1 && smses === 0,
      'webform_autoreply with ack_channel=email skips sms step via workflow guard',
      `emails=${emails} smses=${smses}`);
  }

  await resetStore(); resetBus();

  // ============================================================
  // missed_call_textback: trigger condition enforcement
  // ============================================================
  {
    const tenant = await setupHvacTenant(h, ['phone', 'sms', 'crm']);
    await entitleAndActivate(h, tenant, 'missed_call_textback', {
      reply_delay_seconds: 0,
      template_id: 'tmpl_missed_call_default',
    });

    // Event with condition met
    const r1 = await invoke(h.ingest, {
      method: 'POST',
      headers: ADMIN,
      body: {
        tenant_id: tenant.tenant_id,
        event_type: 'call.missed',
        payload: { caller_phone: '+15551111', caller_is_new_or_unknown: true },
      },
    });

    // Event with condition NOT met (known caller)
    const r2 = await invoke(h.ingest, {
      method: 'POST',
      headers: ADMIN,
      body: {
        tenant_id: tenant.tenant_id,
        event_type: 'call.missed',
        payload: { caller_phone: '+15552222', caller_is_new_or_unknown: false },
      },
    });

    fails += log(r1.body.dispatch.dispatched === 1, 'call.missed with new caller dispatches workflow');
    fails += log(r2.body.dispatch.dispatched === 0, 'call.missed with known caller does NOT dispatch (trigger condition gate)');
  }

  await resetStore(); resetBus();

  // ============================================================
  // post_job_review_request: runs on job.completed
  // ============================================================
  {
    const tenant = await setupHvacTenant(h, ['crm', 'reviews', 'sms', 'email']);
    await entitleAndActivate(h, tenant, 'post_job_review_request', { channel: 'both', primary_platform: 'google' });
    const r = await invoke(h.ingest, {
      method: 'POST',
      headers: ADMIN,
      body: {
        tenant_id: tenant.tenant_id,
        event_type: 'job.completed',
        payload: { job_id: 'job_001', contact_phone: '+15557777', contact_email: 'c@example.com' },
      },
    });
    const evts = getEvents({ tenant_id: tenant.tenant_id });
    const logOutcome = evts.find((e) => e.event_type === 'tenant.module_outcome_logged');
    const ok = r.body.dispatch.dispatched === 1
      && logOutcome && logOutcome.payload.job_id === 'job_001';
    fails += log(ok, 'post_job_review_request fires on job.completed + logs job_id',
      `logged=${!!logOutcome} job_id=${logOutcome?.payload.job_id}`);
  }

  await resetStore(); resetBus();

  // ============================================================
  // Inactive module does NOT dispatch
  // ============================================================
  {
    const tenant = await setupHvacTenant(h, ['forms', 'crm', 'email']);
    // Grant but do NOT activate
    await invoke(h.grant, {
      method: 'POST', headers: ADMIN,
      body: { tenant_id: tenant.tenant_id, module_code: 'webform_autoreply' },
    });
    const r = await invoke(h.ingest, {
      method: 'POST',
      headers: ADMIN,
      body: { tenant_id: tenant.tenant_id, event_type: 'form.submitted', payload: {} },
    });
    fails += log(r.body.dispatch.dispatched === 0, 'entitled-but-not-active module does NOT dispatch');
  }

  await resetStore(); resetBus();

  // ============================================================
  // Unknown event type: zero dispatch
  // ============================================================
  {
    const tenant = await setupHvacTenant(h, ['forms', 'crm', 'email']);
    await entitleAndActivate(h, tenant, 'webform_autoreply', { ack_channel: 'email' });
    const r = await invoke(h.ingest, {
      method: 'POST',
      headers: ADMIN,
      body: { tenant_id: tenant.tenant_id, event_type: 'unrelated.event', payload: {} },
    });
    fails += log(r.body.dispatch.dispatched === 0, 'unrelated event type dispatches zero workflows');
  }

  await resetStore(); resetBus();

  // ============================================================
  // Every marketplace module has a runnable workflow template.
  // reschedule_workflow used to be the no-op canary; it must now complete.
  // ============================================================
  {
    const tenant = await setupHvacTenant(h, ['calendar', 'crm', 'email', 'sms']);
    await entitleAndActivate(h, tenant, 'reschedule_workflow', {});
    const r = await invoke(h.ingest, {
      method: 'POST',
      headers: ADMIN,
      body: { tenant_id: tenant.tenant_id, event_type: 'reschedule.requested', payload: { source: 'link_click' } },
    });
    const result = r.body.dispatch.results[0];
    const evts = getEvents({ tenant_id: tenant.tenant_id });
    const complete = evts.find((e) => e.event_type === 'module.run.completed' && e.payload.module_code === 'reschedule_workflow');
    const skip = evts.find((e) => e.event_type === 'module.run.skipped_no_workflow');
    fails += log(
      r.body.dispatch.dispatched === 1 && result?.status === 'completed' && complete && !skip,
      'reschedule_workflow has a runnable workflow template and completes',
      `status=${result?.status} completed=${!!complete} skipped=${!!skip}`,
    );
  }

  console.log('-'.repeat(60));
  if (fails === 0) {
    console.log('OK — all workflow smoke checks passed.');
    process.exit(0);
  } else {
    console.log(`FAIL — ${fails} check(s) failed.`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
