#!/usr/bin/env node
// scripts/generate-pages.mjs — Static page generator for all automations
// Reads product catalog + automation-catalog.js and generates 378+ SEO-optimized
// static HTML pages in public/automations/
// Usage: node scripts/generate-pages.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const require = createRequire(import.meta.url);
const OUT = join(ROOT, 'public', 'automations');

// ── Helpers ──────────────────────────────────────────────────────────────────

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')); }
  catch { return null; }
}

function readJsonDir(dir) {
  if (!existsSync(dir)) return [];
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      results.push(...readJsonDir(join(dir, entry.name)));
    } else if (entry.name.endsWith('.json')) {
      const data = readJson(join(dir, entry.name));
      if (data) results.push(data);
    }
  }
  return results;
}

// ── Load catalog data ────────────────────────────────────────────────────────

console.log('Loading catalog data...');

const modules = readJsonDir(join(ROOT, 'product', 'modules'));
const bundles = readJsonDir(join(ROOT, 'product', 'bundles'));
const blueprints = readJsonDir(join(ROOT, 'product', 'blueprints'));
const personas = readJsonDir(join(ROOT, 'product', 'personas'));
const capabilities = readJsonDir(join(ROOT, 'product', 'capabilities'));

// Load automation catalog (CommonJS in an ESM project — eval in a sandbox)
const catSrc = readFileSync(join(ROOT, 'api', 'automation-catalog.js'), 'utf-8');
const _module = { exports: {} };
const _fn = new Function('module', 'exports', 'require', '__filename', '__dirname', catSrc);
_fn(_module, _module.exports, require, join(ROOT, 'api', 'automation-catalog.js'), join(ROOT, 'api'));
const catalog = _module.exports;
const CATEGORIES = catalog.CATEGORIES || {};
const AUTOMATIONS = catalog.ALL_AUTOMATIONS || [];
const PACKAGES = catalog.PACKAGES || {};

// Build lookup maps
const modulesByCode = {};
for (const m of modules) modulesByCode[m.module_code] = m;

const bundlesByCode = {};
for (const b of bundles) bundlesByCode[b.bundle_code] = b;

const blueprintsByCode = {};
for (const b of blueprints) blueprintsByCode[b.blueprint_code] = b;

const capByCode = {};
for (const c of capabilities) capByCode[c.capability_code || c.code] = c;

// Group automations by category
const automationsByCat = {};
for (const a of AUTOMATIONS) {
  if (!automationsByCat[a.cat]) automationsByCat[a.cat] = [];
  automationsByCat[a.cat].push(a);
}

// Find which packages an automation belongs to
function getPackagesForAutomation(id) {
  const pkgs = [];
  for (const [pkg, ids] of Object.entries(PACKAGES)) {
    if (ids.includes(id)) pkgs.push(pkg);
  }
  return pkgs;
}

console.log(`Loaded: ${modules.length} modules, ${bundles.length} bundles, ${Object.keys(CATEGORIES).length} categories, ${AUTOMATIONS.length} automations`);

// ── Shared CSS ───────────────────────────────────────────────────────────────

const CSS = `
:root {
  --bg: #0b0d10; --card: #13171c; --card-hover: #1a1f26;
  --border: #242a31; --fg: #e8eaed; --muted: #9aa3ad;
  --accent: #4da3ff; --success: #3ecf8e; --warn: #f0b429;
  --danger: #ff6b6b;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg); color: var(--fg); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif; line-height: 1.6; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.wrap { max-width: 900px; margin: 0 auto; padding: 40px 24px; }
.breadcrumb { font-size: 13px; color: var(--muted); margin-bottom: 28px; }
.breadcrumb a { color: var(--muted); }
.breadcrumb a:hover { color: var(--accent); }
.hero-section {
  border: 1px solid var(--border); border-radius: 12px; padding: 36px;
  background: linear-gradient(180deg, #121621 0%, #0b0d10 100%);
  margin-bottom: 36px;
}
.hero-section h1 { font-size: 28px; letter-spacing: -0.02em; margin-bottom: 8px; }
.hero-section .tagline { color: var(--muted); font-size: 16px; max-width: 640px; margin-bottom: 16px; }
.hero-section .price-tag { font-size: 22px; font-weight: 700; color: var(--success); margin-bottom: 12px; }
.hero-section .price-tag span { font-size: 14px; font-weight: 400; color: var(--muted); }
.pills { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.pill { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 3px 10px; font-size: 12px; color: var(--muted); }
.pill-accent { border-color: var(--accent); color: var(--accent); }
.pill-success { border-color: var(--success); color: var(--success); }
.section { margin-bottom: 36px; }
.section h2 { font-size: 18px; margin-bottom: 14px; letter-spacing: -0.01em; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
.section p, .section li { color: var(--muted); font-size: 14px; }
.section ul { padding-left: 20px; }
.section li { margin-bottom: 6px; }
.card-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.card-sm {
  background: var(--card); border: 1px solid var(--border); border-radius: 8px;
  padding: 16px; transition: border-color 0.15s;
}
.card-sm:hover { border-color: var(--accent); }
.card-sm h3 { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
.card-sm p { font-size: 12px; color: var(--muted); }
.card-sm .meta { font-size: 11px; color: var(--muted); margin-top: 8px; }
.cta-bar {
  margin-top: 40px; padding: 24px; border-radius: 10px;
  background: linear-gradient(135deg, #162238 0%, #0f1922 100%);
  border: 1px solid var(--accent);
  text-align: center;
}
.cta-bar h3 { font-size: 18px; margin-bottom: 8px; }
.cta-bar p { color: var(--muted); font-size: 14px; margin-bottom: 16px; }
.btn {
  display: inline-block; padding: 12px 28px; border-radius: 8px;
  background: var(--accent); color: #fff; font-weight: 600; font-size: 14px;
  text-decoration: none; transition: opacity 0.15s;
}
.btn:hover { opacity: 0.85; text-decoration: none; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 640px) {
  .wrap { padding: 24px 16px; }
  .hero-section { padding: 24px; }
  .hero-section h1 { font-size: 22px; }
  .two-col { grid-template-columns: 1fr; }
}
table { width: 100%; border-collapse: collapse; margin-top: 10px; }
th, td { text-align: left; padding: 8px 12px; font-size: 13px; border-bottom: 1px solid var(--border); }
th { color: var(--fg); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
td { color: var(--muted); }
.steps-list { counter-reset: step; list-style: none; padding: 0; }
.steps-list li { counter-increment: step; padding: 10px 0 10px 40px; position: relative; border-left: 2px solid var(--border); margin-left: 12px; }
.steps-list li::before {
  content: counter(step); position: absolute; left: -14px; top: 8px;
  width: 26px; height: 26px; border-radius: 50%;
  background: var(--card); border: 2px solid var(--accent);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: var(--accent);
}
.steps-list li:last-child { border-left-color: transparent; }
footer { border-top: 1px solid var(--border); margin-top: 60px; padding: 24px 0; color: var(--muted); font-size: 12px; text-align: center; }
`;

// ── HTML wrapper ─────────────────────────────────────────────────────────────

function page({ title, description, canonical, breadcrumbs, body }) {
  const bc = breadcrumbs.map(b =>
    b.href ? `<a href="${b.href}">${escHtml(b.label)}</a>` : `<span>${escHtml(b.label)}</span>`
  ).join(' › ');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: title,
    description,
    brand: { '@type': 'Brand', name: 'Your Deputy' },
    url: `https://www.yourdeputy.com${canonical}`,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)} — Your Deputy</title>
<meta name="description" content="${escHtml(description)}">
<link rel="canonical" href="https://www.yourdeputy.com${canonical}">
<meta property="og:type" content="product">
<meta property="og:title" content="${escHtml(title)} — Your Deputy">
<meta property="og:description" content="${escHtml(description)}">
<meta property="og:url" content="https://www.yourdeputy.com${canonical}">
<meta property="og:site_name" content="Your Deputy">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escHtml(title)} — Your Deputy">
<meta name="twitter:description" content="${escHtml(description)}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<nav class="breadcrumb">${bc}</nav>
${body}
<footer>© ${new Date().getFullYear()} Dynasty Empire LLC · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/marketplace">Back to Marketplace</a></footer>
</div>
</body>
</html>`;
}

// ── Module pages (20) ────────────────────────────────────────────────────────

function generateModulePage(mod) {
  const s = slug(mod.name);
  const caps = (mod.capabilities_required || []).map(c => escHtml(c)).join(', ') || 'None';
  const verts = (mod.recommended_for_blueprints || []).map(b => {
    const bp = blueprintsByCode[b] || blueprintsByCode[b.replace(/-/g, '_')];
    return bp ? escHtml(bp.name) : escHtml(b);
  }).join(', ') || 'All verticals';

  const settings = (mod.configurable_settings || []).map(s =>
    `<li><strong>${escHtml(s.label)}</strong> — ${escHtml(s.type)}${s.default !== undefined ? `, default: ${escHtml(String(s.default))}` : ''}</li>`
  ).join('\n');

  const relatedModules = [...(mod.upsell_from || []), ...(mod.upsell_to || [])].filter(Boolean);
  const relatedHtml = relatedModules.map(code => {
    const rm = modulesByCode[code];
    if (!rm) return '';
    return `<a href="/automations/modules/${slug(rm.name)}" class="card-sm">
      <h3>${escHtml(rm.name)}</h3>
      <p>${escHtml(rm.description_short || rm.outcome || '')}</p>
      <div class="meta">$${rm.price_monthly}/mo · ${escHtml(rm.category)}</div>
    </a>`;
  }).filter(Boolean).join('\n');

  const kpis = (mod.kpis || []).map(k => `<li>${escHtml(k.replace(/_/g, ' '))}</li>`).join('\n');

  const actions = (mod.actions || []).map(a => `<li>${escHtml(a.replace(/_/g, ' '))}</li>`).join('\n');

  const body = `
<div class="hero-section">
  <div class="pills" style="margin-bottom:12px">
    <span class="pill pill-accent">${escHtml(mod.category)}</span>
    <span class="pill">${escHtml(mod.activation_type || 'instant')} activation</span>
    ${(mod.compliance_flags || []).map(f => `<span class="pill">${escHtml(f)}</span>`).join('')}
  </div>
  <h1>${escHtml(mod.name)}</h1>
  <p class="tagline">${escHtml(mod.description_short || '')}</p>
  <div class="price-tag">$${mod.price_monthly}<span>/mo per client</span></div>
  <p style="color:var(--muted);font-size:14px">Available in: ${(mod.tier_availability || []).map(t => escHtml(t)).join(', ')}</p>
</div>

<div class="section">
  <h2>Business Outcome</h2>
  <p>${escHtml(mod.outcome || '')}</p>
</div>

<div class="section">
  <h2>How It Works</h2>
  <p style="margin-bottom:10px"><strong>Trigger:</strong> <code>${escHtml(mod.trigger?.event || 'manual')}</code>${mod.trigger?.conditions ? ` when ${escHtml(JSON.stringify(mod.trigger.conditions))}` : ''}</p>
  ${actions ? `<p style="margin-bottom:6px"><strong>Actions performed:</strong></p><ol class="steps-list">${actions}</ol>` : ''}
</div>

${settings ? `<div class="section">
  <h2>Configurable Settings</h2>
  <ul>${settings}</ul>
</div>` : ''}

<div class="two-col">
  <div class="section">
    <h2>Integrations Required</h2>
    <p>${caps}</p>
  </div>
  <div class="section">
    <h2>Recommended For</h2>
    <p><strong>Industries:</strong> ${verts}</p>
    <p style="margin-top:6px"><strong>Personas:</strong> ${(mod.recommended_for_personas || []).map(p => escHtml(p.replace(/-/g, ' '))).join(', ') || 'All'}</p>
  </div>
</div>

${kpis ? `<div class="section">
  <h2>Key Metrics</h2>
  <ul>${kpis}</ul>
</div>` : ''}

${relatedHtml ? `<div class="section">
  <h2>Related Modules</h2>
  <div class="card-grid">${relatedHtml}</div>
</div>` : ''}

<div class="cta-bar">
  <h3>Activate ${escHtml(mod.name)}</h3>
  <p>$${mod.price_monthly}/mo per client · Cancel anytime · 30-day money-back guarantee</p>
  <a href="/dashboard" class="btn">Activate Now</a>
</div>`;

  const desc = mod.description_short || mod.outcome || `${mod.name} automation for service businesses`;
  const canonical = `/automations/modules/${s}`;

  return {
    html: page({
      title: mod.name,
      description: desc,
      canonical,
      breadcrumbs: [
        { label: 'Marketplace', href: '/marketplace' },
        { label: 'Modules', href: '/automations/modules' },
        { label: mod.name },
      ],
      body,
    }),
    path: join(OUT, 'modules', `${s}.html`),
    slug: s,
  };
}

// ── Bundle/Pack pages (5) ────────────────────────────────────────────────────

function generateBundlePage(bundle) {
  const s = slug(bundle.name);
  const mods = (bundle.modules || []).map(code => modulesByCode[code]).filter(Boolean);

  const moduleCards = mods.map(m =>
    `<a href="/automations/modules/${slug(m.name)}" class="card-sm">
      <h3>${escHtml(m.name)}</h3>
      <p>${escHtml(m.description_short || m.outcome || '')}</p>
      <div class="meta">$${m.price_monthly}/mo standalone · ${escHtml(m.category)}</div>
    </a>`
  ).join('\n');

  const standaloneTotal = mods.reduce((sum, m) => sum + (m.price_monthly || 0), 0);
  const savings = bundle.implied_savings_monthly || (standaloneTotal - bundle.price_monthly);

  const verts = (bundle.recommended_for_blueprints || []).map(b => {
    const bp = blueprintsByCode[b] || blueprintsByCode[b.replace(/-/g, '_')];
    return bp ? escHtml(bp.name) : escHtml(b);
  }).join(', ') || 'All verticals';

  const body = `
<div class="hero-section">
  <div class="pills" style="margin-bottom:12px">
    <span class="pill pill-success">Outcome Pack</span>
    <span class="pill">${mods.length} modules included</span>
    ${savings > 0 ? `<span class="pill pill-success">Save $${savings}/mo</span>` : ''}
  </div>
  <h1>${escHtml(bundle.name)}</h1>
  <p class="tagline" style="font-size:20px;font-style:italic;color:var(--fg)">${escHtml(bundle.tagline || '')}</p>
  <p class="tagline">${escHtml(bundle.description || '')}</p>
  <div class="price-tag">$${bundle.price_monthly}<span>/mo per client</span></div>
  <p style="color:var(--muted);font-size:13px">vs. $${standaloneTotal}/mo if purchased individually</p>
</div>

<div class="section">
  <h2>Business Outcome</h2>
  <p>${escHtml(bundle.outcome || '')}</p>
  ${bundle.hero_kpi ? `<p style="margin-top:8px"><strong>Key metric:</strong> ${escHtml(bundle.hero_kpi.replace(/_/g, ' '))}</p>` : ''}
</div>

<div class="section">
  <h2>Included Modules</h2>
  <div class="card-grid">${moduleCards}</div>
</div>

<div class="two-col">
  <div class="section">
    <h2>Recommended Industries</h2>
    <p>${verts}</p>
  </div>
  <div class="section">
    <h2>Best For</h2>
    <p>${(bundle.recommended_for_personas || []).map(p => escHtml(p.replace(/-/g, ' '))).join(', ') || 'All roles'}</p>
  </div>
</div>

<div class="cta-bar">
  <h3>Get the ${escHtml(bundle.name)}</h3>
  <p>$${bundle.price_monthly}/mo per client · ${mods.length} modules · Cancel anytime</p>
  <a href="/dashboard" class="btn">Activate Pack</a>
</div>`;

  const desc = bundle.description || bundle.tagline || `${bundle.name} — automation bundle for service businesses`;
  const canonical = `/automations/packs/${s}`;

  return {
    html: page({
      title: bundle.name,
      description: desc,
      canonical,
      breadcrumbs: [
        { label: 'Marketplace', href: '/marketplace' },
        { label: 'Packs', href: '/automations/packs' },
        { label: bundle.name },
      ],
      body,
    }),
    path: join(OUT, 'packs', `${s}.html`),
    slug: s,
  };
}

// ── Category pages (45) ──────────────────────────────────────────────────────

function generateCategoryPage(catNum, catName) {
  const s = slug(catName);
  const autos = automationsByCat[catNum] || [];

  const autoCards = autos.map(a => {
    const pkgs = getPackagesForAutomation(a.id);
    return `<a href="/automations/a/${slug(a.name)}-${a.id.replace('.', '-')}" class="card-sm">
      <h3>${escHtml(a.name)}</h3>
      <p>Trigger: ${escHtml(a.trigger)}${a.cron ? ` (${escHtml(a.cron)})` : ''} · ${a.steps?.length || 0} steps</p>
      <div class="meta">${pkgs.length ? pkgs.map(p => escHtml(p)).join(', ') : 'Add-on'}</div>
    </a>`;
  }).join('\n');

  const triggerBreakdown = {};
  for (const a of autos) {
    triggerBreakdown[a.trigger] = (triggerBreakdown[a.trigger] || 0) + 1;
  }

  const body = `
<div class="hero-section">
  <div class="pills" style="margin-bottom:12px">
    <span class="pill pill-accent">Category ${catNum}</span>
    <span class="pill">${autos.length} automations</span>
    ${Object.entries(triggerBreakdown).map(([t, c]) => `<span class="pill">${c} ${escHtml(t)}-triggered</span>`).join('')}
  </div>
  <h1>${escHtml(catName)}</h1>
  <p class="tagline">${autos.length} ready-to-deploy automations for ${escHtml(catName.toLowerCase())}. Each automation works alongside your existing tools — Jobber, Housecall Pro, ServiceTitan, and more.</p>
</div>

<div class="section">
  <h2>All Automations in ${escHtml(catName)}</h2>
  <div class="card-grid">${autoCards}</div>
</div>

<div class="cta-bar">
  <h3>Ready to automate ${escHtml(catName.toLowerCase())}?</h3>
  <p>Pick the automations you need, activate with one click, and let Your Deputy do the work.</p>
  <a href="/dashboard" class="btn">Get Started</a>
</div>`;

  const desc = `${autos.length} ${catName.toLowerCase()} automations for service businesses. Trigger-based workflows that integrate with your existing tools.`;
  const canonical = `/automations/categories/${s}`;

  return {
    html: page({
      title: catName,
      description: desc,
      canonical,
      breadcrumbs: [
        { label: 'Marketplace', href: '/marketplace' },
        { label: 'Categories', href: '/automations/categories' },
        { label: catName },
      ],
      body,
    }),
    path: join(OUT, 'categories', `${s}.html`),
    slug: s,
  };
}

// ── Individual automation pages (353) ────────────────────────────────────────

function generateAutomationPage(auto) {
  const catName = CATEGORIES[auto.cat] || `Category ${auto.cat}`;
  const catSlug = slug(catName);
  const s = `${slug(auto.name)}-${auto.id.replace('.', '-')}`;
  const pkgs = getPackagesForAutomation(auto.id);
  const steps = auto.steps || [];

  const stepTypes = { http: 'API Call', if: 'Condition', email: 'Send Email', sms: 'Send SMS',
    crm_contact: 'CRM Update', notify: 'Notification', log: 'Log Event', code: 'Custom Logic',
    extract: 'Extract Data', set: 'Set Variable', switch: 'Switch/Route', wait: 'Wait/Delay',
    loop: 'Loop', webhook: 'Webhook', db: 'Database', transform: 'Transform Data' };

  const stepsHtml = steps.map(step => {
    const typeName = stepTypes[step.t] || step.t;
    const detail = step.name || step.template || step.msg || step.path || '';
    return `<li><strong>${escHtml(typeName)}</strong>${detail ? ` — ${escHtml(detail)}` : ''}</li>`;
  }).join('\n');

  // Find related automations in same category
  const siblings = (automationsByCat[auto.cat] || []).filter(a => a.id !== auto.id).slice(0, 6);
  const siblingCards = siblings.map(a =>
    `<a href="/automations/a/${slug(a.name)}-${a.id.replace('.', '-')}" class="card-sm">
      <h3>${escHtml(a.name)}</h3>
      <p>${a.steps?.length || 0} steps · ${escHtml(a.trigger)}-triggered</p>
    </a>`
  ).join('\n');

  const body = `
<div class="hero-section">
  <div class="pills" style="margin-bottom:12px">
    <span class="pill pill-accent">${escHtml(catName)}</span>
    <span class="pill">${escHtml(auto.trigger)}-triggered</span>
    ${auto.cron ? `<span class="pill">${escHtml(auto.cron)}</span>` : ''}
    ${pkgs.map(p => `<span class="pill pill-success">${escHtml(p)} package</span>`).join('')}
    <span class="pill">${steps.length} steps</span>
  </div>
  <h1>${escHtml(auto.name)}</h1>
  <p class="tagline">Automation ${escHtml(auto.id)} — a ${escHtml(auto.trigger)}-triggered workflow with ${steps.length} steps for ${escHtml(catName.toLowerCase())}.</p>
</div>

<div class="section">
  <h2>Workflow Steps</h2>
  <ol class="steps-list">${stepsHtml}</ol>
</div>

<div class="two-col">
  <div class="section">
    <h2>Trigger</h2>
    <p><strong>Type:</strong> ${escHtml(auto.trigger)}</p>
    ${auto.cron ? `<p><strong>Schedule:</strong> <code>${escHtml(auto.cron)}</code></p>` : '<p>Fires on incoming webhook event</p>'}
  </div>
  <div class="section">
    <h2>Included In</h2>
    ${pkgs.length ? `<p>${pkgs.map(p => `<span class="pill pill-success" style="margin-right:6px">${escHtml(p)}</span>`).join('')}</p>` : '<p style="color:var(--muted)">Available as add-on</p>'}
  </div>
</div>

${siblingCards ? `<div class="section">
  <h2>More in ${escHtml(catName)}</h2>
  <div class="card-grid">${siblingCards}</div>
</div>` : ''}

<div class="cta-bar">
  <h3>Activate this automation</h3>
  <p>Part of the Your Deputy platform for service businesses. One click to turn on.</p>
  <a href="/dashboard" class="btn">Get Started</a>
</div>`;

  const desc = `${auto.name} — ${auto.trigger}-triggered automation with ${steps.length} steps for ${catName.toLowerCase()}. Part of Your Deputy's service business automation platform.`;
  const canonical = `/automations/a/${s}`;

  return {
    html: page({
      title: auto.name,
      description: desc,
      canonical,
      breadcrumbs: [
        { label: 'Marketplace', href: '/marketplace' },
        { label: catName, href: `/automations/categories/${catSlug}` },
        { label: auto.name },
      ],
      body,
    }),
    path: join(OUT, 'a', `${s}.html`),
    slug: s,
  };
}

// ── Index pages ──────────────────────────────────────────────────────────────

function generateModulesIndex() {
  const cards = modules.map(m =>
    `<a href="/automations/modules/${slug(m.name)}" class="card-sm">
      <h3>${escHtml(m.name)}</h3>
      <p>${escHtml(m.description_short || m.outcome || '')}</p>
      <div class="meta">$${m.price_monthly}/mo · ${escHtml(m.category)}</div>
    </a>`
  ).join('\n');

  const body = `
<div class="hero-section">
  <h1>Automation Modules</h1>
  <p class="tagline">${modules.length} individual modules at $19/mo each. Pick exactly what you need.</p>
</div>
<div class="section"><div class="card-grid">${cards}</div></div>`;

  return page({
    title: 'Automation Modules',
    description: `${modules.length} individual automation modules for service businesses. $19/mo each.`,
    canonical: '/automations/modules',
    breadcrumbs: [{ label: 'Marketplace', href: '/marketplace' }, { label: 'Modules' }],
    body,
  });
}

function generatePacksIndex() {
  const cards = bundles.map(b =>
    `<a href="/automations/packs/${slug(b.name)}" class="card-sm">
      <h3>${escHtml(b.name)}</h3>
      <p>${escHtml(b.tagline || b.description || '')}</p>
      <div class="meta">$${b.price_monthly}/mo · ${(b.modules || []).length} modules</div>
    </a>`
  ).join('\n');

  const body = `
<div class="hero-section">
  <h1>Outcome Packs</h1>
  <p class="tagline">${bundles.length} outcome packs that bundle related modules at a discount.</p>
</div>
<div class="section"><div class="card-grid">${cards}</div></div>`;

  return page({
    title: 'Outcome Packs',
    description: `${bundles.length} outcome-focused automation bundles for service businesses.`,
    canonical: '/automations/packs',
    breadcrumbs: [{ label: 'Marketplace', href: '/marketplace' }, { label: 'Packs' }],
    body,
  });
}

function generateCategoriesIndex() {
  const cards = Object.entries(CATEGORIES).map(([num, name]) => {
    const count = (automationsByCat[num] || []).length;
    return `<a href="/automations/categories/${slug(name)}" class="card-sm">
      <h3>${escHtml(name)}</h3>
      <p>${count} automations</p>
    </a>`;
  }).join('\n');

  const body = `
<div class="hero-section">
  <h1>Automation Categories</h1>
  <p class="tagline">${Object.keys(CATEGORIES).length} categories covering ${AUTOMATIONS.length} automations across every business function.</p>
</div>
<div class="section"><div class="card-grid">${cards}</div></div>`;

  return page({
    title: 'Automation Categories',
    description: `${Object.keys(CATEGORIES).length} automation categories covering ${AUTOMATIONS.length} workflows for service businesses.`,
    canonical: '/automations/categories',
    breadcrumbs: [{ label: 'Marketplace', href: '/marketplace' }, { label: 'Categories' }],
    body,
  });
}

// ── Generate everything ──────────────────────────────────────────────────────

console.log('Generating pages...');

// Create directories
for (const dir of ['modules', 'packs', 'categories', 'a']) {
  mkdirSync(join(OUT, dir), { recursive: true });
}

let count = 0;

// Index pages
writeFileSync(join(OUT, 'modules', 'index.html'), generateModulesIndex());
writeFileSync(join(OUT, 'packs', 'index.html'), generatePacksIndex());
writeFileSync(join(OUT, 'categories', 'index.html'), generateCategoriesIndex());
count += 3;

// Module pages
for (const mod of modules) {
  const { html, path: p } = generateModulePage(mod);
  writeFileSync(p, html);
  count++;
}
console.log(`  ✓ ${modules.length} module pages`);

// Bundle pages
for (const bundle of bundles) {
  const { html, path: p } = generateBundlePage(bundle);
  writeFileSync(p, html);
  count++;
}
console.log(`  ✓ ${bundles.length} pack pages`);

// Category pages
for (const [num, name] of Object.entries(CATEGORIES)) {
  const { html, path: p } = generateCategoryPage(Number(num), name);
  writeFileSync(p, html);
  count++;
}
console.log(`  ✓ ${Object.keys(CATEGORIES).length} category pages`);

// Individual automation pages
for (const auto of AUTOMATIONS) {
  const { html, path: p } = generateAutomationPage(auto);
  writeFileSync(p, html);
  count++;
}
console.log(`  ✓ ${AUTOMATIONS.length} automation pages`);

console.log(`\nDone! Generated ${count} pages in public/automations/`);
