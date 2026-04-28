// api/events/ingest-event.js — POST /api/events/ingest-event
// -----------------------------------------------------------------------------
// Records a tenant activity event onto the bus and dispatches it to every
// active module whose trigger matches.
//
// Called by:
//   - webhook handlers (call missed, invoice overdue, job completed, etc.)
//   - the launcher's own modules when they take actions
//   - customer SDKs / webhooks
//
// Body:
//   {
//     tenant_id: string,  (required)
//     event_type: string, (required; recommended prefix: "tenant.")
//     payload?: object
//   }
//
// Response:
//   { event, dispatch: { dispatched: N, results: [...] } }
// -----------------------------------------------------------------------------

import { corsPreflight, methodGuard, readBody } from './_lib.mjs';
import { emit } from './_bus.mjs';
import { dispatchEvent } from './_dispatcher.mjs';
import { getTenant } from '../tenants/_store.mjs';
import { requireTenantAccess } from '../tenants/_auth.mjs';

export const maxDuration = 30;
const MAX_EVENT_BODY_BYTES = 256_000;
const MAX_EVENT_TYPE_CHARS = 120;
const MAX_TENANT_ID_CHARS = 160;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;

  let body;
  try { body = await readBody(req, { maxBytes: MAX_EVENT_BODY_BYTES }); } catch (e) {
    if (e?.code === 'payload_too_large') {
      return res.status(413).json({ error: 'payload_too_large' });
    }
    return res.status(400).json({ error: 'invalid_json' });
  }
  const { tenant_id, event_type, payload } = body || {};
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });
  if (!event_type) return res.status(400).json({ error: 'event_type required' });
  if (String(tenant_id).length > MAX_TENANT_ID_CHARS) return res.status(400).json({ error: 'tenant_id too long' });
  if (String(event_type).length > MAX_EVENT_TYPE_CHARS) return res.status(400).json({ error: 'event_type too long' });
  if (payload != null && (typeof payload !== 'object' || Array.isArray(payload))) {
    return res.status(400).json({ error: 'payload object required' });
  }

  const tenant = await getTenant(tenant_id);
  if (!tenant) return res.status(404).json({ error: 'tenant_not_found' });
  if (!requireTenantAccess(req, res, tenant)) return;

  const event = emit(event_type, { tenant_id, ...(payload || {}) });

  // Dispatch to matching active modules
  let dispatch = { dispatched: 0, results: [] };
  try {
    dispatch = await dispatchEvent(event);
  } catch (e) {
    console.error('[ingest-event] dispatch threw:', e);
  }

  return res.status(201).json({ event, dispatch });
}
