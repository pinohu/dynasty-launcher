// api/agents/resume.js — POST { run_id } -> everything needed to pick up
// a crashed or halted run where it left off.
export const maxDuration = 30;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (process.env.USE_MODULAR_AGENTS !== 'true') return res.status(501).json({ error: 'flag off' });
  if (!(req.headers['x-dynasty-admin-token'] || '').toString()) return res.status(401).json({ error: 'admin token required' });

  const { run_id } = req.body || {};
  if (!run_id) return res.status(400).json({ error: 'run_id required' });

  try {
    const { resumePacket, appendEvent } = await import('../../agents/_lib/event-stream.mjs');
    const packet = await resumePacket({ run_id });
    // Emit a resume event so the event stream records that we picked this up.
    appendEvent({ run_id, iteration: 0, subagent: 'orchestrator', event_type: 'resume', payload: { remaining: packet.remaining_plan_items.length } });
    return res.status(200).json({ ok: true, ...packet });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
