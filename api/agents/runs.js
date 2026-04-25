// api/agents/runs.js — GET list of runs, or GET /api/agents/runs?run_id=X
// for one run's context. Flag-gated by USE_MODULAR_AGENTS.
export const maxDuration = 30;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Dynasty-Admin-Token');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  if (process.env.USE_MODULAR_AGENTS !== 'true') {
    return res.status(501).json({ error: 'USE_MODULAR_AGENTS is off' });
  }
  if (!(req.headers['x-dynasty-admin-token'] || '').toString()) {
    return res.status(401).json({ error: 'admin token required' });
  }

  const { run_id, tenant_id, status, since, limit } = req.query || {};
  try {
    const { runs, context } = await import('../../agents/_lib/event-stream.mjs');
    if (run_id) return res.status(200).json(await context({ run_id }));
    return res.status(200).json(await runs({ tenant_id, status, since, limit: Number(limit) || 50 }));
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
