// api/agents/planner.js — HTTP wrapper around agents/_lib/planner.mjs
// POST { user_prompt, tenant_id?, tier?, prior_halts? } -> { plan }
// Gated by USE_MODULAR_AGENTS + HMAC-verified admin token.
import { requireAdmin } from '../_lib/admin-auth.mjs';

export const maxDuration = 60;

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Dynasty-Admin-Token');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'POST only' });

  const { user_prompt, tenant_id = null, tier = 'foundation', prior_halts = [] } = req.body || {};
  if (!user_prompt) return res.status(400).json({ error: 'user_prompt required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY missing' });

  try {
    const { planRun } = await import('../../agents/_lib/planner.mjs');
    const plan = await planRun({ userPrompt: user_prompt, tenantId: tenant_id, tier, priorHalts: prior_halts, apiKey });
    return res.status(200).json({ ok: true, plan });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export default requireAdmin(handler);
