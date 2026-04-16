// api/catalog/_automations.mjs — ESM re-export of the automation catalog
// -----------------------------------------------------------------------------
// automation-catalog.js uses module.exports (CommonJS) but package.json has
// "type": "module", so .js files are ESM and module.exports is silently a no-op.
// Node's createRequire can't fix this because the .js extension is still ESM.
//
// Solution: read and eval the file to extract the exported symbols.
// This runs once per cold start.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const selfDir = dirname(fileURLToPath(import.meta.url));

// Locate the automation catalog file
function findCatalog() {
  const candidates = [
    join(process.cwd(), 'api', 'automation-catalog.js'),
    join(selfDir, '..', 'automation-catalog.js'),
    // Vercel bundles includeFiles next to the handler sometimes:
    join(selfDir, 'automation-catalog.js'),
  ];
  for (const c of candidates) {
    try {
      return readFileSync(c, 'utf-8');
    } catch (_) { /* keep trying */ }
  }
  return null;
}

let _cache = null;

function loadCatalog() {
  if (_cache) return _cache;

  const src = findCatalog();
  if (!src) {
    console.error('[_automations.mjs] automation-catalog.js not found');
    _cache = { CATEGORIES: {}, PACKAGES: {}, ARCHETYPE_PACKAGES: {}, ALL_AUTOMATIONS: [] };
    return _cache;
  }

  // The file uses `module.exports = { ... }`. We provide a fake module object,
  // execute the file, and collect the exports.
  const mod = { exports: {} };
  const fn = new Function('module', 'exports', 'require', src);
  fn(mod, mod.exports, () => { throw new Error('require() not supported in automation-catalog wrapper'); });

  _cache = {
    CATEGORIES: mod.exports.CATEGORIES || {},
    PACKAGES: mod.exports.PACKAGES || {},
    ARCHETYPE_PACKAGES: mod.exports.ARCHETYPE_PACKAGES || {},
    ALL_AUTOMATIONS: mod.exports.ALL_AUTOMATIONS || [],
    getAutomationsForProject: mod.exports.getAutomationsForProject || (() => []),
    getAutomationsByIds: mod.exports.getAutomationsByIds || (() => []),
    getAutomationsByCategory: mod.exports.getAutomationsByCategory || (() => []),
  };

  console.log(`[_automations.mjs] Loaded ${_cache.ALL_AUTOMATIONS.length} automations, ${Object.keys(_cache.CATEGORIES).length} categories`);
  return _cache;
}

export function getCatalogData() {
  return loadCatalog();
}
