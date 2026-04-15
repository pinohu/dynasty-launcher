// api/catalog/tiers.js — GET /api/catalog/tiers
// -----------------------------------------------------------------------------
// Serves the pricing ladder from product/pricing/tiers.json — the locked Core
// tier, editions, suites, pricing rules, commercial essentials, concierge
// setup, and launcher-build handoff mapping.
//
// This endpoint is the single source of truth for the UI's pricing page and
// the billing layer's subscription-item wiring. Commercial Ops owns the JSON;
// this endpoint is a straight read-through.
//
// Query params (all optional):
//   ?view=tiers      — just the base tier(s)
//   ?view=editions   — just the editions array
//   ?view=suites     — just the suites array
//   ?view=commercial — just commercial_essentials + concierge_setup + handoff
//   (no view)        — return the entire tiers document
//
// Response: the requested slice, or the whole document.
// -----------------------------------------------------------------------------

import { getCatalog, corsPreflight, methodGuard, cacheHeaders } from './_lib.mjs';

export const maxDuration = 10;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res)) return;

  const { tiers } = getCatalog();
  if (!tiers) {
    return res.status(500).json({ error: 'tiers.json not available' });
  }

  const view = (req.query && req.query.view) || null;
  cacheHeaders(res);

  switch (view) {
    case 'tiers':
      return res.json({ tiers: tiers.tiers || [] });
    case 'editions':
      return res.json({ editions: tiers.editions || [] });
    case 'suites':
      return res.json({ suites: tiers.suites || [] });
    case 'commercial':
      return res.json({
        commercial_essentials: tiers.commercial_essentials || {},
        concierge_setup: tiers.concierge_setup || {},
        launcher_build_handoff: tiers.launcher_build_handoff || {},
        commercial_decisions_resolved: tiers.commercial_decisions_resolved || null,
      });
    default:
      return res.json(tiers);
  }
}
