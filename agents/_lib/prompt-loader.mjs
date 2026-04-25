// agents/_lib/prompt-loader.mjs
// Server-side (Node/Vercel) prompt assembler. Reads loop.txt, modules.txt,
// and tools.json from disk plus shared policies + knowledge, returns an
// object ready to pass to the Anthropic API as {system, tools}.
//
// Phase 2: accepts an optional tenantId. When provided, files under
// agents/tenants/<tenantId>/ override the shared defaults per-file. Tenants
// can override individual knowledge/policy files without copying the full
// bundle — the loader merges per-file, tenant wins.
//
// Cached per-process per-tenant after first read so cold starts pay once.
// -----------------------------------------------------------------------------
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_ROOT = join(__dirname, '..');
const _cache = new Map();

function cacheKey(tenantId, relPath) {
  return `${tenantId || '_shared'}::${relPath}`;
}

// Read a file, preferring tenant override over shared default.
async function readCached(tenantId, relPath) {
  const key = cacheKey(tenantId, relPath);
  if (_cache.has(key)) return _cache.get(key);

  if (tenantId) {
    const tenantPath = join(AGENTS_ROOT, 'tenants', tenantId, relPath.replace(/^shared\//, ''));
    try {
      const content = await readFile(tenantPath, 'utf8');
      _cache.set(key, content);
      return content;
    } catch {
      // Fall through to shared default
    }
  }

  const sharedPath = join(AGENTS_ROOT, relPath);
  const content = await readFile(sharedPath, 'utf8');
  _cache.set(key, content);
  return content;
}

const POLICY_FILES = [
  'shared/policies/escalation.md',
  'shared/policies/halt-conditions.md',
  'shared/policies/non-interactive-shell.md',
];
const KNOWLEDGE_FILES = [
  'shared/knowledge/dynasty-principles.md',
  'shared/knowledge/blue-ocean-framework.md',
];

export async function loadAgent(agentPath, opts = {}) {
  const { tenantId = null } = opts;
  const [loop, modules, toolsRaw, ...rest] = await Promise.all([
    readCached(tenantId, `${agentPath}/loop.txt`),
    readCached(tenantId, `${agentPath}/modules.txt`),
    readCached(tenantId, `${agentPath}/tools.json`),
    ...POLICY_FILES.map(p => readCached(tenantId, p)),
    ...KNOWLEDGE_FILES.map(p => readCached(tenantId, p)),
  ]);
  const policies = rest.slice(0, POLICY_FILES.length);
  const knowledge = rest.slice(POLICY_FILES.length);
  const system = [
    '# POLICIES (non-negotiable)',
    ...policies,
    '# ROLE AND LOOP',
    loop,
    '# MODULES',
    modules,
    '# KNOWLEDGE',
    ...knowledge,
  ].join('\n\n---\n\n');
  const tools = JSON.parse(toolsRaw).tools;
  return { system, tools, _tenant: tenantId };
}

export function clearCache() { _cache.clear(); }
