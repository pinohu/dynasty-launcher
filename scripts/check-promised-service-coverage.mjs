import { getCatalog } from '../api/catalog/_lib.mjs';
import { resolveDemoUnit, runDemoUnit } from '../api/demo/_runtime.mjs';
import { _reset as resetEventBus } from '../api/events/_bus.mjs';
import { _reset as resetTenantStore } from '../api/tenants/_store.mjs';

const failures = [];

function fail(message) {
  failures.push(message);
}

function expectRunnable(unit, { allowEmpty = false } = {}) {
  const resolved = resolveDemoUnit(unit);
  if (!allowEmpty && !resolved.module_codes.length) {
    fail(`${unit.unit_type}:${unit.unit_code} resolves zero runnable modules`);
  }
  for (const skipped of resolved.skipped || []) {
    fail(`${unit.unit_type}:${unit.unit_code} skipped ${skipped.code}: ${skipped.reason}`);
  }
  return resolved;
}

function assertRun(trace, expectedMin = 1) {
  const label = `${trace.unit_type}:${trace.unit_code}`;
  if (!trace.run_id) fail(`${label} did not return run_id`);
  if ((trace.executed_module_count || 0) < expectedMin) {
    fail(
      `${label} executed ${trace.executed_module_count || 0} modules; expected at least ${expectedMin}`,
    );
  }
  for (const run of trace.runs || []) {
    if (!run.activation?.activation?.status) fail(`${label}/${run.module_code} did not activate`);
    if (!run.dispatch || run.dispatch.dispatched < 1)
      fail(`${label}/${run.module_code} did not dispatch workflow`);
    if (!run.workflow_result?.run_id) fail(`${label}/${run.module_code} missing workflow run id`);
    if (
      !['completed', 'idempotent_ok', 'skipped_no_workflow'].includes(run.workflow_result?.status)
    ) {
      fail(
        `${label}/${run.module_code} ended with unexpected status: ${run.workflow_result?.status || '<missing>'}`,
      );
    }
    if (!Array.isArray(run.trace_steps) || run.trace_steps.length < 6)
      fail(`${label}/${run.module_code} missing visible trace steps`);
    if (!Array.isArray(run.output_preview) || !run.output_preview.length)
      fail(`${label}/${run.module_code} missing customer-visible output preview`);
  }
}

const catalog = getCatalog();
const modules = (catalog.modules || []).filter(
  (module) => module.status === 'live' || module.ready_for_use || module.marketplace_ready,
);
const bundles = (catalog.bundles || []).filter(
  (bundle) => bundle.status === 'live' || bundle.ready_for_use || bundle.marketplace_ready,
);
const blueprints = catalog.blueprints || [];
const tiers = catalog.tiers || {};

for (const module of modules)
  expectRunnable({ unit_type: 'module', unit_code: module.module_code });
for (const bundle of bundles) expectRunnable({ unit_type: 'pack', unit_code: bundle.bundle_code });
for (const blueprint of blueprints)
  expectRunnable({ unit_type: 'blueprint', unit_code: blueprint.blueprint_code });
for (const suite of tiers.suites || [])
  expectRunnable({ unit_type: 'suite', unit_code: suite.suite_code });
for (const edition of tiers.editions || [])
  expectRunnable({ unit_type: 'edition', unit_code: edition.edition_code });
for (const tier of tiers.tiers || []) {
  expectRunnable(
    { unit_type: 'plan', unit_code: tier.tier_code },
    { allowEmpty: (tier.included_modules || []).length === 0 },
  );
  if (
    (tier.included_modules || []).length === 0 &&
    !String(tier.description || '')
      .toLowerCase()
      .includes('marketplace')
  ) {
    fail(
      `plan:${tier.tier_code} has no modules and does not clearly describe marketplace/module access`,
    );
  }
}

await resetTenantStore();
resetEventBus();
for (const module of modules) {
  const trace = await runDemoUnit({ unit_type: 'module', unit_code: module.module_code, limit: 1 });
  assertRun(trace, 1);
}

await resetTenantStore();
resetEventBus();
for (const bundle of bundles) {
  const trace = await runDemoUnit({ unit_type: 'pack', unit_code: bundle.bundle_code, limit: 2 });
  assertRun(trace, 1);
}

if (failures.length) {
  console.error('Promised service coverage FAIL:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Promised service coverage PASS: ${modules.length} modules and ${bundles.length} packs resolve, activate, dispatch, trace, and preview successfully.`,
);
