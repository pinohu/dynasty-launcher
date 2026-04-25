// scripts/smoke-agents.mjs
// Verifies every agent directory has the required triple and loads cleanly.
import { loadAgent } from '../agents/_lib/prompt-loader.mjs';

const AGENTS = [
  'orchestrator',
  'subagents/provisioner',
  'subagents/code-generator',
  'subagents/integrator',
  'subagents/deployer',
  'subagents/auditor',
];

let failed = 0;
for (const path of AGENTS) {
  try {
    const { system, tools } = await loadAgent(path);
    if (!system || system.length < 500) throw new Error('system prompt too short');
    if (!Array.isArray(tools) || tools.length === 0) throw new Error('no tools');
    console.log(`PASS ${path}  (system=${system.length}B, tools=${tools.length})`);
  } catch (err) {
    console.error(`FAIL ${path}  ${err.message}`);
    failed++;
  }
}
if (failed > 0) { console.error(`\n${failed} agent(s) failed to load.`); process.exit(1); }
console.log(`\nAll ${AGENTS.length} agents loaded.`);
