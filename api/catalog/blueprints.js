// api/catalog/blueprints.js — GET /api/catalog/blueprints
// -----------------------------------------------------------------------------
// Serves vertical blueprints from product/blueprints/*.json.
//
// Query params:
//   ?code=<blueprint> — return a single blueprint (or 404)
//   ?vertical=<value> — filter by the `vertical` field
//
// Response: { count, total, blueprints: [...] }
// -----------------------------------------------------------------------------

import { getCatalog, corsPreflight, methodGuard, cacheHeaders } from './_lib.mjs';

export const maxDuration = 10;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res)) return;

  const { blueprints } = getCatalog();
  const q = req.query || {};

  if (q.code) {
    const found = blueprints.find((b) => b.blueprint_code === q.code);
    if (!found) return res.status(404).json({ error: `blueprint '${q.code}' not found` });
    cacheHeaders(res);
    return res.json({ blueprint: found });
  }

  let result = blueprints;
  if (q.vertical) result = result.filter((b) => b.vertical === q.vertical);

  cacheHeaders(res);
  return res.json({
    count: result.length,
    total: blueprints.length,
    blueprints: result,
  });
}
