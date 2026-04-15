// api/catalog/personas.js — GET /api/catalog/personas
// -----------------------------------------------------------------------------
// Serves normalized persona records from product/personas/*.json.
//
// Query params:
//   ?code=<persona_code> — return a single persona (or 404)
//
// Response: { count, personas: [...] }
// -----------------------------------------------------------------------------

import { getCatalog, corsPreflight, methodGuard, cacheHeaders } from './_lib.mjs';

export const maxDuration = 10;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res)) return;

  const { personas } = getCatalog();
  const q = req.query || {};

  if (q.code) {
    const found = personas.find((p) => p.persona_code === q.code);
    if (!found) return res.status(404).json({ error: `persona '${q.code}' not found` });
    cacheHeaders(res);
    return res.json({ persona: found });
  }

  cacheHeaders(res);
  return res.json({
    count: personas.length,
    personas,
  });
}
