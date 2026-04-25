// api/agents/datasource.js — HTTP wrapper around agents/_lib/datasource.mjs
// POST { source, query, tenant_id? } -> { rows, meta }
// Gated by USE_MODULAR_AGENTS.
export const maxDuration = 30;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Dynasty-Admin-Token');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (process.env.USE_MODULAR_AGENTS !== 'true') {
    return res.status(501).json({ error: 'USE_MODULAR_AGENTS is off' });
  }

  const adminTok = (req.headers['x-dynasty-admin-token'] || '').toString();
  if (!adminTok) return res.status(401).json({ error: 'admin token required' });

  const { source, query, tenant_id = null } = req.body || {};
  if (!source || !query) return res.status(400).json({ error: 'source and query required' });

  try {
    const { query: dsQuery } = await import('../../agents/_lib/datasource.mjs');
    const result = await dsQuery({ source, query, tenantId: tenant_id });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
