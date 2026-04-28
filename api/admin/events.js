// api/admin/events.js — GET (admin-gated)
// -----------------------------------------------------------------------------
// Paginated, filterable query over the persistent events_log table.
//
// Query params:
//   tenant_id    — filter by tenant
//   event_type   — filter by type (prefix-matches, e.g. "module" → module.*)
//   module_code  — filter by module
//   since        — ISO timestamp lower bound
//   until        — ISO timestamp upper bound
//   limit        — page size (default 50, max 200)
//   offset       — pagination offset (default 0)
//
// Response:
//   { events: [...], total, has_more, offset, limit, backend }
// -----------------------------------------------------------------------------

import { getPersistedEvents } from '../events/_events_store.mjs';
import { adminCorsHeaders, verifyAdminCredential } from '../tenants/_auth.mjs';

export const maxDuration = 15;

function isAuthorized(req) {
  return verifyAdminCredential(req).ok;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', adminCorsHeaders());
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'admin_key_required' });

  const q = req.query || {};
  const limit = Math.min(parseInt(q.limit) || 50, 200);
  const offset = parseInt(q.offset) || 0;

  const result = await getPersistedEvents({
    tenant_id: q.tenant_id || null,
    event_type: q.event_type || null,
    module_code: q.module_code || null,
    since: q.since || null,
    until: q.until || null,
    limit,
    offset,
  });

  return res.status(200).json({
    ...result,
    offset,
    limit,
  });
}
