import fs from 'node:fs';

const files = ['app.html', 'public/app.html'];
const failures = [];

const required = [
  ['timeout helper', 'function withTimeout(promise, ms, label)'],
  ['json object extractor', 'function extractFirstJsonObject(text)'],
  ['fallback blueprint builder', 'function buildFallbackArchitectureBlueprint(inf, desc)'],
  ['fallback design builder', 'function buildFallbackDesignContract(inf, planning)'],
  ['fallback planner', 'function buildFallbackExecutionPlan(inf, planning)'],
  ['blueprint timeout', 'const bp = await withTimeout(aiRawWithModel('],
  ['design timeout', 'const dc = await withTimeout(aiRawWithModel('],
  ['build plan timeout', 'const plan = await withTimeout(aiRawWithModel('],
  ['build plan timeout duration', "), 30000, 'Build execution plan');"],
  ['blueprint fallback catch', 'Blueprint failed; deterministic fallback blueprint used:'],
  ['design fallback catch', 'Design contract failed; deterministic fallback design used:'],
  ['blueprint missing-json fallback', 'Blueprint response had no JSON object; deterministic fallback blueprint used.'],
  ['design missing-json fallback', 'Design contract response had no JSON object; deterministic fallback design used.'],
  ['blueprint fallback preview render', 'renderBlueprintPreview(PLANNING_OUTPUT.blueprint);'],
  ['design fallback preview render', 'renderDesignPreview(PLANNING_OUTPUT.design_contract);'],
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
