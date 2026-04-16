// api/events/_bus.mjs — event bus with optional Postgres persistence
// -----------------------------------------------------------------------------
// Every module activation, failure, and tenant event flows through this bus.
//
// Interface follows docs/operations/ACTIVATION_FLOW_SPEC.md: emit(type, payload)
// produces a structured event. Events stay in the in-memory log (for the
// current lambda warm period) and are also persisted fire-and-forget to
// Postgres events_log when DATABASE_URL is set. The persist() call does NOT
// block the emit — if the DB write fails, we log the error and move on.
//
// Consumers query via getEvents({...}) against in-memory state (fast, but
// ephemeral). For durable queries across cold starts, use _events_store.mjs
// getPersistedEvents() directly.
// -----------------------------------------------------------------------------

import { persist } from './_events_store.mjs';

const log = []; // append-only (current warm period)
const MAX_LOG = 10_000; // cap to avoid runaway memory in long-lived warm lambdas

export function emit(event_type, payload = {}) {
  const event = {
    event_id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    event_type,
    emitted_at: new Date().toISOString(),
    tenant_id: payload.tenant_id || null,
    module_code: payload.module_code || null,
    payload,
  };
  log.push(event);
  if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);

  // Fire-and-forget to Postgres. persist() is a no-op when DATABASE_URL absent.
  persist(event);

  return event;
}

export function getEvents({ tenant_id = null, event_type = null, since = null, limit = 100 } = {}) {
  let r = log;
  if (tenant_id) r = r.filter((e) => e.tenant_id === tenant_id);
  if (event_type) r = r.filter((e) => e.event_type === event_type || e.event_type.startsWith(event_type + '.'));
  if (since) r = r.filter((e) => e.emitted_at >= since);
  // newest first
  return r.slice(-limit).reverse();
}

export function _reset() {
  log.length = 0;
}

export function _size() {
  return log.length;
}
