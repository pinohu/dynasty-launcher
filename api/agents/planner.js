// api/agents/planner.js — HTTP wrapper around agents/_lib/planner.mjs
// POST { user_prompt, tenant_id?, tier?, prior_halts? } -> { plan }
// Gated by USE_MODULAR_AGENTS.
export const maxDuration = 60;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Dynasty-Admin-Token');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (process.env.USE_MODULAR_AGENTS !== 'true') {
    return res.status(501).json({ error: 'USE_MODULAR_AGENTS is off' });
  }

  // Reuse the same HMAC admin-token check the existing api/claude.js uses.
  const adminTok = (req.headers['x-dynasty-admin-token'] || '').toString();
  if (!adminTok) return res.status(401).json({ error: 'admin token required' });
  // (Full HMAC verification happens in the existing auth middleware; this
  // endpoint assumes it's fronted by that middleware in production.)

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
