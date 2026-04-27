// api/admin/test-fire-event.js — POST /api/admin/test-fire-event
// -----------------------------------------------------------------------------
// Admin-only convenience endpoint. Emits a trigger event on behalf of a
// tenant and dispatches it through the normal pipeline. Used for:
//   - smoke-testing a module activation end-to-end without real vendor webhooks
//   - demoing the platform on sales calls
//   - debugging a stuck activation
//
// Body: { tenant_id, event_type, payload? }
// -----------------------------------------------------------------------------

import { corsPreflight, methodGuard, readBody } from '../tenants/_lib.mjs';
import { getTenant } from '../tenants/_store.mjs';
import { verifyRawAdminHeader } from '../tenants/_auth.mjs';
import { emit } from '../events/_bus.mjs';
import { dispatchEvent } from '../events/_dispatcher.mjs';

export const maxDuration = 30;

function adminOnly(req, res) {
  if (!verifyRawAdminHeader(req)) {
    res.status(403).json({ error: 'admin_only' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;
  if (!adminOnly(req, res)) return;

  let body;
  try { body = await readBody(req); } catch (e) {
    return res.status(400).json({ error: 'invalid_json' });
  }
  const { tenant_id, event_type, payload } = body || {};
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });
  if (!event_type) return res.status(400).json({ error: 'event_type required' });

  if (!await getTenant(tenant_id)) return res.status(404).json({ error: 'tenant_not_found' });

  const event = emit(event_type, { tenant_id, ...(payload || {}) });

  let dispatch = { dispatched: 0, results: [] };
  try {
    dispatch = await dispatchEvent(event);
  } catch (e) {
    console.error('[test-fire-event] dispatch threw:', e);
  }

  return res.status(201).json({
    event,
    dispatch,
    hint: dispatch.dispatched === 0
      ? 'No matching active module. Check that a module with this trigger is entitled + active for this tenant.'
      : `${dispatch.dispatched} workflow(s) ran`,
  });
}
