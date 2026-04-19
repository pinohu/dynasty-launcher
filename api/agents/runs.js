// api/agents/runs.js — GET list, or GET ?run_id=X for one run's context.
// Gated by USE_MODULAR_AGENTS + HMAC-verified admin token.
import { requireAdmin } from '../_lib/admin-auth.mjs';

export const maxDuration = 30;

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Dynasty-Admin-Token');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'GET only' });

  const { run_id, tenant_id, status, since, limit } = req.query || {};
  try {
    const { runs, context } = await import('../../agents/_lib/event-stream.mjs');
    if (run_id) return res.status(200).json(await context({ run_id }));
    return res.status(200).json(await runs({ tenant_id, status, since, limit: Number(limit) || 50 }));
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export default requireAdmin(handler);
