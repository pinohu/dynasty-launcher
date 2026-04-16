// api/catalog/automations.js — GET /api/catalog/automations
// -----------------------------------------------------------------------------
// Serves the 354-automation catalog from api/automation-catalog.js.
//
// Query params (all optional, all AND-ed):
//   ?category=<number>     — filter by category number (1-45)
//   ?package=<name>        — filter to automations in a named package
//                             (core, sales, operations, marketing, finance,
//                              compliance, retention, field_service, enrichment,
//                              infrastructure)
//   ?archetype=<name>      — filter to automations selected for an archetype
//                             (saas, ecommerce, agency, service_business, etc.)
//   ?trigger=<type>        — webhook | cron
//   ?q=<search>            — case-insensitive substring search on name
//   ?id=<automation_id>    — return a single automation (e.g. "1.01")
//
// Response:
//   { count, total, categories, packages, archetypes, automations: [...] }
//
// Each automation in the response:
//   { id, cat, category_name, name, trigger, cron?, step_count, packages[] }
// (steps are omitted to keep payloads small; use ?id= for full detail)
// -----------------------------------------------------------------------------

import { corsPreflight, methodGuard, cacheHeaders } from './_lib.mjs';
import { getCatalogData } from './_automations.mjs';

export const maxDuration = 10;

// Lazy-init on first request (cold start)
let _CATEGORIES, _PACKAGES, _ARCHETYPE_PACKAGES, _ALL_AUTOMATIONS, _getAutomationsForProject;
let _pkgIndex = null;

function init() {
  if (_pkgIndex) return;
  const cat = getCatalogData();
  _CATEGORIES = cat.CATEGORIES;
  _PACKAGES = cat.PACKAGES;
  _ARCHETYPE_PACKAGES = cat.ARCHETYPE_PACKAGES;
  _ALL_AUTOMATIONS = cat.ALL_AUTOMATIONS;
  _getAutomationsForProject = cat.getAutomationsForProject;
  _pkgIndex = {};
  for (const [pkg, ids] of Object.entries(_PACKAGES)) {
    for (const id of ids) {
      if (!_pkgIndex[id]) _pkgIndex[id] = [];
      _pkgIndex[id].push(pkg);
    }
  }
}

function summarize(a) {
  return {
    id: a.id,
    cat: a.cat,
    category_name: _CATEGORIES[a.cat] || `Category ${a.cat}`,
    name: a.name,
    trigger: a.trigger,
    cron: a.cron || null,
    step_count: (a.steps || []).length,
    packages: _pkgIndex[a.id] || [],
  };
}

function fullDetail(a) {
  return {
    ...summarize(a),
    steps: a.steps,
  };
}

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res)) return;
  init();

  const q = req.query || {};

  // Single automation lookup
  if (q.id) {
    const found = _ALL_AUTOMATIONS.find((a) => a.id === q.id);
    if (!found) return res.status(404).json({ error: `automation '${q.id}' not found` });
    cacheHeaders(res);
    return res.json({ automation: fullDetail(found) });
  }

  let result = _ALL_AUTOMATIONS;

  if (q.category) {
    const catNum = parseInt(q.category, 10);
    if (catNum >= 1 && catNum <= 45) {
      result = result.filter((a) => a.cat === catNum);
    }
  }

  if (q.package && _PACKAGES[q.package]) {
    const idSet = new Set(_PACKAGES[q.package]);
    result = result.filter((a) => idSet.has(a.id));
  }

  if (q.archetype) {
    const selected = _getAutomationsForProject(q.archetype);
    const idSet = new Set(selected.map((a) => a.id));
    result = result.filter((a) => idSet.has(a.id));
  }

  if (q.trigger) {
    result = result.filter((a) => a.trigger === q.trigger);
  }

  if (q.q) {
    const needle = q.q.toLowerCase();
    result = result.filter((a) => a.name.toLowerCase().includes(needle));
  }

  cacheHeaders(res);
  return res.json({
    count: result.length,
    total: _ALL_AUTOMATIONS.length,
    categories: _CATEGORIES,
    packages: Object.keys(_PACKAGES),
    archetypes: Object.keys(_ARCHETYPE_PACKAGES),
    automations: result.map(summarize),
  });
}
