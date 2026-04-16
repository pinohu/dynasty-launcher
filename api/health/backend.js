// api/health/backend.js — GET /api/health/backend
// -----------------------------------------------------------------------------
// Reports which storage backend is active (memory vs postgres), whether the
// schema has been migrated, and counts. Public by design — useful for quickly
// diagnosing "why is my POST failing?" without needing admin credentials.
// -----------------------------------------------------------------------------

import { backend, healthcheck, _stats } from '../tenants/_store.mjs';

export const maxDuration = 15;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const out = {
    backend,
    timestamp: new Date().toISOString(),
    database_url_set: !!process.env.DATABASE_URL,
    admin_key_set: !!(process.env.ADMIN_KEY || process.env.TEST_ADMIN_KEY),
  };

  try {
    out.health = await healthcheck();
  } catch (e) {
    out.health = { ok: false, error: String(e.message || e) };
  }
  try {
    out.stats = await _stats();
  } catch (e) {
    out.stats = { error: String(e.message || e) };
  }

  return res.status(out.health?.ok ? 200 : 503).json(out);
}
