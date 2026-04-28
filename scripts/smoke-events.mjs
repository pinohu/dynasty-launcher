// scripts/smoke-events.mjs — smoke tests for api/events/*
// -----------------------------------------------------------------------------
// Covers:
//   - ingest-event validates input and records to bus
//   - opportunity-cards evaluates recommendations against real events
//   - rules don't fire when the recommended module is already active
//   - rules fire when threshold + conditions all met
//   - card interpolation of {{signal.value}}
//   - max 3 cards returned (MARKETPLACE_AND_UPSELL_LOGIC.md constraint)
//
// Run: node scripts/smoke-events.mjs
// -----------------------------------------------------------------------------

import { Readable } from 'node:stream';

import { _reset as resetStore } from '../api/tenants/_store.mjs';
import { _reset as resetBus, emit } from '../api/events/_bus.mjs';
import { readBody } from '../api/events/_lib.mjs';

process.env.TEST_ADMIN_KEY = 'test-admin-key';

function invoke(handlerModule, { method = 'GET', query = {}, body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      _status: 200,
      _body: null,
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
    cards: await import('../api/events/opportunity-cards.js'),
  };
}

function log(ok, name, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  return ok ? 0 : 1;
}

const ADMIN = { 'x-admin-key': 'test-admin-key' };

async function main() {
  await resetStore();
  resetBus();
  const h = await loadHandlers();
  let fails = 0;

  console.log('Smoke test: api/events/*');
  console.log('-'.repeat(60));

  // Create an HVAC tenant with CRM + SMS enabled (satisfies several rules' capability_present)
  const { body: { tenant } } = await invoke(h.createTenant, {
    method: 'POST',
    headers: ADMIN,
    body: { blueprint_code: 'hvac', plan: 'professional' },
  });
  for (const cap of ['crm', 'sms', 'email', 'phone', 'invoicing']) {
    await invoke(h.setCap, {
      method: 'POST',
      headers: ADMIN,
      body: { tenant_id: tenant.tenant_id, capability_code: cap, enabled: true },
    });
  }

  // ============================================================
  // ingest-event basic validation
  // ============================================================
  {
    const r = await invoke(h.ingest, { method: 'POST', body: {} });
    fails += log(r.status === 400 && r.body.error.includes('tenant_id'),
      'ingest-event without tenant_id returns 400', `error=${r.body.error}`);
  }
  {
    const r = await invoke(h.ingest, { method: 'POST', body: { tenant_id: tenant.tenant_id } });
    fails += log(r.status === 400 && r.body.error.includes('event_type'),
      'ingest-event without event_type returns 400');
  }
  {
    const r = await invoke(h.ingest, {
      method: 'POST',
      body: { tenant_id: tenant.tenant_id, event_type: `tenant.${'x'.repeat(130)}` },
    });
    fails += log(r.status === 400 && r.body.error === 'event_type too long',
      'ingest-event rejects oversized event_type before auth');
  }
  {
    const r = await invoke(h.ingest, {
      method: 'POST',
      body: { tenant_id: tenant.tenant_id, event_type: 'tenant.call_missed', payload: [] },
    });
    fails += log(r.status === 400 && r.body.error === 'payload object required',
      'ingest-event rejects non-object payloads before auth');
  }
  {
    const r = await invoke(h.ingest, {
      method: 'POST',
      body: {
        tenant_id: tenant.tenant_id,
        event_type: 'tenant.call_missed',
        payload: { blob: 'x'.repeat(260_000) },
      },
    });
    fails += log(r.status === 413 && r.body.error === 'payload_too_large',
      'ingest-event caps parsed event body size before auth');
  }
  {
    let rejected = false;
    try {
      await readBody(Readable.from(['x'.repeat(32)]), { maxBytes: 16 });
    } catch (e) {
      rejected = e?.code === 'payload_too_large';
    }
    fails += log(rejected, 'event body stream reader rejects oversized raw bodies');
  }
  {
    const r = await invoke(h.ingest, {
      method: 'POST',
      body: { tenant_id: 'tnt_nope', event_type: 'tenant.call_missed' },
    });
    fails += log(r.status === 404, 'ingest-event on missing tenant returns 404');
  }
  {
    const r = await invoke(h.ingest, {
      method: 'POST',
      headers: ADMIN,
      body: { tenant_id: tenant.tenant_id, event_type: 'tenant.call_missed', payload: { from: '+15551234' } },
    });
    fails += log(r.status === 201 && r.body.event?.event_type === 'tenant.call_missed',
      'ingest-event records valid event');
  }

  // ============================================================
  // Opportunity cards — empty tenant first
  // ============================================================
  {
    const r = await invoke(h.cards, { query: { tenant_id: tenant.tenant_id }, headers: ADMIN });
    fails += log(r.status === 200 && Array.isArray(r.body.cards),
      'cards endpoint returns a card array for any tenant', `count=${r.body.count} rules=${r.body.total_rules}`);
  }

  // ============================================================
  // Fire the missed-calls rule:
  //   rule threshold is >= 10 missed calls in 30 days
  //   capability_present: phone, sms — set above
  //   module_inactive: missed_call_textback — no entitlement granted, so inactive
  // ============================================================
  {
    // Send 11 missed-call events
    for (let i = 0; i < 11; i++) {
      emit('tenant.call_missed', { tenant_id: tenant.tenant_id, from: `+155551234${i}` });
    }
    const r = await invoke(h.cards, { query: { tenant_id: tenant.tenant_id }, headers: ADMIN });
    const card = r.body.cards.find((c) => c.rule_code === 'missed-calls-rule');
    fails += log(
      !!card
        && card.module_recommended === 'missed_call_textback'
        && card.metric_value >= 11
        && /\d+ calls/.test(card.headline),
      'missed-calls-rule fires with correct recommendation + interpolated headline',
      `headline=${card?.headline} value=${card?.metric_value}`,
    );
  }

  // ============================================================
  // Once missed_call_textback is active, the rule must NOT fire
  // ============================================================
  {
    await invoke(h.grant, {
      method: 'POST',
      headers: ADMIN,
      body: { tenant_id: tenant.tenant_id, module_code: 'missed_call_textback' },
    });
    await invoke(h.activate, {
      method: 'POST',
      headers: ADMIN,
      body: { tenant_id: tenant.tenant_id, module_code: 'missed_call_textback' },
    });
    const r = await invoke(h.cards, { query: { tenant_id: tenant.tenant_id }, headers: ADMIN });
    const card = r.body.cards.find((c) => c.rule_code === 'missed-calls-rule');
    fails += log(!card, 'missed-calls-rule does NOT fire once the module is active');
  }

  // ============================================================
  // Trigger overdue-invoices-rule (threshold >= 5)
  // ============================================================
  {
    for (let i = 0; i < 6; i++) {
      emit('tenant.invoice_overdue', { tenant_id: tenant.tenant_id, invoice_id: `inv_${i}` });
    }
    const r = await invoke(h.cards, { query: { tenant_id: tenant.tenant_id }, headers: ADMIN });
    const card = r.body.cards.find((c) => c.rule_code === 'overdue-invoices-rule');
    fails += log(
      !!card && card.module_recommended === 'overdue_invoice_reminder',
      'overdue-invoices-rule fires on 6 overdue-invoice events',
    );
  }

  // ============================================================
  // Blueprint gate: service-due-rule only fires for blueprint_in: [hvac, pest-control, cleaning, med-spa]
  // Our tenant is HVAC → should fire if threshold met
  // Customers nearing service due: need tenant.customer_service_due events
  // Threshold is >= 20
  // ============================================================
  {
    for (let i = 0; i < 25; i++) {
      emit('tenant.customer_service_due', { tenant_id: tenant.tenant_id, contact_id: `ctc_${i}` });
    }
    const r = await invoke(h.cards, { query: { tenant_id: tenant.tenant_id, all: 'true' }, headers: ADMIN });
    const card = r.body.cards.find((c) => c.rule_code === 'service-due-rule');
    fails += log(
      !!card && card.module_recommended === 'service_due_reminder',
      'service-due-rule fires for hvac tenant at threshold',
    );
  }

  // ============================================================
  // Blueprint gate: a non-matching blueprint should NOT fire service-due-rule
  // ============================================================
  {
    const { body: { tenant: plumbTenant } } = await invoke(h.createTenant, {
      method: 'POST',
      headers: ADMIN,
      body: { blueprint_code: 'plumbing', plan: 'professional' },
    });
    for (const cap of ['crm', 'sms']) {
      await invoke(h.setCap, {
        method: 'POST',
        headers: ADMIN,
        body: { tenant_id: plumbTenant.tenant_id, capability_code: cap, enabled: true },
      });
    }
    for (let i = 0; i < 25; i++) {
      emit('tenant.customer_service_due', { tenant_id: plumbTenant.tenant_id, contact_id: `ctc_${i}` });
    }
    const r = await invoke(h.cards, { query: { tenant_id: plumbTenant.tenant_id, all: 'true' }, headers: ADMIN });
    const card = r.body.cards.find((c) => c.rule_code === 'service-due-rule');
    fails += log(!card, 'service-due-rule does NOT fire for plumbing (blueprint_in gate)');
  }

  // ============================================================
  // Max 3 cards returned by default (priority-sorted)
  // ============================================================
  {
    // Our hvac tenant already has 2 cards matching. Force more by pumping more triggers.
    for (let i = 0; i < 11; i++) {
      emit('tenant.job_completed', { tenant_id: tenant.tenant_id, job_id: `job_${i}` });
    }
    for (let i = 0; i < 51; i++) {
      emit('tenant.customer_dormant_6mo', { tenant_id: tenant.tenant_id, contact_id: `ctc_d_${i}` });
    }
    for (let i = 0; i < 11; i++) {
      emit('tenant.deal_cold_30d', { tenant_id: tenant.tenant_id, deal_id: `deal_${i}` });
    }
    const r = await invoke(h.cards, { query: { tenant_id: tenant.tenant_id }, headers: ADMIN });
    const sortedDesc = r.body.cards.every((c, i, arr) => i === 0 || (arr[i - 1].priority || 0) >= (c.priority || 0));
    fails += log(
      r.body.cards.length <= 3 && sortedDesc && r.body.total_matches >= 3,
      'default returns <= 3 cards, priority-sorted desc',
      `count=${r.body.cards.length} total=${r.body.total_matches}`,
    );
  }

  // ============================================================
  // ?all=true returns everything (no cap)
  // ============================================================
  {
    const r = await invoke(h.cards, { query: { tenant_id: tenant.tenant_id, all: 'true' }, headers: ADMIN });
    fails += log(r.body.cards.length === r.body.total_matches,
      '?all=true returns all matches, no cap', `count=${r.body.cards.length}`);
  }

  console.log('-'.repeat(60));
  if (fails === 0) {
    console.log('OK — all event smoke checks passed.');
    process.exit(0);
  } else {
    console.log(`FAIL — ${fails} check(s) failed.`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
