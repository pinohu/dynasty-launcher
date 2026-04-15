// api/events/_bus.mjs — minimal in-memory event bus (MVP stub)
// -----------------------------------------------------------------------------
// Every module activation, failure, and tenant event flows through this bus.
//
// Interface follows docs/operations/ACTIVATION_FLOW_SPEC.md: emit(type, payload)
// produces a structured event; consumers query via getEvents({...}) with
// optional filters.
//
// Track 9 (Observability) replaces this with persistent telemetry flowing to
// dashboards and alerting. The interface is stable; the storage swaps.
// -----------------------------------------------------------------------------

const log = []; // append-only
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
