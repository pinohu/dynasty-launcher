// scripts/smoke-phase5b.mjs
// Phase 5b smoke: routeMod() feature-flagged dispatch.
// Verifies (a) flag off → legacy fn called with full signature,
// (b) flag on → loud stub returned, legacy fn NOT called, shape matches
// what normalizeModuleResult downstream expects.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const provisionPath = resolve(ROOT, 'api/provision.js');

const fail = [];
const pass = [];
function check(name, cond, detail = '') {
  if (cond) pass.push(`PASS ${name}${detail ? ' — ' + detail : ''}`);
  else fail.push(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
}

check('api/provision.js exists', existsSync(provisionPath));

// Static shape checks — the helper must be reachable from the public
// export surface so downstream tests (and the planner) can reason about it.
const src = readFileSync(provisionPath, 'utf8');
check('routeMod is exported', /export function routeMod\s*\(/.test(src));
check('routeMod reads USE_MODULAR_AGENTS at call time',
  /process\.env\.USE_MODULAR_AGENTS !== 'true'/.test(src));
check('routeMod stub names modular path',
  /routed:\s*'modular'/.test(src));
check('routeMod stub references the plan doc',
  /PHASE_5_WIRING_PLAN\.md/.test(src));
check('runModules dispatches through routeMod',
  /routeMod\(name, fn, config, project, liveUrl\)/.test(src));
check('legacy direct fn() call is gone',
  !/\bfn\(config, project, liveUrl\)\b\s*,\s*\n\s*new Promise\(\(_, reject\)/.test(src));

// Dynamic behavior — import the module and exercise both flag states.
const originalFlag = process.env.USE_MODULAR_AGENTS;

try {
  process.env.USE_MODULAR_AGENTS = 'false';
  const mod = await import(`${provisionPath}?flag=off&t=${Date.now()}`);
  let called = 0;
  const fakeFn = async (cfg, proj, url) => {
    called++;
    return { ok: true, service: 'fake', details: { cfg: !!cfg, proj: proj?.slug, url } };
  };
  const r = await mod.routeMod('fake', fakeFn, {}, { slug: 'test' }, 'https://test.example');
  check('flag=off → legacy fn invoked exactly once', called === 1, `called=${called}`);
  check('flag=off → legacy fn return value passed through', r?.ok === true && r.service === 'fake');
  check('flag=off → legacy fn received full (config, project, liveUrl)', r?.details?.proj === 'test' && r?.details?.url === 'https://test.example');
} catch (e) {
  fail.push(`FAIL flag=off dynamic check — ${e.message}`);
}

try {
  process.env.USE_MODULAR_AGENTS = 'true';
  const mod = await import(`${provisionPath}?flag=on&t=${Date.now()}`);
  let called = 0;
  const fakeFn = async () => { called++; return { ok: true }; };
  const r = await mod.routeMod('fake', fakeFn, {}, { slug: 'test' }, 'https://test.example');
  check('flag=on → legacy fn NOT invoked', called === 0, `called=${called}`);
  check('flag=on → stub returns ok=false', r?.ok === false);
  check('flag=on → stub includes routed=modular', r?.details?.routed === 'modular');
  check('flag=on → stub includes fallback text', typeof r?.fallback === 'string' && r.fallback.length > 20);
  check('flag=on → service name echoed', r?.service === 'fake');
} catch (e) {
  fail.push(`FAIL flag=on dynamic check — ${e.message}`);
} finally {
  if (originalFlag === undefined) delete process.env.USE_MODULAR_AGENTS;
  else process.env.USE_MODULAR_AGENTS = originalFlag;
}

for (const line of pass) console.log(line);
for (const line of fail) console.error(line);
if (fail.length) {
  console.error(`\n${fail.length} Phase 5b check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${pass.length} Phase 5b checks passed.`);
