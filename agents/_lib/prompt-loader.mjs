// agents/_lib/prompt-loader.mjs
// Server-side (Node/Vercel) prompt assembler. Reads loop.txt, modules.txt,
// and tools.json from disk plus shared policies + knowledge, returns an
// object ready to pass to the Anthropic API as {system, tools}.
// Cached per-process after first read so cold starts pay once.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_ROOT = join(__dirname, '..');
const _cache = new Map();

async function readCached(relPath) {
  if (_cache.has(relPath)) return _cache.get(relPath);
  const content = await readFile(join(AGENTS_ROOT, relPath), 'utf8');
  _cache.set(relPath, content);
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

export async function loadAgent(agentPath) {
  const [loop, modules, toolsRaw, ...rest] = await Promise.all([
    readCached(`${agentPath}/loop.txt`),
    readCached(`${agentPath}/modules.txt`),
    readCached(`${agentPath}/tools.json`),
    ...POLICY_FILES.map(readCached),
    ...KNOWLEDGE_FILES.map(readCached),
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
