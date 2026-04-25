// api/agents/replay.js — GET the full event stream for a run, for
// time-travel debugging. Streams events in order.
export const maxDuration = 60;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (process.env.USE_MODULAR_AGENTS !== 'true') return res.status(501).json({ error: 'flag off' });
  if (!(req.headers['x-dynasty-admin-token'] || '').toString()) return res.status(401).json({ error: 'admin token required' });

  const { run_id, since_event_id, limit } = req.query || {};
  if (!run_id) return res.status(400).json({ error: 'run_id required' });

  try {
    const { replay } = await import('../../agents/_lib/event-stream.mjs');
    const result = await replay({ run_id, since_event_id: since_event_id ? Number(since_event_id) : null, limit: Number(limit) || 1000 });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
