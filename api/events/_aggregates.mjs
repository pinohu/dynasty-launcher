// api/events/_aggregates.mjs — metric rollups per tenant
// -----------------------------------------------------------------------------
// Turns the raw event log into the metrics recommendation rules evaluate.
// Every recommendation rule in product/recommendations/*.json names a metric
// (e.g. `missed_calls`, `overdue_invoices`); this file is where those metrics
// are computed.
//
// Track 9 (Observability) replaces the in-memory scan with a real metrics
// warehouse. This stub is correct and deterministic for 10k-event scale.
// -----------------------------------------------------------------------------

import { getEvents } from './_bus.mjs';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function withinWindow(event, days) {
  if (!days) return true;
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  return new Date(event.emitted_at).getTime() >= cutoff;
}

function countEvents(tenant_id, event_type, window_days) {
  const events = getEvents({ tenant_id, event_type, limit: 10_000 });
  return events.filter((e) => withinWindow(e, window_days)).length;
}

// -----------------------------------------------------------------------------
// Metric calculators — one per signal.metric in product/recommendations/*
// -----------------------------------------------------------------------------
// Each takes (tenant_id, window_days) and returns a numeric value.
// Unknown metrics return null (the rule engine treats null as "not evaluable").
// -----------------------------------------------------------------------------

const CALCULATORS = {
  missed_calls: (tid, w) => countEvents(tid, 'tenant.call_missed', w),
  overdue_invoices: (tid, w) => countEvents(tid, 'tenant.invoice_overdue', w),
  completed_jobs_without_review_request: (tid, w) => {
    const completed = getEvents({ tenant_id: tid, event_type: 'tenant.job_completed', limit: 10_000 })
      .filter((e) => withinWindow(e, w));
    const reviewsAsked = new Set(
      getEvents({ tenant_id: tid, event_type: 'tenant.review_request_sent', limit: 10_000 })
        .filter((e) => withinWindow(e, w))
        .map((e) => e.payload?.job_id)
        .filter(Boolean),
    );
    return completed.filter((e) => !reviewsAsked.has(e.payload?.job_id)).length;
  },
  dormant_customers_over_6mo: (tid) => countEvents(tid, 'tenant.customer_dormant_6mo'),
  estimates_sent_without_followup: (tid, w) => {
    const sent = getEvents({ tenant_id: tid, event_type: 'tenant.estimate_sent', limit: 10_000 })
      .filter((e) => withinWindow(e, w));
    const followed = new Set(
      getEvents({ tenant_id: tid, event_type: 'tenant.estimate_followup_sent', limit: 10_000 })
        .filter((e) => withinWindow(e, w))
        .map((e) => e.payload?.estimate_id)
        .filter(Boolean),
    );
    return sent.filter((e) => !followed.has(e.payload?.estimate_id)).length;
  },
  no_show_rate: (tid, w) => {
    const appts = countEvents(tid, 'tenant.appointment_completed_or_no_show', w);
    if (appts === 0) return 0;
    const noShows = countEvents(tid, 'tenant.appointment_no_show', w);
    return noShows / appts;
  },
  first_response_time_minutes_p95: (tid, w) => {
    const resp = getEvents({ tenant_id: tid, event_type: 'tenant.lead_first_response', limit: 10_000 })
      .filter((e) => withinWindow(e, w))
      .map((e) => Number(e.payload?.response_time_minutes))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (resp.length === 0) return 0;
    const idx = Math.floor(0.95 * (resp.length - 1));
    return resp[idx];
  },
  profile_completeness_pct: () => {
    // Stubbed as 1.0; real implementation would inspect tenant.profile.
    // Track 4 adds a dedicated profile-completeness calculator.
    return 1.0;
  },
  cold_deals_over_30d: (tid) => countEvents(tid, 'tenant.deal_cold_30d'),
  customers_nearing_service_due: (tid) => countEvents(tid, 'tenant.customer_service_due'),
};

export function computeMetric(tenant_id, metric_name, window_days) {
  const fn = CALCULATORS[metric_name];
  if (!fn) return null;
  try {
    return fn(tenant_id, window_days);
  } catch (e) {
    console.error(`[aggregates] ${metric_name} threw: ${e.message}`);
    return null;
  }
}

export function supportedMetrics() {
  return Object.keys(CALCULATORS);
}
