// api/agents/resume.js — POST { run_id } -> resume packet + emits resume event.
// Gated by USE_MODULAR_AGENTS + HMAC-verified admin token.
import { requireAdmin } from '../_lib/admin-auth.mjs';

export const maxDuration = 30;

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { run_id } = req.body || {};
  if (!run_id) return res.status(400).json({ error: 'run_id required' });

  try {
    const { resumePacket, appendEvent } = await import('../../agents/_lib/event-stream.mjs');
    const packet = await resumePacket({ run_id });
    appendEvent({
      run_id,
      iteration: 0,
      subagent: 'orchestrator',
      event_type: 'resume',
      payload: { remaining: packet.remaining_plan_items.length },
    });
    return res.status(200).json({ ok: true, ...packet });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export default requireAdmin(handler);
