// api/catalog/bundles.js — GET /api/catalog/bundles
// -----------------------------------------------------------------------------
// Serves packs (bundles) from product/bundles/*.json with inherited status
// per AUTOMATION_DEPLOYABILITY_STANDARD.md (§ How bundles, suites, and
// editions interact): a bundle's effective status is the strictest of its
// constituent modules.
//
// Each returned bundle includes an `effective_status` field the UI can use
// to decide whether to show it. Query ?marketplace=true filters to only
// deployable/live bundles.
//
// Query params:
//   ?marketplace=true — only effective_status in [deployable, live]
//   ?code=<bundle>    — return a single bundle (or 404)
//   ?blueprint=<code> — bundles recommended_for_blueprints contains this
//   ?persona=<code>   — bundles recommended_for_personas contains this
//
// Response: { count, total, bundles: [...] }
// -----------------------------------------------------------------------------

import { getCatalog, corsPreflight, methodGuard, cacheHeaders, indexModules, effectiveBundleStatus } from './_lib.mjs';

export const maxDuration = 10;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res)) return;

  const { bundles, modules, bundle_pricing } = getCatalog();
  const byCode = indexModules(modules);

  // Decorate bundles with effective_status + pricing cross-ref
  const pricingRows = (bundle_pricing && bundle_pricing.packs) || [];
  const pricingByCode = {};
  for (const p of pricingRows) pricingByCode[p.bundle_code] = p;

  const decorated = bundles.map((b) => ({
    ...b,
    effective_status: effectiveBundleStatus(b, byCode),
    pricing_detail: pricingByCode[b.bundle_code] || null,
  }));

  const q = req.query || {};

  if (q.code) {
    const found = decorated.find((b) => b.bundle_code === q.code);
    if (!found) return res.status(404).json({ error: `bundle '${q.code}' not found` });
    cacheHeaders(res);
    return res.json({ bundle: found });
  }

  let result = decorated;

  if (q.marketplace === 'true' || q.marketplace === '1') {
    result = result.filter((b) => b.effective_status === 'live' || b.effective_status === 'deployable');
  }
  if (q.blueprint) result = result.filter((b) => (b.recommended_for_blueprints || []).includes(q.blueprint));
  if (q.persona) result = result.filter((b) => (b.recommended_for_personas || []).includes(q.persona));

  cacheHeaders(res);
  return res.json({
    count: result.length,
    total: bundles.length,
    bundles: result,
    deferred: (bundle_pricing && bundle_pricing.not_launching_yet) || [],
  });
}
