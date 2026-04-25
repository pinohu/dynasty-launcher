import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const productDir = path.join(root, 'product');
const publicDir = path.join(root, 'public');
const demoProductDir = path.join(productDir, 'demo');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function walkJson(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJson(full));
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, data) {
  mkdirp(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function writeHtml(route, html) {
  const file = path.join(publicDir, `${route.replace(/^\/+/, '')}.html`);
  mkdirp(path.dirname(file));
  fs.writeFileSync(file, html);
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function titleCase(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

const modules = walkJson(path.join(productDir, 'modules')).map(readJson).sort((a, b) => a.name.localeCompare(b.name));
const bundles = walkJson(path.join(productDir, 'bundles')).map(readJson).sort((a, b) => a.name.localeCompare(b.name));
const blueprints = walkJson(path.join(productDir, 'blueprints')).map(readJson).sort((a, b) => a.name.localeCompare(b.name));
const tiers = readJson(path.join(productDir, 'pricing', 'tiers.json'));
const modulesByCode = new Map(modules.map((m) => [m.module_code, m]));
const bundlesByCode = new Map(bundles.map((b) => [b.bundle_code, b]));

function samplePayload(module) {
  return {
    demo: true,
    name: 'Demo Customer',
    email: 'demo.customer@example.com',
    contact_email: 'demo.customer@example.com',
    phone: '+15550101010',
    caller_phone: '+15550101010',
    job_id: 'job_demo_001',
    invoice_id: 'inv_demo_001',
    amount_due: 420,
    sentiment: 'positive',
    rating: 5,
  };
}

function expectedOutputs(module) {
  const actions = module.actions || [];
  const out = ['trace_steps', 'event_log', 'module_run_status'];
  if (actions.includes('send_sms')) out.push('sandbox_sms_preview');
  if (actions.includes('send_email')) out.push('sandbox_email_preview');
  if (actions.includes('notify_owner')) out.push('owner_alert_preview');
  if (actions.includes('log_outcome')) out.push('activity_timeline_entry');
  return [...new Set(out)];
}

function manifest({ unit_type, unit_code, title, route, module_codes, trigger = 'demo.requested', cta }) {
  return {
    schema_version: '1.0.0',
    unit_type,
    unit_code,
    title,
    route,
    demo_trigger: trigger,
    sample_input: { unit_type, unit_code },
    module_codes,
    expected_events: ['demo.session_created', 'demo.unit_ran', ...module_codes.map((code) => modulesByCode.get(code)?.trigger?.event).filter(Boolean)],
    expected_outputs: ['visible_execution_trace', 'sandbox_output_preview', 'activation_proof', 'cta_to_activate', 'catalog_traceability'],
    cta,
    api: {
      create_session: 'POST /api/demo/create-session',
      run: 'POST /api/demo/run-module',
      trace: 'GET /api/demo/trace?run_id={run_id}',
    },
    validation: {
      must_execute: true,
      must_return_trace: true,
      must_not_require_real_vendor_credentials: true,
    },
  };
}

function page({ title, description, unitType, unitCode, route, moduleCodes, cta = 'Activate this in my build' }) {
  const moduleCards = moduleCodes
    .map((code) => modulesByCode.get(code))
    .filter(Boolean)
    .map((m) => `<article class="demo-card"><h3>${esc(m.name)}</h3><p>${esc(m.outcome || m.description_short)}</p><span>${esc(m.trigger?.event || 'demo.requested')}</span></article>`)
    .join('');
  const payload = JSON.stringify({ unit_type: unitType, unit_code: unitCode });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} Working Demo - Your Deputy</title>
<meta name="description" content="${esc(description).slice(0, 160)}">
<link rel="canonical" href="https://www.yourdeputy.com${route}">
<link rel="stylesheet" href="/site-shell.css">
<style>
:root{--gold:#C9A84C;--ink:#09090B;--panel:#17171C;--panel2:#202028;--line:rgba(255,255,255,.12);--text:#FAFAF9;--muted:#A1A1AA;--ok:#22C55E;--danger:#FB7185}
*{box-sizing:border-box}body{margin:0;background:#0B0B10;color:var(--text);font-family:'DM Sans',system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.6}a{color:var(--gold);text-decoration:none}.wrap{max-width:1180px;margin:0 auto;padding:36px 22px 70px}.crumbs{font-size:13px;color:var(--muted);margin-bottom:30px}.hero{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:24px;align-items:stretch}.eyebrow{color:var(--gold);font-size:12px;text-transform:uppercase;font-weight:900;letter-spacing:.14em;margin-bottom:12px}h1{font-family:'Playfair Display',serif;font-weight:500;letter-spacing:-.03em;line-height:1;font-size:clamp(42px,6vw,78px);margin:0 0 18px}.lead{font-size:19px;color:var(--muted);max-width:830px}.panel,.demo-card,.trace-panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px}.panel strong{color:var(--gold)}.buttons{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px;max-width:100%;min-width:0}.btn{display:inline-flex;align-items:center;justify-content:center;flex-wrap:wrap;min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere;text-align:center;border-radius:11px;padding:13px 18px;font-weight:900;border:1px solid var(--line);cursor:pointer}.primary{background:var(--gold);color:#09090B;border-color:var(--gold)}.ghost{background:transparent;color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:16px}.section{margin-top:34px}.section h2{font-size:24px;margin:0 0 10px}.section p{color:var(--muted)}.demo-card h3{margin:0 0 8px;font-size:16px}.demo-card p{font-size:13px;margin:0 0 10px}.demo-card span{font-family:'SF Mono','Fira Code',monospace;font-size:12px;color:var(--gold);word-break:break-all}.trace-panel{margin-top:18px;background:#101014}.trace-status{display:flex;gap:8px;align-items:center;color:var(--muted);font-size:14px}.dot{width:10px;height:10px;border-radius:999px;background:var(--muted)}.dot.ok{background:var(--ok)}.dot.err{background:var(--danger)}pre{white-space:pre-wrap;word-break:break-word;max-height:520px;overflow:auto;background:#08080B;border:1px solid var(--line);border-radius:12px;padding:14px;color:#D4D4D8;font-size:12px}.output-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}.output{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:14px}.output b{display:block;color:var(--gold);margin-bottom:6px}@media(max-width:900px){.hero,.grid,.output-list{grid-template-columns:1fr}}@media(max-width:560px){.wrap{padding:24px 16px 56px}h1{font-size:38px}}
</style>
</head>
<body>
<main class="wrap">
<nav class="crumbs"><a href="/">Home</a> / <a href="/demo">Working demos</a> / ${esc(title)}</nav>
<section class="hero">
<div>
<div class="eyebrow">Live sandbox demo Â· ${esc(unitType)}</div>
<h1>${esc(title)}</h1>
<p class="lead">${esc(description)}</p>
<div class="buttons">
<button class="btn primary" id="run-demo" type="button">Run working demo</button>
<a class="btn ghost" href="/marketplace">Back to marketplace</a>
<a class="btn ghost" href="/app?demo=${encodeURIComponent(unitCode)}">${esc(cta)}</a>
</div>
</div>
<aside class="panel">
<p><strong>What this proves:</strong> entitlement, capability, activation, trigger, workflow dispatch, event log, output preview, and customer-visible trace.</p>
<p><strong>No real vendor keys required:</strong> email, SMS, payment, CRM, analytics, and document actions use sandbox providers for the demo.</p>
</aside>
</section>
<section class="section"><h2>Included working pieces</h2><div class="grid">${moduleCards || '<article class="demo-card"><h3>Configured by this unit</h3><p>The demo runtime will resolve the catalog modules for this unit before running.</p><span>catalog.resolve</span></article>'}</div></section>
<section class="section"><h2>Execution trace</h2><p>Run the demo to see the exact activation path and workflow outputs. This is deliberately visible so clients can inspect what they are buying.</p><div class="trace-panel"><div class="trace-status"><span class="dot" id="demo-dot"></span><span id="demo-status">Ready to run.</span></div><div id="demo-output" class="output-list"></div><pre id="demo-trace" aria-live="polite">Click "Run working demo" to execute this unit in a sandbox tenant.</pre></div></section>
<section class="section"><h2>Client CTA</h2><p>If this demo solves the pain point, activate the module, pack, suite, edition, plan, or blueprint from the marketplace. The checkout path grants entitlements and activates the same workflow machinery shown here.</p><div class="buttons"><a class="btn primary" href="/app?activate=${encodeURIComponent(unitCode)}">${esc(cta)}</a><a class="btn ghost" href="/deliverables">Review deliverables</a></div></section>
</main>
<script>
const demoPayload = ${payload};
const statusEl = document.getElementById('demo-status');
const traceEl = document.getElementById('demo-trace');
const dotEl = document.getElementById('demo-dot');
const outputEl = document.getElementById('demo-output');
function setStatus(text, ok) {
  statusEl.textContent = text;
  dotEl.className = 'dot ' + (ok === true ? 'ok' : ok === false ? 'err' : '');
}
function renderOutputs(trace) {
  const previews = (trace.runs || []).flatMap((run) => run.output_preview || []);
  outputEl.innerHTML = previews.map((item) => '<div class="output"><b>' + item.title + '</b><span>' + item.body + '</span></div>').join('');
}
document.getElementById('run-demo').addEventListener('click', async () => {
  setStatus('Running sandbox demo...', null);
  traceEl.textContent = 'Creating demo tenant, granting entitlement, activating modules, emitting trigger, and dispatching workflow...';
  outputEl.innerHTML = '';
  try {
    const res = await fetch('/api/demo/run-module', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(demoPayload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.details || data.error || 'demo failed');
    renderOutputs(data.trace);
    traceEl.textContent = JSON.stringify(data.trace, null, 2);
    setStatus('Demo completed. Trace and output previews are visible.', true);
  } catch (err) {
    traceEl.textContent = String(err.message || err);
    setStatus('Demo failed. The trace shows the reason.', false);
  }
});
</script>
<script src="/site-shell.js" defer></script>
</body>
</html>`;
}

const manifests = [];
function addManifest(kind, code, title, route, moduleCodes, trigger, cta) {
  const m = manifest({ unit_type: kind, unit_code: code, title, route, module_codes: moduleCodes, trigger, cta });
  manifests.push(m);
  const folder = kind === 'category' ? 'categories' : `${kind}s`;
  writeJson(path.join(demoProductDir, folder, `${slug(code)}.json`), m);
}

for (const module of modules) {
  const route = `/demo/modules/${slug(module.module_code)}`;
  const desc = `${module.description_short} This working demo runs the trigger, activates the module in a sandbox tenant, executes the workflow template, and returns output previews.`;
  addManifest('module', module.module_code, module.name, route, [module.module_code], module.trigger?.event, `Activate ${module.name}`);
  writeHtml(route, page({ title: `${module.name} Demo`, description: desc, unitType: 'module', unitCode: module.module_code, route, moduleCodes: [module.module_code], cta: `Activate ${module.name}` }));
}

for (const category of [...new Set(modules.map((m) => m.category || 'uncategorized'))].sort()) {
  const categoryModules = modules.filter((m) => (m.category || 'uncategorized') === category);
  const code = slug(category);
  const route = `/demo/categories/${code}`;
  addManifest('category', code, `${titleCase(category)} Demo`, route, categoryModules.map((m) => m.module_code), 'category.demo', `Activate ${titleCase(category)} workflows`);
  writeHtml(route, page({ title: `${titleCase(category)} Workflow Demos`, description: `Run every ${titleCase(category)} workflow in a sandbox tenant and inspect activation, trace, and output previews.`, unitType: 'category', unitCode: code, route, moduleCodes: categoryModules.map((m) => m.module_code), cta: `Activate ${titleCase(category)} workflows` }));
}

for (const bundle of bundles) {
  const route = `/demo/packs/${slug(bundle.bundle_code)}`;
  addManifest('pack', bundle.bundle_code, `${bundle.name} Demo`, route, bundle.modules || [], 'pack.demo', `Activate ${bundle.name}`);
  writeHtml(route, page({ title: `${bundle.name} Demo`, description: `Run the ${bundle.name} outcome pack end to end with sandbox events and visible trace output.`, unitType: 'pack', unitCode: bundle.bundle_code, route, moduleCodes: bundle.modules || [], cta: `Activate ${bundle.name}` }));
}

for (const blueprint of blueprints) {
  const moduleCodes = [...new Set([...(blueprint.recommended_modules || []), ...(blueprint.recommended_bundles || []).flatMap((code) => bundlesByCode.get(code)?.modules || [])])];
  const route = `/demo/blueprints/${slug(blueprint.blueprint_code)}`;
  addManifest('blueprint', blueprint.blueprint_code, `${blueprint.name} Demo`, route, moduleCodes, 'blueprint.demo', `Launch ${blueprint.name}`);
  writeHtml(route, page({ title: `${blueprint.name} Demo`, description: `Show the ${blueprint.name} blueprint as a working sandbox: recommended modules, event triggers, workflow dispatches, and output previews.`, unitType: 'blueprint', unitCode: blueprint.blueprint_code, route, moduleCodes, cta: `Launch ${blueprint.name}` }));
}

for (const suite of tiers.suites || []) {
  const moduleCodes = [...new Set([...(suite.packs || []).flatMap((code) => bundlesByCode.get(code)?.modules || []), ...(suite.extras || [])])];
  const route = `/demo/suites/${slug(suite.suite_code)}`;
  addManifest('suite', suite.suite_code, `${suite.name} Demo`, route, moduleCodes, 'suite.demo', `Activate ${suite.name}`);
  writeHtml(route, page({ title: `${suite.name} Demo`, description: `Run the ${suite.name} suite in a sandbox tenant and inspect every activated workflow included in the suite.`, unitType: 'suite', unitCode: suite.suite_code, route, moduleCodes, cta: `Activate ${suite.name}` }));
}

for (const edition of tiers.editions || []) {
  const suiteCodes = edition.includes?.suites === 'all' ? (tiers.suites || []).map((s) => s.suite_code) : (edition.includes?.suites || []);
  const packCodes = edition.includes?.packs === 'all' ? bundles.map((b) => b.bundle_code) : (edition.includes?.packs || []);
  const moduleCodes = [...new Set([
    ...suiteCodes.flatMap((code) => {
      const suite = (tiers.suites || []).find((s) => s.suite_code === code);
      return [...(suite?.packs || []).flatMap((packCode) => bundlesByCode.get(packCode)?.modules || []), ...(suite?.extras || [])];
    }),
    ...packCodes.flatMap((code) => bundlesByCode.get(code)?.modules || []),
  ])];
  const route = `/demo/editions/${slug(edition.edition_code)}`;
  addManifest('edition', edition.edition_code, `${edition.name} Demo`, route, moduleCodes, 'edition.demo', `Choose ${edition.name}`);
  writeHtml(route, page({ title: `${edition.name} Demo`, description: `Run the ${edition.name} edition as a complete sandbox package with module activation and workflow traces.`, unitType: 'edition', unitCode: edition.edition_code, route, moduleCodes, cta: `Choose ${edition.name}` }));
}

for (const tier of tiers.tiers || []) {
  const route = `/demo/plans/${slug(tier.tier_code)}`;
  addManifest('plan', tier.tier_code, `${tier.name} Demo`, route, tier.included_modules || [], 'plan.demo', `Start ${tier.name}`);
  writeHtml(route, page({ title: `${tier.name} Plan Demo`, description: `Inspect the ${tier.name} plan as a working sandbox with included modules, tenant capability setup, and activation proof.`, unitType: 'plan', unitCode: tier.tier_code, route, moduleCodes: tier.included_modules || [], cta: `Start ${tier.name}` }));
}

const indexCards = manifests.map((m) => `<a class="demo-card" href="${m.route}"><h3>${esc(m.title)}</h3><p>${esc(m.unit_type)} Â· ${m.module_codes.length} runnable workflow(s)</p><span>${esc(m.unit_code)}</span></a>`).join('');
writeHtml('/demo/index', page({
  title: 'Working Demos For Every Your Deputy Unit',
  description: 'Run live sandbox demos for modules, categories, packs, blueprints, suites, editions, and plans. Each demo proves entitlement, activation, workflow dispatch, event logging, and output preview.',
  unitType: 'directory',
  unitCode: 'demo_index',
  route: '/demo',
  moduleCodes: [],
  cta: 'Start from the marketplace',
}).replace('<div class="grid"><article class="demo-card"><h3>Configured by this unit</h3><p>The demo runtime will resolve the catalog modules for this unit before running.</p><span>catalog.resolve</span></article></div>', `<div class="grid">${indexCards}</div>`));

console.log(`build-demo-assets: ok (${manifests.length} demo manifests/pages)`);
