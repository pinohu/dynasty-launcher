// agents/_lib/prompt-loader-browser.mjs
// Browser equivalent of prompt-loader.mjs. Uses fetch() against the static
// /agents/* paths Vercel serves. Same cache semantics.
const _cache = new Map();

async function fetchCached(relPath) {
  if (_cache.has(relPath)) return _cache.get(relPath);
  const res = await fetch(`/agents/${relPath}`);
  if (!res.ok) throw new Error(`Failed to load ${relPath}: ${res.status}`);
  const text = await res.text();
  _cache.set(relPath, text);
  return text;
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

export async function loadAgent(agentPath) {
  const [loop, modules, toolsRaw, ...rest] = await Promise.all([
    fetchCached(`${agentPath}/loop.txt`),
    fetchCached(`${agentPath}/modules.txt`),
    fetchCached(`${agentPath}/tools.json`),
    ...POLICY_FILES.map(fetchCached),
    ...KNOWLEDGE_FILES.map(fetchCached),
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
  return { system, tools };
}

export function clearCache() { _cache.clear(); }
