import fs from 'node:fs';

const files = ['app.html', 'public/app.html'];
const failures = [];

const required = [
  ['timeout helper', 'function withTimeout(promise, ms, label)'],
  ['fallback planner', 'function buildFallbackExecutionPlan(inf, planning)'],
  ['blueprint timeout', 'const bp = await withTimeout(aiRawWithModel('],
  ['design timeout', 'const dc = await withTimeout(aiRawWithModel('],
  ['build plan timeout', 'const plan = await withTimeout(aiRawWithModel('],
  ['build plan timeout duration', "), 30000, 'Build execution plan');"],
  ['fallback plan catch', 'Build plan failed; deterministic fallback plan used:'],
  ['fallback preview render', 'renderBuildPlanPreview(PLANNING_OUTPUT.build_plan);'],
];

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  for (const [label, snippet] of required) {
    if (!html.includes(snippet)) failures.push(`${file}: missing ${label}`);
  }
}

if (failures.length) {
  console.error('check-planning-fallbacks: failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`check-planning-fallbacks: ok (${files.length} app files)`);
