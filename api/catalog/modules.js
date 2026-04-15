// api/catalog/modules.js — GET /api/catalog/modules
// -----------------------------------------------------------------------------
// Serves the read-only module catalog from product/modules/*.json.
//
// Query params (all optional, all AND-ed together):
//   ?marketplace=true    — only return status in [deployable, live]
//   ?status=<value>      — exact match on module.status
//   ?category=<value>    — exact match on module.category
//   ?activation_type=<v> — instant | guided (assisted is never surfaced)
//   ?tier=<value>        — only modules whose tier_availability contains this value
//   ?blueprint=<code>    — only modules recommended_for_blueprints contains this
//   ?persona=<code>      — only modules recommended_for_personas contains this
//   ?code=<module_code>  — return a single module (or 404)
//
// Response:
//   { count, total, modules: [...] }
// -----------------------------------------------------------------------------

import { getCatalog, corsPreflight, methodGuard, cacheHeaders, isMarketplaceEligible } from './_lib.mjs';

export const maxDuration = 10;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res)) return;

  const { modules } = getCatalog();
  const q = req.query || {};

  if (q.code) {
    const found = modules.find((m) => m.module_code === q.code);
    if (!found) return res.status(404).json({ error: `module '${q.code}' not found` });
    cacheHeaders(res);
    return res.json({ module: found });
  }

  let result = modules;

  if (q.marketplace === 'true' || q.marketplace === '1') {
    result = result.filter(isMarketplaceEligible);
  }
  if (q.status) result = result.filter((m) => m.status === q.status);
  if (q.category) result = result.filter((m) => m.category === q.category);
  if (q.activation_type) {
    // Per deployability standard: assisted is never served publicly.
    if (q.activation_type === 'assisted') {
      return res.status(400).json({ error: 'activation_type=assisted is not publicly surfaced' });
    }
    result = result.filter((m) => m.activation_type === q.activation_type);
  }
  if (q.tier) {
    result = result.filter((m) => {
      const tiers = m.tier_availability;
      return !tiers || tiers.length === 0 || tiers.includes(q.tier);
    });
  }
  if (q.blueprint) result = result.filter((m) => (m.recommended_for_blueprints || []).includes(q.blueprint));
  if (q.persona) result = result.filter((m) => (m.recommended_for_personas || []).includes(q.persona));

  cacheHeaders(res);
  return res.json({
    count: result.length,
    total: modules.length,
    modules: result,
  });
}
