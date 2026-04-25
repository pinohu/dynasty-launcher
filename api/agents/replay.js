// api/agents/replay.js — GET full event stream for a run.
// Gated by USE_MODULAR_AGENTS + HMAC-verified admin token.
import { requireAdmin } from '../_lib/admin-auth.mjs';

export const maxDuration = 60;

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const { run_id, since_event_id, limit } = req.query || {};
  if (!run_id) return res.status(400).json({ error: 'run_id required' });

  try {
    const { replay } = await import('../../agents/_lib/event-stream.mjs');
    const result = await replay({
      run_id,
      since_event_id: since_event_id ? Number(since_event_id) : null,
      limit: Number(limit) || 1000,
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export default requireAdmin(handler);
