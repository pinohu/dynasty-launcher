// scripts/smoke-phase5.mjs
// Phase 5a smoke: the 4 new integrator wire tools exist with required shapes
// and verification language. Does not hit any vendor API.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const toolsPath = resolve(ROOT, 'agents/subagents/integrator/tools.json');
const loopPath = resolve(ROOT, 'agents/subagents/integrator/loop.txt');
const planPath = resolve(ROOT, 'docs/PHASE_5_WIRING_PLAN.md');

const fail = [];
const pass = [];
function check(name, cond, detail = '') {
  if (cond) pass.push(`PASS ${name}${detail ? ' — ' + detail : ''}`);
  else fail.push(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
}

check('tools.json exists', existsSync(toolsPath));
check('loop.txt exists', existsSync(loopPath));
check('PHASE_5_WIRING_PLAN.md exists', existsSync(planPath));

const tools = JSON.parse(readFileSync(toolsPath, 'utf8'));
const byName = Object.fromEntries(tools.tools.map(t => [t.name, t]));

const REQUIRED = ['mod_seo_wire', 'mod_analytics_wire', 'mod_leads_wire', 'mod_social_wire'];
for (const name of REQUIRED) {
  const t = byName[name];
  check(`${name} present`, !!t);
  if (!t) continue;
  check(`${name} has description`, typeof t.description === 'string' && t.description.length > 40);
  check(`${name} requires run_id`, Array.isArray(t.input_schema?.required) && t.input_schema.required.includes('run_id'));
}

// Tool-specific policy assertions — the description must embed the
// verification rule (mirrors how Phase 4 encoded shell-wrapper refusal
// and sanitizer three-tier behavior inline).
check('mod_seo_wire warns about repo commit',
  /push.+repo|commit/i.test(byName.mod_seo_wire?.description || ''));
check('mod_analytics_wire names Plerdy manual-setup constraint',
  /plerdy/i.test(byName.mod_analytics_wire?.description || '') &&
  /manual|setup/i.test(byName.mod_analytics_wire?.description || ''));
check('mod_leads_wire warns 200-without-snippet is not progress',
  /not progress|tracking_code|tracking code/i.test(byName.mod_leads_wire?.description || ''));
check('mod_social_wire stays unverified until human import',
  /unverified|human/i.test(byName.mod_social_wire?.description || ''));

// loop.txt should enumerate the new steps + module enum.
const loop = readFileSync(loopPath, 'utf8');
check('loop.txt lists mod_seo_wire in tasks', /SEO.*mod_seo_wire/i.test(loop));
check('loop.txt lists mod_analytics in submit enum', /mod_analytics/.test(loop));
check('loop.txt lists mod_leads in submit enum', /mod_leads/.test(loop));
check('loop.txt lists mod_social in submit enum', /mod_social/.test(loop));

// tool count should be 15 (was 11).
check('integrator tool count is 15', tools.tools.length === 15, `got ${tools.tools.length}`);

for (const line of pass) console.log(line);
for (const line of fail) console.error(line);
if (fail.length) {
  console.error(`\n${fail.length} Phase 5 check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${pass.length} Phase 5 checks passed.`);
