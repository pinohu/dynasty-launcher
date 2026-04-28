import fs from 'node:fs';
import path from 'node:path';
import { getCatalog } from '../api/catalog/_lib.mjs';
import { resolveDemoUnit, runDemoUnit } from '../api/demo/_runtime.mjs';
import { _reset as resetTenantStore } from '../api/tenants/_store.mjs';
import { _reset as resetEventBus } from '../api/events/_bus.mjs';

const root = process.cwd();
const publicDir = path.join(root, 'public');
const demoDir = path.join(root, 'product', 'demo');

function fail(message) {
  console.error(`Demo coverage FAIL: ${message}`);
  process.exit(1);
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function mustExist(file, label) {
  if (!fs.existsSync(file)) fail(`${label} missing: ${path.relative(root, file)}`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function invoke(handlerModule, { method = 'POST', body = null, headers = {}, query = {} } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      _status: 200,
      _body: null,
      _headers: {},
      status(s) {
        this._status = s;
        return this;
      },
      setHeader(k, v) {
        this._headers[String(k).toLowerCase()] = v;
      },
      json(b) {
        this._body = b;
        resolve({ status: this._status, body: b, headers: this._headers });
        return this;
      },
      end() {
        resolve({ status: this._status, body: null, headers: this._headers });
        return this;
      },
    };
    Promise.resolve(handlerModule.default({ method, body, headers, query }, res)).catch(reject);
  });
}

function checkManifest({ kind, code, route, moduleCodes }) {
  const folder = kind === 'category' ? 'categories' : `${kind}s`;
  const manifestFile = path.join(demoDir, folder, `${slug(code)}.json`);
  const pageFile = path.join(publicDir, `${route.replace(/^\/+/, '')}.html`);
  mustExist(manifestFile, `${kind} demo manifest`);
  mustExist(pageFile, `${kind} demo page`);
  const manifest = readJson(manifestFile);
  if (manifest.unit_type !== kind) fail(`${kind}:${code} manifest unit_type mismatch`);
  if (manifest.unit_code !== code) fail(`${kind}:${code} manifest unit_code mismatch`);
  if (manifest.route !== route) fail(`${kind}:${code} manifest route mismatch`);
  if (!Array.isArray(manifest.module_codes)) fail(`${kind}:${code} missing module_codes`);
  if (moduleCodes.length && manifest.module_codes.length === 0) fail(`${kind}:${code} has no runnable module codes`);
  if (!manifest.expected_outputs?.includes('visible_execution_trace')) fail(`${kind}:${code} missing visible trace expectation`);
  if (!manifest.api?.run) fail(`${kind}:${code} missing demo run API contract`);
  const html = fs.readFileSync(pageFile, 'utf8');
  for (const needle of ['Run working demo', '/api/demo/run-module', 'Execution trace']) {
    if (!html.includes(needle)) fail(`${kind}:${code} page missing ${needle}`);
  }
}

const catalog = getCatalog();
const modules = catalog.modules || [];
const bundles = catalog.bundles || [];
const blueprints = catalog.blueprints || [];
const tiers = catalog.tiers || {};
const bundlesByCode = new Map(bundles.map((b) => [b.bundle_code, b]));

let checked = 0;
for (const module of modules.filter((m) => m.status === 'live' || m.marketplace_ready || m.ready_for_use)) {
  checkManifest({ kind: 'module', code: module.module_code, route: `/demo/modules/${slug(module.module_code)}`, moduleCodes: [module.module_code] });
  checked++;
}

for (const category of [...new Set(modules.map((m) => m.category || 'uncategorized'))]) {
  const code = slug(category);
  const moduleCodes = modules.filter((m) => (m.category || 'uncategorized') === category).map((m) => m.module_code);
  checkManifest({ kind: 'category', code, route: `/demo/categories/${code}`, moduleCodes });
  checked++;
}

for (const bundle of bundles.filter((b) => b.status === 'live' || b.marketplace_ready || b.ready_for_use)) {
  checkManifest({ kind: 'pack', code: bundle.bundle_code, route: `/demo/packs/${slug(bundle.bundle_code)}`, moduleCodes: bundle.modules || [] });
  checked++;
}

for (const blueprint of blueprints) {
  const moduleCodes = [...new Set([...(blueprint.recommended_modules || []), ...(blueprint.recommended_bundles || []).flatMap((code) => bundlesByCode.get(code)?.modules || [])])];
  checkManifest({ kind: 'blueprint', code: blueprint.blueprint_code, route: `/demo/blueprints/${slug(blueprint.blueprint_code)}`, moduleCodes });
  checked++;
}

for (const suite of tiers.suites || []) {
  const moduleCodes = [...new Set([...(suite.packs || []).flatMap((code) => bundlesByCode.get(code)?.modules || []), ...(suite.extras || [])])];
  checkManifest({ kind: 'suite', code: suite.suite_code, route: `/demo/suites/${slug(suite.suite_code)}`, moduleCodes });
  checked++;
}

for (const edition of tiers.editions || []) {
  checkManifest({ kind: 'edition', code: edition.edition_code, route: `/demo/editions/${slug(edition.edition_code)}`, moduleCodes: ['resolved_by_runtime'] });
  checked++;
}

for (const tier of tiers.tiers || []) {
  checkManifest({ kind: 'plan', code: tier.tier_code, route: `/demo/plans/${slug(tier.tier_code)}`, moduleCodes: tier.included_modules || [] });
  checked++;
}

mustExist(path.join(publicDir, 'demo', 'index.html'), 'demo directory page');

const representative = [
  { unit_type: 'module', unit_code: 'webform_autoreply' },
  { unit_type: 'pack', unit_code: 'lead_capture_pack' },
  { unit_type: 'category', unit_code: 'lead-capture' },
  { unit_type: 'blueprint', unit_code: 'hvac' },
  { unit_type: 'suite', unit_code: 'growth_suite' },
  { unit_type: 'edition', unit_code: 'field_service' },
];

for (const unit of representative) {
  const resolved = resolveDemoUnit(unit);
  if (!resolved.module_codes.length) fail(`${unit.unit_type}:${unit.unit_code} resolved zero modules`);
}

try {
  await runDemoUnit({ unit_type: '../../private', unit_code: 'webform_autoreply' });
  fail('invalid demo unit_type was accepted');
} catch (err) {
  if (!String(err.message || err).includes('unit_type invalid')) fail('invalid demo unit_type returned the wrong error');
}

await resetTenantStore();
resetEventBus();
for (const unit of representative) {
  const trace = await runDemoUnit({ ...unit, limit: 3 });
  if (!trace.run_id) fail(`${unit.unit_type}:${unit.unit_code} did not return a run_id`);
  if (!trace.executed_module_count) fail(`${unit.unit_type}:${unit.unit_code} executed zero modules`);
  if (!trace.runs.every((run) => run.trace_steps?.length && run.output_preview?.length)) {
    fail(`${unit.unit_type}:${unit.unit_code} missing visible trace or output previews`);
  }
  if (!trace.runs.some((run) => run.workflow_result?.status === 'completed' || run.workflow_result?.status === 'idempotent_ok')) {
    fail(`${unit.unit_type}:${unit.unit_code} did not complete any workflow`);
  }
}

const createSessionHandler = await import('../api/demo/create-session.js');
const runModuleHandler = await import('../api/demo/run-module.js');
{
  const r = await invoke(createSessionHandler, {
    body: { unit_type: 'module', unit_code: 'x'.repeat(101) },
  });
  if (r.status !== 400 || !String(r.body?.details || '').includes('unit_code too long')) {
    fail('demo create-session did not reject oversized unit_code');
  }
}
{
  const r = await invoke(runModuleHandler, {
    body: {
      unit_type: 'module',
      unit_code: 'webform_autoreply',
      payload: { blob: 'x'.repeat(60_000) },
    },
  });
  if (r.status !== 413 || r.body?.error !== 'payload_too_large') {
    fail('demo run-module did not cap request body size');
  }
}
for (let i = 0; i < 30; i += 1) {
  const r = await invoke(runModuleHandler, {
    headers: { 'x-forwarded-for': '198.51.100.77' },
    body: { unit_type: 'module' },
  });
  if (r.status === 429) fail('demo run-module rate limit fired too early');
}
{
  const r = await invoke(runModuleHandler, {
    headers: { 'x-forwarded-for': '198.51.100.77' },
    body: { unit_type: 'module' },
  });
  if (r.status !== 429 || r.headers['retry-after'] !== '600') {
    fail('demo run-module did not throttle repeated public attempts');
  }
}

console.log(`Demo coverage PASS: ${checked} demo units covered and representative runtime demos passed.`);

