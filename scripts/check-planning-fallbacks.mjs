import fs from 'node:fs';

const files = ['app.html', 'public/app.html'];
const failures = [];

const required = [
  ['timeout helper', 'function withTimeout(promise, ms, label)'],
  ['json object extractor', 'function extractFirstJsonObject(text)'],
  ['fallback blueprint builder', 'function buildFallbackArchitectureBlueprint(inf, desc)'],
  ['fallback design builder', 'function buildFallbackDesignContract(inf, planning)'],
  ['fallback planner', 'function buildFallbackExecutionPlan(inf, planning)'],
  ['planning repair telemetry', 'function recordPlanningRepair(phase, reason)'],
  ['preseeded blueprint contract', 'blueprint: buildFallbackArchitectureBlueprint(inf, desc)'],
  ['preseeded design contract', 'PLANNING_OUTPUT.design_contract = buildFallbackDesignContract(inf, PLANNING_OUTPUT);'],
  ['blueprint deterministic first render', 'Deterministic blueprint ready:'],
  ['design deterministic first render', 'Deterministic design ready:'],
  ['planning error normalization', "if ((num === 1 || num === 2) && status === 'error')"],
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

  const forbidden = [
    [/\bupdatePlanPhase\(\s*1\s*,\s*['"]error['"]/g, 'blueprint phase must not render an error state'],
    [/\bupdatePlanPhase\(\s*2\s*,\s*['"]error['"]/g, 'design phase must not render an error state'],
    [/will build without it/g, 'planner fallback must not say the build will continue without the contract'],
    [/continuing with fallback/g, 'planner timeout text must not expose fallback as a failure'],
    [/Blueprint generation failed/g, 'old blueprint failure copy must not ship'],
    [/Design contract timed out after 45s/g, 'old design timeout failure copy must not ship'],
  ];
  for (const [pattern, message] of forbidden) {
    if (pattern.test(html)) failures.push(`${file}: ${message}`);
  }
}

if (failures.length) {
  console.error('check-planning-fallbacks: failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`check-planning-fallbacks: ok (${files.length} app files)`);
