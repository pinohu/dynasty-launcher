import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const publicDir = path.join(root, 'public');
const productDir = path.join(root, 'product');
const outDirs = ['automations/modules', 'automations/packs', 'automations/categories', 'automations/blueprints', 'plans', 'editions', 'suites', 'setup'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function walkJson(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkJson(full));
    else if (entry.name.endsWith('.json')) files.push(full);
  }
  return files;
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

function list(items) {
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) return '<li>Configured during activation for this tenant.</li>';
  return arr.map((item) => `<li>${esc(String(item).replace(/_/g, ' '))}</li>`).join('');
}

function pill(text) {
  return `<span class="pill">${esc(String(text).replace(/_/g, ' '))}</span>`;
}

function money(value, fallback = 'Talk to sales') {
  if (value === null || value === undefined) return fallback;
  return `$${Number(value).toLocaleString()}`;
}

function write(route, html) {
  const file = path.join(publicDir, `${route.replace(/^\/+/, '')}.html`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

const tiers = readJson(path.join(productDir, 'pricing', 'tiers.json'));
const modules = walkJson(path.join(productDir, 'modules')).map(readJson).sort((a, b) => a.name.localeCompare(b.name));
const bundles = walkJson(path.join(productDir, 'bundles')).map(readJson).sort((a, b) => a.name.localeCompare(b.name));
const blueprints = walkJson(path.join(productDir, 'blueprints')).map(readJson).sort((a, b) => a.name.localeCompare(b.name));
const modulesByCode = new Map(modules.map((m) => [m.module_code, m]));
const bundlesByCode = new Map(bundles.map((b) => [b.bundle_code, b]));

for (const dir of outDirs) fs.mkdirSync(path.join(publicDir, dir), { recursive: true });

function page({ title, description, eyebrow, canonical, price, primaryHref, primaryLabel = 'Activate from dashboard', secondaryHref = '/marketplace', secondaryLabel = 'Back to marketplace', body, jsonLd }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} - Your Deputy Marketplace</title>
<meta name="description" content="${esc(description).slice(0, 160)}">
<link rel="canonical" href="https://www.yourdeputy.com${canonical}">
<meta property="og:title" content="${esc(title)} - Your Deputy">
<meta property="og:description" content="${esc(description).slice(0, 160)}">
<meta property="og:type" content="website">
<meta property="og:image" content="https://www.yourdeputy.com/og-default.png">
<link rel="stylesheet" href="/site-shell.css">
<script type="application/ld+json">${JSON.stringify(jsonLd || { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: title, applicationCategory: 'BusinessApplication', operatingSystem: 'Web', description })}</script>
<style>
:root{--gold:#C9A84C;--ink:#09090B;--panel:#16161B;--card:#1E1E2A;--card2:#13131A;--bdr:rgba(255,255,255,.12);--tx:#FAFAF9;--sub:#A1A1AA;--dim:#8A8A8A;--green:#22C55E}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0C0C14;color:var(--tx);font-family:'DM Sans',system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:var(--gold);text-decoration:none}a:hover{text-decoration:underline}
:focus-visible{outline:2px solid var(--gold);outline-offset:2px;border-radius:4px}
.skip:focus{position:fixed!important;left:16px;top:16px;width:auto!important;height:auto!important;overflow:visible!important;z-index:9999}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
.crumbs{font-size:13px;color:var(--dim);padding:30px 0 4px}.crumbs a{color:var(--sub)}
.hero{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(280px,.9fr);gap:32px;align-items:center;padding:44px 0 34px}
.eyebrow{display:inline-flex;gap:8px;align-items:center;color:var(--gold);font-size:12px;text-transform:uppercase;letter-spacing:.12em;font-weight:800;margin-bottom:16px}
.mark{width:34px;height:34px;border-radius:10px;background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.28);display:inline-flex;align-items:center;justify-content:center;color:var(--gold);letter-spacing:0}
h1{font-family:'Playfair Display',serif;font-size:clamp(38px,6vw,70px);line-height:.98;font-weight:500;letter-spacing:-.03em;margin-bottom:18px}
.lead{font-size:18px;color:var(--sub);max-width:780px}
.hero-card{background:linear-gradient(145deg,rgba(201,168,76,.10),rgba(255,255,255,.025));border:1px solid rgba(201,168,76,.25);border-radius:18px;padding:24px;box-shadow:0 20px 70px rgba(0,0,0,.36)}
.price{font-size:34px;color:var(--gold);font-weight:800;margin-bottom:8px}.price span{font-size:14px;color:var(--sub);font-weight:500}
.hero-card p{color:var(--sub);font-size:14px;margin-bottom:18px}
.cta-row{display:flex;gap:10px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:800;text-decoration:none;transition:all .18s;border:1px solid var(--bdr)}
.btn:hover{transform:translateY(-1px);box-shadow:0 8px 28px rgba(0,0,0,.32);text-decoration:none}
.btn-primary{background:var(--gold);color:#09090B;border-color:var(--gold)}.btn-ghost{background:transparent;color:var(--sub)}
.section{padding:34px 0;border-top:1px solid rgba(255,255,255,.07)}.section h2{font-size:22px;margin-bottom:10px}.section p{color:var(--sub);max-width:860px}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:18px}.grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
.card{background:var(--card);border:1px solid var(--bdr);border-radius:14px;padding:18px}.card h3{font-size:15px;margin-bottom:8px}.card p,.card li{font-size:13.5px;color:var(--sub)}
.pills{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.pill{border:1px solid var(--bdr);border-radius:999px;background:rgba(255,255,255,.035);padding:6px 10px;color:var(--sub);font-size:12px}
.checklist{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}.checklist li{list-style:none;background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:11px 13px;color:var(--sub);font-size:13.5px}.checklist li:before{content:'✓';color:var(--gold);font-weight:900;margin-right:8px}
table{width:100%;border-collapse:collapse;margin-top:16px;background:var(--card);border:1px solid var(--bdr);border-radius:14px;overflow:hidden}th,td{border-bottom:1px solid var(--bdr);padding:12px;text-align:left;font-size:13px}th{color:var(--gold);text-transform:uppercase;letter-spacing:.08em;font-size:11px}td{color:var(--sub)}
.trace{font-family:'SF Mono','Fira Code',monospace;font-size:12px;color:var(--sub);word-break:break-all}
.note{background:rgba(255,255,255,.035);border:1px solid var(--bdr);border-radius:14px;padding:18px;color:var(--sub);font-size:13px;margin-top:18px}
@media(max-width:900px){.hero{grid-template-columns:1fr}.grid,.grid.two,.checklist{grid-template-columns:1fr}}@media(max-width:640px){.wrap{padding:0 16px}h1{font-size:36px}}
</style>
</head>
<body>
<a href="#main-content" class="skip" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;font-size:14px;padding:8px 16px;background:var(--gold);color:var(--ink);border-radius:8px;font-weight:700">Skip to content</a>
<main id="main-content" role="main">
<div class="wrap">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/marketplace">Marketplace</a></nav>
<section class="hero">
<div><div class="eyebrow"><span class="mark">YD</span>${esc(eyebrow)}</div><h1>${esc(title)}</h1><p class="lead">${esc(description)}</p></div>
<aside class="hero-card"><div class="price">${price || 'Included'} ${price && !String(price).includes('sales') ? '<span>/mo</span>' : ''}</div><p>Every marketplace item is tied to catalog data, API endpoints, activation requirements, and a specific business pain point so the promise is traceable.</p><div class="cta-row"><a class="btn btn-primary" href="${primaryHref}">${esc(primaryLabel)}</a><a class="btn btn-ghost" href="${secondaryHref}">${esc(secondaryLabel)}</a></div></aside>
</section>
${body}
</div>
</main>
<script src="/site-shell.js" defer></script>
</body>
</html>`;
}

function moduleRoute(m) {
  return `/automations/modules/${slug(m.name)}`;
}
function bundleRoute(b) {
  return `/automations/packs/${slug(b.name)}`;
}
function suiteRoute(s) {
  return `/suites/${slug(s.name)}`;
}
function editionRoute(e) {
  return `/editions/${slug(e.name)}`;
}

for (const m of modules) {
  const route = moduleRoute(m);
  const body = `
<section class="section"><h2>The pain this solves</h2><p>${esc(m.outcome || m.description_short)} The workflow exists to remove a repeated operational leak: a missed response, delayed follow-up, manual handoff, billing drag, review friction, or retention gap.</p><div class="grid"><article class="card"><h3>Trigger</h3><p>${esc(m.trigger?.event || 'Tenant action')}</p></article><article class="card"><h3>What it does</h3><p>${esc((m.actions || []).map((a) => String(a).replace(/_/g, ' ')).join(', ') || m.description_short)}</p></article><article class="card"><h3>Success metrics</h3><p>${esc((m.kpis || []).map((k) => String(k).replace(/_/g, ' ')).join(', ') || 'Activation rate, completion rate, and outcome lift')}</p></article></div></section>
<section class="section"><h2>Functional workflow contract</h2><ul class="checklist">${list([...(m.inputs || []).map((x) => `Input: ${x}`), ...(m.actions || []).map((x) => `Action: ${x}`), ...(m.configurable_settings || []).map((s) => `Setting: ${s.label || s.key}`)])}</ul></section>
<section class="section"><h2>Traceability</h2><table><tbody><tr><th>Catalog code</th><td class="trace">${esc(m.module_code)}</td></tr><tr><th>API record</th><td><a href="/api/catalog/modules?code=${encodeURIComponent(m.module_code)}">/api/catalog/modules?code=${esc(m.module_code)}</a></td></tr><tr><th>Activation API</th><td class="trace">POST /api/tenants/activate-module with module_code=${esc(m.module_code)}</td></tr><tr><th>Required capabilities</th><td>${esc((m.capabilities_required || []).join(', ') || 'None')}</td></tr><tr><th>Compliance guards</th><td>${esc((m.compliance_flags || []).join(', ') || 'Standard audit logging')}</td></tr><tr><th>Status</th><td>${esc(m.status || 'spec')} · ${esc(m.activation_type || 'standard')} activation</td></tr></tbody></table><div class="note">If a tenant lacks entitlement or required capabilities, activation returns a typed deferred state rather than pretending the workflow is live.</div></section>
<section class="section"><h2>Recommended for</h2><div class="pills">${[...(m.recommended_for_personas || []), ...(m.recommended_for_blueprints || [])].map(pill).join('')}</div></section>`;
  write(route, page({
    title: m.name,
    description: `${m.description_short} ${m.outcome || ''}`.trim(),
    eyebrow: `${m.category || 'workflow'} module`,
    canonical: route,
    price: money(m.price_monthly),
    primaryHref: `/dashboard?activate=${encodeURIComponent(m.module_code)}`,
    primaryLabel: 'Activate this workflow',
    body,
  }));
}

for (const b of bundles) {
  const route = bundleRoute(b);
  const linkedModules = (b.modules || []).map((code) => modulesByCode.get(code)).filter(Boolean);
  const body = `
<section class="section"><h2>The pain this pack solves</h2><p>${esc(b.description || b.tagline)} It groups the workflows that solve one operational outcome instead of asking the owner to assemble disconnected automations.</p><div class="grid">${linkedModules.map((m) => `<a class="card" href="${moduleRoute(m)}"><h3>${esc(m.name)}</h3><p>${esc(m.outcome || m.description_short)}</p></a>`).join('')}</div></section>
<section class="section"><h2>Traceability</h2><table><tbody><tr><th>Catalog code</th><td class="trace">${esc(b.bundle_code)}</td></tr><tr><th>API record</th><td><a href="/api/catalog/bundles?code=${encodeURIComponent(b.bundle_code)}">/api/catalog/bundles?code=${esc(b.bundle_code)}</a></td></tr><tr><th>Hero KPI</th><td>${esc(b.hero_kpi || 'Outcome completion')}</td></tr><tr><th>Included modules</th><td>${esc((b.modules || []).join(', '))}</td></tr><tr><th>Status</th><td>${esc(b.status || 'spec')}</td></tr></tbody></table></section>
<section class="section"><h2>Who should start here</h2><div class="pills">${[...(b.recommended_for_personas || []), ...(b.recommended_for_blueprints || [])].map(pill).join('')}</div></section>`;
  write(route, page({
    title: b.name,
    description: `${b.tagline || ''} ${b.outcome || b.description || ''}`.trim(),
    eyebrow: 'Outcome pack',
    canonical: route,
    price: money(b.price_monthly),
    primaryHref: `/dashboard?pack=${encodeURIComponent(b.bundle_code)}`,
    primaryLabel: 'Activate this pack',
    body,
  }));
}

for (const s of tiers.suites || []) {
  const route = suiteRoute(s);
  const suiteBundles = (s.packs || []).map((code) => bundlesByCode.get(code)).filter(Boolean);
  const suiteModules = suiteBundles.flatMap((b) => b.modules || []).map((code) => modulesByCode.get(code)).filter(Boolean);
  const body = `
<section class="section"><h2>Outcome stack</h2><p>${esc(s.positioning)} This suite combines multiple packs and reporting so the business can manage a whole operational outcome, not just one task.</p><div class="grid">${suiteBundles.map((b) => `<a class="card" href="${bundleRoute(b)}"><h3>${esc(b.name)}</h3><p>${esc(b.description || b.tagline)}</p></a>`).join('')}</div></section>
<section class="section"><h2>Included workflows</h2><ul class="checklist">${list(suiteModules.map((m) => m.name))}</ul></section>
<section class="section"><h2>Traceability</h2><table><tbody><tr><th>Catalog code</th><td class="trace">${esc(s.suite_code)}</td></tr><tr><th>Packs</th><td>${esc((s.packs || []).join(', '))}</td></tr><tr><th>Discount</th><td>${esc(s.effective_discount_pct || 0)}% vs component packs</td></tr><tr><th>Status</th><td>${esc(s.status || 'available as configured')}</td></tr></tbody></table></section>`;
  write(route, page({ title: s.name, description: s.positioning, eyebrow: 'Outcome suite', canonical: route, price: money(s.price_monthly), primaryHref: `/dashboard?suite=${encodeURIComponent(s.suite_code)}`, primaryLabel: 'Activate this suite', body }));
}

for (const e of tiers.editions || []) {
  const route = editionRoute(e);
  const suiteCodes = e.includes?.suites === 'all' ? (tiers.suites || []).map((s) => s.suite_code) : (e.includes?.suites || []);
  const packCodes = e.includes?.packs === 'all' ? bundles.map((b) => b.bundle_code) : (e.includes?.packs || []);
  const body = `
<section class="section"><h2>Who this edition is for</h2><p>${esc(e.for)}. ${esc(e.positioning)} It bundles the core workspace, recommended suites, and relevant packs into one clearer buying path.</p><div class="grid two"><article class="card"><h3>Suites included</h3><p>${esc(suiteCodes.join(', ') || 'Configured by sales')}</p></article><article class="card"><h3>Packs included</h3><p>${esc(packCodes.join(', ') || 'No extra packs beyond suites')}</p></article></div></section>
<section class="section"><h2>Traceability</h2><table><tbody><tr><th>Catalog code</th><td class="trace">${esc(e.edition_code)}</td></tr><tr><th>Base tier</th><td>${esc(e.includes?.tier || 'core')}</td></tr><tr><th>Extra seats</th><td>${esc(e.includes?.extra_seats ?? 0)}</td></tr><tr><th>Discount</th><td>${esc(e.effective_discount_pct || 0)}% effective discount</td></tr></tbody></table></section>`;
  write(route, page({ title: e.name, description: `${e.positioning} Built for ${e.for}.`, eyebrow: 'Industry edition', canonical: route, price: money(e.price_monthly, e.price_label || 'Talk to sales'), primaryHref: `/dashboard?edition=${encodeURIComponent(e.edition_code)}`, primaryLabel: 'Choose this edition', body }));
}

for (const t of tiers.tiers || []) {
  const route = `/plans/${slug(t.name)}`;
  const body = `
<section class="section"><h2>What Core makes functional</h2><p>${esc(t.description)} It is the control surface for contact records, entitlements, capabilities, activation state, and marketplace expansion.</p><ul class="checklist">${list(['CRM workspace', `${t.max_contacts?.toLocaleString?.() || t.max_contacts} contact records`, `${t.max_users} included seats`, 'Automation marketplace access', 'Dashboard and templates'])}</ul></section>
<section class="section"><h2>Traceability</h2><table><tbody><tr><th>Catalog code</th><td class="trace">${esc(t.tier_code)}</td></tr><tr><th>API record</th><td><a href="/api/catalog/tiers">/api/catalog/tiers</a></td></tr><tr><th>Included modules</th><td>${esc((t.included_modules || []).join(', ') || 'A la carte activation')}</td></tr></tbody></table></section>`;
  write(route, page({ title: t.name, description: t.description, eyebrow: 'Core plan', canonical: route, price: money(t.price_monthly), primaryHref: '/dashboard?plan=core', primaryLabel: 'Start with Core', body }));
}

for (const [code, c] of Object.entries(tiers.concierge_setup || {})) {
  const route = `/setup/${slug(code)}`;
  const label = `${code[0].toUpperCase()}${code.slice(1)} Setup`;
  const body = `
<section class="section"><h2>Setup scope</h2><p>${esc(c.description)} This page clarifies what is handled, what remains customer-owned, and how the setup path connects to activated modules.</p><ul class="checklist">${list(['Workspace configuration', 'Capability review', 'Module activation planning', 'Owner handoff', `Delivery mode: ${c.delivery_mode}`])}</ul></section>
<section class="section"><h2>Traceability</h2><table><tbody><tr><th>Setup code</th><td class="trace">${esc(code)}</td></tr><tr><th>Price</th><td>${money(c.price_onetime)} one-time</td></tr><tr><th>Catalog source</th><td class="trace">product/pricing/tiers.json → concierge_setup.${esc(code)}</td></tr></tbody></table></section>`;
  write(route, page({ title: label, description: c.description, eyebrow: 'Expert setup', canonical: route, price: `${money(c.price_onetime)} <span>one-time</span>`, primaryHref: `/dashboard?setup=${encodeURIComponent(code)}`, primaryLabel: 'Book this setup', body }));
}

for (const bp of blueprints) {
  const route = `/automations/blueprints/${slug(bp.name)}`;
  const bpModules = (bp.recommended_modules || []).map((code) => modulesByCode.get(code)).filter(Boolean);
  const bpBundles = (bp.recommended_bundles || []).map((code) => bundlesByCode.get(code)).filter(Boolean);
  const body = `
<section class="section"><h2>Specific pain points</h2><p>${esc(bp.description)} The blueprint maps common services, job types, seasonality, messaging tone, dashboards, and recommended workflows into one discoverable operating path.</p><ul class="checklist">${list([...(bp.common_services || []).map((s) => `Service: ${s}`), ...(bp.typical_job_types || []).map((j) => `Job type: ${j}`), ...(bp.seasonal_patterns || []).map((p) => `Seasonality: ${p}`)])}</ul></section>
<section class="section"><h2>Recommended modules</h2><div class="grid">${bpModules.map((m) => `<a class="card" href="${moduleRoute(m)}"><h3>${esc(m.name)}</h3><p>${esc(m.outcome || m.description_short)}</p></a>`).join('')}</div></section>
<section class="section"><h2>Recommended packs</h2><div class="grid">${bpBundles.map((b) => `<a class="card" href="${bundleRoute(b)}"><h3>${esc(b.name)}</h3><p>${esc(b.description || b.tagline)}</p></a>`).join('')}</div></section>
<section class="section"><h2>Traceability</h2><table><tbody><tr><th>Blueprint code</th><td class="trace">${esc(bp.blueprint_code)}</td></tr><tr><th>Vertical</th><td>${esc(bp.vertical)}</td></tr><tr><th>Dashboard KPIs</th><td>${esc((bp.dashboard_kpis || []).join(', '))}</td></tr></tbody></table></section>`;
  write(route, page({ title: bp.name, description: bp.description, eyebrow: 'Industry blueprint', canonical: route, price: 'Included', primaryHref: `/marketplace?blueprint=${encodeURIComponent(bp.blueprint_code)}#modules-section`, primaryLabel: 'Filter marketplace', body }));
}

function cardGrid(items, getRoute, getTitle, getDesc) {
  return `<div class="grid">${items.map((item) => `<a class="card" href="${getRoute(item)}"><h3>${esc(getTitle(item))}</h3><p>${esc(getDesc(item))}</p></a>`).join('')}</div>`;
}

write('/automations/modules/index', page({ title: 'All Workflow Modules', description: 'Every individual Your Deputy workflow module with traceable trigger, action, capability, API, and activation contracts.', eyebrow: 'Module directory', canonical: '/automations/modules', price: 'From $19', primaryHref: '/marketplace#modules-section', primaryLabel: 'Browse modules', body: `<section class="section"><h2>Modules</h2>${cardGrid(modules, moduleRoute, (m) => m.name, (m) => m.outcome || m.description_short)}</section>` }));
write('/automations/packs/index', page({ title: 'All Outcome Packs', description: 'Outcome packs group related modules around a specific business problem such as lead capture, reviews, scheduling, retention, or billing.', eyebrow: 'Pack directory', canonical: '/automations/packs', price: 'From $35', primaryHref: '/marketplace#packs-section', primaryLabel: 'Browse packs', body: `<section class="section"><h2>Packs</h2>${cardGrid(bundles, bundleRoute, (b) => b.name, (b) => b.description || b.tagline)}</section>` }));
write('/automations/blueprints/index', page({ title: 'Industry Blueprints', description: 'Blueprints make marketplace recommendations discoverable by niche, job type, service pattern, seasonality, and operating pain point.', eyebrow: 'Blueprint directory', canonical: '/automations/blueprints', price: 'Included', primaryHref: '/marketplace#blueprints-section', primaryLabel: 'Browse blueprints', body: `<section class="section"><h2>Blueprints</h2>${cardGrid(blueprints, (b) => `/automations/blueprints/${slug(b.name)}`, (b) => b.name, (b) => b.description)}</section>` }));
write('/automations/categories/index', page({ title: 'Workflow Categories', description: 'Browse workflow modules by operational category so every marketplace promise maps to a specific pain point and activation path.', eyebrow: 'Category directory', canonical: '/automations/categories', price: 'Included', primaryHref: '/marketplace#modules-section', primaryLabel: 'Browse marketplace', body: `<section class="section"><h2>Categories</h2>${cardGrid([...new Set(modules.map((m) => m.category || 'uncategorized'))].sort().map((category) => ({ category, modules: modules.filter((m) => (m.category || 'uncategorized') === category) })), (c) => `/automations/categories/${slug(c.category)}`, (c) => c.category.replace(/-/g, ' '), (c) => `${c.modules.length} workflows`)}</section>` }));

for (const category of [...new Set(modules.map((m) => m.category || 'uncategorized'))]) {
  const categoryModules = modules.filter((m) => (m.category || 'uncategorized') === category);
  write(`/automations/categories/${slug(category)}`, page({ title: `${category.replace(/-/g, ' ')} Workflows`, description: `Workflow modules for ${category.replace(/-/g, ' ')} with traceable activation paths and specific operating outcomes.`, eyebrow: 'Workflow category', canonical: `/automations/categories/${slug(category)}`, price: 'From $19', primaryHref: '/marketplace#modules-section', primaryLabel: 'Browse marketplace', body: `<section class="section"><h2>${esc(category.replace(/-/g, ' '))} modules</h2>${cardGrid(categoryModules, moduleRoute, (m) => m.name, (m) => m.outcome || m.description_short)}</section>` }));
}

console.log(`build-marketplace-pages: ok (${modules.length} modules, ${bundles.length} packs, ${(tiers.suites || []).length} suites, ${(tiers.editions || []).length} editions, ${blueprints.length} blueprints)`);
