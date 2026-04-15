// api/catalog/_lib.mjs — shared catalog loader for the read-only product registry
// -----------------------------------------------------------------------------
// Reads product/*.json from the repo into memory once per lambda cold start.
// Every api/catalog/* endpoint uses getCatalog() to serve its responses.
//
// Vercel requires `includeFiles: "product/**/*.json"` on each function that
// imports this module (see vercel.json). Without that, the product/ tree is
// not bundled into the lambda and every endpoint returns empty arrays.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// -----------------------------------------------------------------------------
// Locate product/
// -----------------------------------------------------------------------------
// Vercel's bundler places includedFiles next to the lambda code. We try a few
// paths so this works in local dev, Vercel prod, and under CI.

function resolveProductRoot() {
  const selfDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), 'product'),
    join(selfDir, '..', '..', 'product'),
    join(selfDir, '..', 'product'),
    // Vercel sometimes flattens includedFiles next to the handler:
    join(selfDir, 'product'),
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c) && statSync(c).isDirectory()) return c;
    } catch (_) { /* keep trying */ }
  }
  return null;
}

const PRODUCT_ROOT = resolveProductRoot();

// -----------------------------------------------------------------------------
// JSON loaders
// -----------------------------------------------------------------------------

function loadJsonDir(subdir, { recursive = false } = {}) {
  if (!PRODUCT_ROOT) return [];
  const full = join(PRODUCT_ROOT, subdir);
  if (!existsSync(full)) return [];
  const results = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (recursive) walk(p);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        results.push(JSON.parse(readFileSync(p, 'utf-8')));
      } catch (e) {
        console.error(`[catalog] parse failed: ${p}: ${e.message}`);
      }
    }
  };
  walk(full);
  return results;
}

function loadJsonFile(relPath) {
  if (!PRODUCT_ROOT) return null;
  const full = join(PRODUCT_ROOT, relPath);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(readFileSync(full, 'utf-8'));
  } catch (e) {
    console.error(`[catalog] parse failed: ${full}: ${e.message}`);
    return null;
  }
}

// -----------------------------------------------------------------------------
// Catalog cache — loaded once per cold start
// -----------------------------------------------------------------------------

let _cache = null;

export function getCatalog() {
  if (_cache) return _cache;
  _cache = {
    modules: loadJsonDir('modules', { recursive: true }),
    bundles: loadJsonDir('bundles'),
    blueprints: loadJsonDir('blueprints'),
    personas: loadJsonDir('personas'),
    capabilities: loadJsonDir('capabilities'),
    recommendations: loadJsonDir('recommendations'),
    journeys: loadJsonDir('journeys'),
    tiers: loadJsonFile('pricing/tiers.json'),
    bundle_pricing: loadJsonFile('pricing/bundle-pricing.json'),
    module_pricing: loadJsonFile('pricing/module-pricing.json'),
    _meta: {
      product_root: PRODUCT_ROOT,
      loaded_at: new Date().toISOString(),
    },
  };
  return _cache;
}

// Exposed for smoke tests; never called in prod.
export function _resetCatalog() {
  _cache = null;
}

// -----------------------------------------------------------------------------
// HTTP helpers
// -----------------------------------------------------------------------------

export function corsPreflight(req, res) {
  const origin = process.env.CORS_ORIGIN || 'https://yourdeputy.com';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function methodGuard(req, res, allowed = ['GET']) {
  if (!allowed.includes(req.method)) {
    res.status(405).json({ error: `${allowed.join(', ')} only` });
    return false;
  }
  return true;
}

export function cacheHeaders(res, { ttl = 300, swr = 600 } = {}) {
  res.setHeader('Cache-Control', `public, max-age=${ttl}, stale-while-revalidate=${swr}`);
}

// -----------------------------------------------------------------------------
// Status-based filtering per AUTOMATION_DEPLOYABILITY_STANDARD.md
// -----------------------------------------------------------------------------

// Only deployable or live items are marketplace-eligible.
export function isMarketplaceEligible(item) {
  return item && (item.status === 'live' || item.status === 'deployable');
}

// For bundles/suites/editions: inherit the strictest member status.
// Given a bundle's module_codes and a module index, return the effective status.
export function effectiveBundleStatus(bundle, modulesByCode) {
  const statuses = (bundle.modules || [])
    .map((code) => modulesByCode[code]?.status)
    .filter(Boolean);
  if (statuses.length === 0) return bundle.status || 'spec';
  if (statuses.some((s) => s === 'draft' || s === 'spec')) return 'spec';
  if (statuses.some((s) => s === 'implemented')) return 'implemented';
  if (statuses.some((s) => s === 'validated')) return 'validated';
  if (statuses.some((s) => s === 'deployable')) return 'deployable';
  if (statuses.every((s) => s === 'live')) return 'live';
  return bundle.status || 'spec';
}

// Utility: index modules by module_code for O(1) lookup.
export function indexModules(modules) {
  const idx = {};
  for (const m of modules) {
    if (m && m.module_code) idx[m.module_code] = m;
  }
  return idx;
}
