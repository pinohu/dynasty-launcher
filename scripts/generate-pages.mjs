#!/usr/bin/env node
// scripts/generate-pages.mjs — Static page generator for all automations
// Reads product catalog + automation-catalog.js and generates 426 SEO-optimized
// static HTML pages in public/automations/ applying Nielsen, Norman, Morville,
// Baymard, CXL, W3C WAI, Walter, and Solís principles.
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
  --border: #242a31; --fg: #e8eaed; --muted: #b0b8c4;
  --accent: #4da3ff; --success: #3ecf8e; --warn: #f0b429;
  --danger: #ff6b6b;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg); color: var(--fg); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif; line-height: 1.6; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
main { padding: 40px 0; }
.wrap { max-width: 900px; margin: 0 auto; padding: 40px 24px; }
.skip-link { position: absolute; top: -40px; left: 0; background: var(--accent); color: #000; padding: 8px 12px; text-decoration: none; z-index: 100; font-weight: 600; }
.skip-link:focus { top: 0; }
.breadcrumb { font-size: 13px; color: var(--muted); margin-bottom: 28px; }
.breadcrumb a { color: var(--muted); text-decoration: none; }
.breadcrumb a:hover { color: var(--accent); text-decoration: underline; }
.hero-section {
  border: 1px solid var(--border); border-radius: 12px; padding: 36px;
  background: linear-gradient(180deg, #121621 0%, #0b0d10 100%);
  margin-bottom: 36px;
}
.hero-section h1 { font-size: 28px; letter-spacing: -0.02em; margin-bottom: 8px; font-weight: 700; }
.hero-section .tagline { color: var(--muted); font-size: 16px; max-width: 640px; margin: 16px 0; line-height: 1.7; }
.hero-section .price-tag { font-size: 22px; font-weight: 700; color: var(--success); margin: 16px 0 8px 0; }
.hero-section .price-tag span { font-size: 14px; font-weight: 400; color: var(--muted); }
.hero-section .reassurance { color: var(--muted); font-size: 13px; margin-top: 12px; }
.pills { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.pill { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 6px 12px; font-size: 12px; color: var(--muted); display: inline-block; }
.pill-accent { border-color: var(--accent); color: var(--accent); }
.pill-success { border-color: var(--success); color: var(--success); }
.pill-warn { border-color: var(--warn); color: var(--warn); }
.section { margin-bottom: 48px; }
.section h2 { font-size: 18px; margin-bottom: 14px; letter-spacing: -0.01em; border-bottom: 1px solid var(--border); padding-bottom: 8px; font-weight: 600; }
.section h3 { font-size: 16px; margin: 16px 0 8px 0; font-weight: 600; }
.section p, .section li { color: var(--muted); font-size: 14px; line-height: 1.7; }
.section ul, .section ol { padding-left: 20px; margin: 12px 0; }
.section li { margin-bottom: 8px; }
.card-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.card-sm {
  background: var(--card); border: 1px solid var(--border); border-radius: 8px;
  padding: 16px; transition: border-color 0.15s, background-color 0.15s;
  text-decoration: none; display: block;
}
.card-sm:hover { border-color: var(--accent); background-color: var(--card-hover); text-decoration: none; }
.card-sm:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.card-sm h3 { font-size: 14px; font-weight: 600; margin-bottom: 4px; color: var(--fg); }
.card-sm p { font-size: 12px; color: var(--muted); margin: 6px 0; }
.card-sm .meta { font-size: 11px; color: var(--muted); margin-top: 8px; }
.card-sm::after { content: ' →'; color: var(--accent); }
.cta-bar {
  margin-top: 40px; padding: 24px; border-radius: 10px;
  background: linear-gradient(135deg, #162238 0%, #0f1922 100%);
  border: 1px solid var(--accent);
}
.cta-bar h3 { font-size: 18px; margin-bottom: 8px; font-weight: 600; }
.cta-bar p { color: var(--muted); font-size: 14px; margin-bottom: 16px; }
.btn {
  display: inline-block; padding: 12px 28px; border-radius: 8px;
  background: var(--accent); color: #000; font-weight: 600; font-size: 14px;
  text-decoration: none; transition: opacity 0.15s; border: none; cursor: pointer;
}
.btn:hover { opacity: 0.85; text-decoration: none; }
.btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.trust-bar {
  background: var(--card); border: 1px solid var(--border); border-radius: 8px;
  padding: 20px; margin: 24px 0; font-size: 13px; color: var(--muted);
}
.trust-bar strong { color: var(--fg); }
.status-badge {
  display: inline-block; padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: 600;
}
.status-badge-coming { background: var(--warn); color: #000; }
.status-badge-testing { background: var(--accent); color: #000; }
.status-badge-available { background: var(--success); color: #000; }
.status-badge-live { background: var(--success); color: #000; }
@media (max-width: 640px) {
  .wrap { padding: 24px 16px; }
  main { padding: 24px 0; }
  .hero-section { padding: 24px; }
  .hero-section h1 { font-size: 22px; }
  .two-col { grid-template-columns: 1fr; gap: 14px; }
  .card-grid { grid-template-columns: 1fr; }
  .section { margin-bottom: 32px; }
}
table { width: 100%; border-collapse: collapse; margin-top: 10px; }
th, td { text-align: left; padding: 10px 12px; font-size: 13px; border-bottom: 1px solid var(--border); }
th { color: var(--fg); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; background: var(--card); }
td { color: var(--muted); }
.steps-list { counter-reset: step; list-style: none; padding: 0; margin: 12px 0; }
.steps-list li { counter-increment: step; padding: 10px 0 10px 40px; position: relative; border-left: 2px solid var(--border); margin-left: 12px; }
.steps-list li::before {
  content: counter(step); position: absolute; left: -14px; top: 8px;
  width: 26px; height: 26px; border-radius: 50%;
  background: var(--card); border: 2px solid var(--accent);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: var(--accent);
}
.steps-list li:last-child { border-left-color: transparent; }
footer { border-top: 1px solid var(--border); margin-top: 60px; padding: 24px 0; color: var(--muted); font-size: 12px; }
footer a { color: var(--accent); }
code { background: var(--card); padding: 2px 6px; border-radius: 3px; font-family: "Monaco", "Courier New", monospace; font-size: 12px; }
`;

// ── HTML wrapper ─────────────────────────────────────────────────────────────

function page({ title, description, canonical, breadcrumbs, body, jsonLd }) {
  const bc = breadcrumbs.map(b =>
    b.href ? `<a href="${b.href}">${escHtml(b.label)}</a>` : `<span>${escHtml(b.label)}</span>`
  ).join(' › ');

  const defaultJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: title,
    description,
    brand: { '@type': 'Organization', name: 'Your Deputy', url: 'https://www.yourdeputy.com' },
    url: `https://www.yourdeputy.com${canonical}`,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
  };

  const finalJsonLd = jsonLd || defaultJsonLd;

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: b.label,
      item: b.href ? `https://www.yourdeputy.com${b.href}` : undefined,
    })).filter(item => item.item || item.position === breadcrumbs.length),
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(description)}">
<link rel="canonical" href="https://www.yourdeputy.com${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(description)}">
<meta property="og:url" content="https://www.yourdeputy.com${canonical}">
<meta property="og:site_name" content="Your Deputy">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(title)}">
<meta name="twitter:description" content="${escHtml(description)}">
<meta property="og:image" content="https://www.yourdeputy.com/og-default.png">
<meta name="twitter:image" content="https://www.yourdeputy.com/og-default.png">
<meta name="theme-color" content="#4da3ff">
<script type="application/ld+json">${JSON.stringify(finalJsonLd)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd)}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Dynasty Empire LLC","url":"https://www.yourdeputy.com","brand":{"@type":"Brand","name":"Your Deputy"},"contactPoint":{"@type":"ContactPoint","contactType":"sales","url":"https://www.yourdeputy.com/contact"}}</script>
<style>${CSS}</style>
</head>
<body>
<a href="#main" class="skip-link">Skip to main content</a>
<div class="wrap">
<nav class="breadcrumb" aria-label="Breadcrumb">${bc}</nav>
<main id="main">${body}</main>
<footer>© 2026 Dynasty Empire LLC · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/marketplace">Marketplace</a> · <a href="/marketplace#faq">FAQ</a> · <a href="mailto:support@yourdeputy.com">Support</a></footer>
</div>
</body>
</html>`;
}

// ── Automation description generator ──────────────────────────────────────────

const STEP_DESCRIPTIONS = {
  http: 'connects to an external service',
  email: 'sends an email',
  sms: 'sends a text message',
  crm_contact: 'updates the customer record',
  if: 'checks conditions and routes accordingly',
  notify: 'sends a team notification',
  extract: 'pulls key details from the incoming data',
  set: 'prepares data for the next step',
  wait: 'pauses for the right timing',
  switch: 'routes to different actions based on criteria',
  log: 'records the activity for reporting',
  code: 'runs custom business logic',
  webhook: 'receives an incoming event',
  loop: 'repeats for multiple items',
  db: 'updates the database',
  transform: 'transforms data between formats',
};

function generateAutomationDescription(steps) {
  if (!steps || steps.length === 0) return 'A multi-step workflow automation for service businesses.';

  const descriptions = [];
  for (const step of steps) {
    const desc = STEP_DESCRIPTIONS[step.t] || `performs a ${step.t} action`;
    descriptions.push(desc);
  }

  if (descriptions.length === 1) {
    return `When triggered, this workflow ${descriptions[0]}.`;
  }

  const joined = descriptions.slice(0, -1).join(', ');
  return `When triggered, this workflow ${joined}, and finally ${descriptions[descriptions.length - 1]}.`;
}

// ── Status label mapping ─────────────────────────────────────────────────────

const STATUS_LABELS = {
  spec: 'Coming soon',
  implemented: 'In testing',
  validated: 'Verified',
  deployable: 'Available',
  live: 'Live'
};

function getStatusBadge(status) {
  const label = STATUS_LABELS[status] || status;
  const className = status === 'spec' ? 'status-badge-coming' :
                     status === 'implemented' ? 'status-badge-testing' :
                     status === 'validated' ? 'status-badge-available' :
                     status === 'deployable' || status === 'live' ? 'status-badge-available' : '';
  return `<span class="status-badge ${className}">${escHtml(label)}</span>`;
}

// ── Module pages (20) ────────────────────────────────────────────────────────

function generateModulePage(mod) {
  const s = slug(mod.name);
  const caps = (mod.capabilities_required || []).map(c => escHtml(c)).join(', ') || 'All integrations';
  const verts = (mod.recommended_for_blueprints || []).map(b => {
    const bp = blueprintsByCode[b] || blueprintsByCode[b.replace(/-/g, '_')];
    return bp ? escHtml(bp.name) : escHtml(b);
  }).join(', ') || 'All verticals';

  const settings = (mod.configurable_settings || []).map(s =>
    `<tr><td><strong>${escHtml(s.label)}</strong></td><td>${escHtml(s.type)}</td><td>${s.default !== undefined ? escHtml(String(s.default)) : '—'}</td></tr>`
  ).join('\n');

  const relatedModules = [...(mod.upsell_from || []), ...(mod.upsell_to || [])].filter(Boolean).slice(0, 6);
  const relatedHtml = relatedModules.map(code => {
    const rm = modulesByCode[code];
    if (!rm) return '';
    return `<a href="/automations/modules/${slug(rm.name)}" class="card-sm" title="View ${escHtml(rm.name)} module">
      <h3>${escHtml(rm.name)}</h3>
      <p>${escHtml(rm.description_short || rm.outcome || '')}</p>
      <div class="meta">$${rm.price_monthly}/mo</div>
    </a>`;
  }).filter(Boolean).join('\n');

  const kpis = (mod.kpis || []).map(k => `<li>${escHtml(k.replace(/_/g, ' '))}</li>`).join('\n');
  const actions = (mod.actions || []).map(a => `<li>${escHtml(a.replace(/_/g, ' '))}</li>`).join('\n');

  // CXL: Value proposition as headline
  const valueProp = `${escHtml(mod.name)}: ${escHtml(mod.outcome || mod.description_short || 'Streamline your service delivery')}`;

  const body = `
<article>
<div class="hero-section">
  <div class="pills">
    <span class="pill pill-accent">${escHtml(mod.category)}</span>
    ${mod.status ? getStatusBadge(mod.status) : '<span class="pill pill-success">Available</span>'}
    <span class="pill">${escHtml(mod.activation_type || 'Instant')} activation</span>
    ${(mod.compliance_flags || []).map(f => `<span class="pill pill-warn">${escHtml(f)}</span>`).join('')}
  </div>
  <h1>${valueProp}</h1>
  <p class="tagline">${escHtml(mod.description_short || mod.outcome || 'Automate your workflow and save time every day.')}</p>
  <div class="price-tag">$${mod.price_monthly}<span>/mo per client</span></div>
  <a href="/dashboard" class="btn" style="margin-top:16px">Activate Now</a>
  <p class="reassurance">30-day money-back guarantee · Cancel anytime · Works with Jobber, Housecall Pro, ServiceTitan, and more</p>
</div>

<div class="section" aria-labelledby="who-this-is-for">
  <h2 id="who-this-is-for">Who This Is For</h2>
  <div class="two-col">
    <div>
      <h3>Industries</h3>
      <p>${verts}</p>
    </div>
    <div>
      <h3>Roles</h3>
      <p>${(mod.recommended_for_personas || []).map(p => escHtml(p.replace(/-/g, ' '))).join(', ') || 'All team members'}</p>
    </div>
  </div>
</div>

<div class="section" aria-labelledby="how-it-works">
  <h2 id="how-it-works">How It Works</h2>
  <p style="margin-bottom:12px"><strong>Trigger:</strong> <code>${escHtml(mod.trigger?.event || 'manual')}</code></p>
  ${mod.trigger?.conditions ? `<p style="margin-bottom:12px"><strong>Conditions:</strong> <code>${escHtml(JSON.stringify(mod.trigger.conditions))}</code></p>` : ''}
  ${actions ? `<p style="margin-bottom:8px"><strong>Actions performed:</strong></p><ol class="steps-list">${actions}</ol>` : ''}
</div>

${settings ? `<div class="section" aria-labelledby="configuration">
  <h2 id="configuration">Configuration</h2>
  <table><thead><tr><th>Setting</th><th>Type</th><th>Default</th></tr></thead><tbody>${settings}</tbody></table>
</div>` : ''}

${kpis ? `<div class="section" aria-labelledby="key-metrics">
  <h2 id="key-metrics">Key Metrics</h2>
  <ul>${kpis}</ul>
</div>` : ''}

${relatedHtml ? `<div class="section" aria-labelledby="related-modules">
  <h2 id="related-modules">Related Modules</h2>
  <div class="card-grid">${relatedHtml}</div>
</div>` : ''}

<div class="trust-bar" aria-label="Trust signals">
  <strong>Works with your existing tools.</strong> Jobber, Housecall Pro, ServiceTitan, and more. 30-day money-back guarantee · Cancel anytime · <a href="/marketplace#faq">FAQ</a> · <a href="mailto:support@yourdeputy.com">Need help?</a>
  <div style="margin-top:12px;display:flex;gap:12px;flex-wrap:wrap;font-size:11px;">
    <span>⭐ <strong>4.8/5</strong> avg rating</span>
    <span>✓ <strong>2,000+</strong> workflows activated</span>
    <span>🛡️ SOC 2 Compliant</span>
    <span>🔒 256-bit SSL</span>
  </div>
</div>

<div class="cta-bar">
  <h3>Activate ${escHtml(mod.name)}</h3>
  <p>$${mod.price_monthly}/mo per client · Cancel anytime · 30-day money-back guarantee</p>
  <a href="/dashboard" class="btn">Activate Now</a>
</div>
</article>`;

  const desc = `${escHtml(mod.name)}: ${(mod.description_short || mod.outcome || 'Automation module for service businesses').substring(0, 120)}`;
  const canonical = `/automations/modules/${s}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: mod.name,
    description: desc,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: mod.price_monthly,
      priceCurrency: 'USD',
      priceValidUntil: '2027-12-31'
    }
  };

  return {
    html: page({
      title: `${mod.name} | Your Deputy`,
      description: desc,
      canonical,
      breadcrumbs: [
        { label: 'Marketplace', href: '/marketplace' },
        { label: 'Modules', href: '/automations/modules' },
        { label: mod.name },
      ],
      body,
      jsonLd
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
    `<a href="/automations/modules/${slug(m.name)}" class="card-sm" title="View ${escHtml(m.name)} module">
      <h3>${escHtml(m.name)}</h3>
      <p>${escHtml(m.description_short || m.outcome || '')}</p>
      <div class="meta">$${m.price_monthly}/mo</div>
    </a>`
  ).join('\n');

  const standaloneTotal = mods.reduce((sum, m) => sum + (m.price_monthly || 0), 0);
  const savings = bundle.implied_savings_monthly || (standaloneTotal - bundle.price_monthly);

  const verts = (bundle.recommended_for_blueprints || []).map(b => {
    const bp = blueprintsByCode[b] || blueprintsByCode[b.replace(/-/g, '_')];
    return bp ? escHtml(bp.name) : escHtml(b);
  }).join(', ') || 'All verticals';

  // CXL: Tagline as value prop
  const valueProp = escHtml(bundle.tagline || bundle.name);

  const body = `
<article>
<div class="hero-section">
  <div class="pills">
    <span class="pill pill-success">Outcome Pack</span>
    <span class="pill">${mods.length} modules</span>
    ${savings > 0 ? `<span class="pill pill-success">Save $${savings}/mo</span>` : ''}
  </div>
  <h1>${escHtml(bundle.name)}</h1>
  <p class="tagline" style="font-style:italic;margin:12px 0;font-size:18px">${valueProp}</p>
  <p class="tagline">${escHtml(bundle.description || 'Achieve measurable business results with coordinated automations.')}</p>
  <div class="price-tag">$${bundle.price_monthly}<span>/mo per client</span></div>
  <p style="color:var(--muted);font-size:13px;margin-top:8px"><strong>Save $${savings}/mo vs. $${standaloneTotal}/mo</strong> if purchased individually</p>
  <a href="/dashboard" class="btn" style="margin-top:16px">Activate Pack</a>
  <p class="reassurance">30-day money-back guarantee · Cancel anytime · Works with Jobber, Housecall Pro, ServiceTitan, and more</p>
</div>

<div class="section" aria-labelledby="business-outcome">
  <h2 id="business-outcome">Business Outcome</h2>
  <p>${escHtml(bundle.outcome || 'Achieve measurable business results with a coordinated set of automations.')}</p>
  ${bundle.hero_kpi ? `<p style="margin-top:12px"><strong>Hero KPI:</strong> ${escHtml(bundle.hero_kpi.replace(/_/g, ' '))}</p>` : ''}
</div>

<div class="section" aria-labelledby="whats-included">
  <h2 id="whats-included">What's Included (${mods.length} modules)</h2>
  <div class="card-grid">${moduleCards}</div>
</div>

<div class="section" aria-labelledby="bundle-who-for">
  <h2 id="bundle-who-for">Who This Is For</h2>
  <div class="two-col">
    <div>
      <h3>Industries</h3>
      <p>${verts}</p>
    </div>
    <div>
      <h3>Roles</h3>
      <p>${(bundle.recommended_for_personas || []).map(p => escHtml(p.replace(/-/g, ' '))).join(', ') || 'All team members'}</p>
    </div>
  </div>
</div>

<div class="trust-bar" aria-label="Trust signals">
  <strong>Works with your existing tools.</strong> Jobber, Housecall Pro, ServiceTitan, and more. 30-day money-back guarantee · Cancel anytime · <a href="/marketplace#faq">FAQ</a> · <a href="mailto:support@yourdeputy.com">Need help?</a>
  <div style="margin-top:12px;display:flex;gap:12px;flex-wrap:wrap;font-size:11px;">
    <span>⭐ <strong>4.8/5</strong> avg rating</span>
    <span>✓ <strong>2,000+</strong> workflows activated</span>
    <span>🛡️ SOC 2 Compliant</span>
    <span>🔒 256-bit SSL</span>
  </div>
</div>

<div class="cta-bar">
  <h3>Get the ${escHtml(bundle.name)}</h3>
  <p>$${bundle.price_monthly}/mo per client · ${mods.length} modules included · Cancel anytime</p>
  <a href="/dashboard" class="btn">Activate Pack</a>
</div>
</article>`;

  const desc = `${bundle.name}: ${(bundle.tagline || bundle.description || 'Automation pack for service businesses').substring(0, 120)}`;
  const canonical = `/automations/packs/${s}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: bundle.name,
    description: desc,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: bundle.price_monthly,
      priceCurrency: 'USD',
      priceValidUntil: '2027-12-31'
    }
  };

  return {
    html: page({
      title: `${bundle.name} — Automation Pack | Your Deputy`,
      description: desc,
      canonical,
      breadcrumbs: [
        { label: 'Marketplace', href: '/marketplace' },
        { label: 'Packs', href: '/automations/packs' },
        { label: bundle.name },
      ],
      body,
      jsonLd
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
    return `<a href="/automations/a/${slug(a.name)}-${a.id.replace(/\./g, '-')}" class="card-sm" title="View ${escHtml(a.name)} automation">
      <h3>${escHtml(a.name)}</h3>
      <p><code>${escHtml(a.trigger)}</code> · ${a.steps?.length || 0} steps</p>
      <div class="meta">${pkgs.length ? pkgs.map(p => escHtml(p)).join(', ') : 'Add-on'}</div>
    </a>`;
  }).join('\n');

  // Nielsen: Real world language for category
  const categoryHeadline = `${autos.length} ready-to-deploy ${catName.toLowerCase()} automations`;

  const body = `
<article>
<div class="hero-section">
  <div class="pills">
    <span class="pill pill-accent">Category</span>
    <span class="pill">${autos.length} automations</span>
  </div>
  <h1>${categoryHeadline}</h1>
  <p class="tagline">Find the right ${catName.toLowerCase()} workflow for your service business. All automations integrate seamlessly with Jobber, Housecall Pro, ServiceTitan, and more.</p>
  <a href="/dashboard" class="btn" style="margin-top:16px">Get Started</a>
</div>

<div class="section" aria-labelledby="all-automations">
  <h2 id="all-automations">All Automations in ${escHtml(catName)}</h2>
  <div class="card-grid">${autoCards}</div>
</div>

<div class="trust-bar">
  <strong>Works with your existing tools.</strong> Jobber, Housecall Pro, ServiceTitan, and more. One-click activation · 30-day money-back guarantee.
</div>

<div class="cta-bar">
  <h3>Ready to automate ${catName.toLowerCase()}?</h3>
  <p>Pick the automations you need. Activate in seconds. Let Your Deputy do the work.</p>
  <a href="/dashboard" class="btn">Get Started</a>
</div>
</article>`;

  const desc = `${autos.length} ${catName.toLowerCase()} automations for service businesses. Trigger-based workflows that work with Jobber, Housecall Pro, ServiceTitan.`;
  const canonical = `/automations/categories/${s}`;

  return {
    html: page({
      title: `${catName} Automations | Your Deputy`,
      description: desc.substring(0, 155),
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
  const s = `${slug(auto.name)}-${auto.id.replace(/\./g, '-')}`;
  const pkgs = getPackagesForAutomation(auto.id);
  const steps = auto.steps || [];

  const stepTypes = {
    http: 'API Call',
    if: 'Condition',
    email: 'Send Email',
    sms: 'Send SMS',
    crm_contact: 'CRM Update',
    notify: 'Notification',
    log: 'Log Event',
    code: 'Custom Logic',
    extract: 'Extract Data',
    set: 'Set Variable',
    switch: 'Route',
    wait: 'Wait',
    loop: 'Loop',
    webhook: 'Webhook',
    db: 'Database',
    transform: 'Transform',
  };

  const stepsHtml = steps.map(step => {
    const typeName = stepTypes[step.t] || step.t;
    const detail = step.name || step.template || step.msg || step.path || '';
    return `<li><strong>${escHtml(typeName)}</strong>${detail ? `: ${escHtml(detail)}` : ''}</li>`;
  }).join('\n');

  // Find related automations in same category
  const siblings = (automationsByCat[auto.cat] || []).filter(a => a.id !== auto.id).slice(0, 6);
  const siblingCards = siblings.map(a =>
    `<a href="/automations/a/${slug(a.name)}-${a.id.replace(/\./g, '-')}" class="card-sm" title="View ${escHtml(a.name)} automation">
      <h3>${escHtml(a.name)}</h3>
      <p>${a.steps?.length || 0} steps · ${escHtml(a.trigger)}</p>
    </a>`
  ).join('\n');

  const autoDesc = generateAutomationDescription(steps);

  const body = `
<article>
<div class="hero-section">
  <div class="pills">
    <span class="pill pill-accent">${escHtml(catName)}</span>
    <span class="pill">${escHtml(auto.trigger)}</span>
    ${auto.cron ? `<span class="pill">${escHtml(auto.cron)}</span>` : ''}
    ${pkgs.map(p => `<span class="pill pill-success">${escHtml(p)}</span>`).join('')}
    <span class="pill">${steps.length} steps</span>
  </div>
  <h1>${escHtml(auto.name)}</h1>
  <p class="tagline">${autoDesc}</p>
  <a href="/dashboard" class="btn" style="margin-top:16px">Activate Now</a>
  <p class="reassurance">30-day money-back guarantee · Cancel anytime · Works with Jobber, Housecall Pro, ServiceTitan</p>
</div>

<div class="section" aria-labelledby="what-this-does">
  <h2 id="what-this-does">What This Does</h2>
  <p>${autoDesc}</p>
</div>

<div class="section" aria-labelledby="workflow-steps">
  <h2 id="workflow-steps">Workflow Steps</h2>
  <ol class="steps-list">${stepsHtml}</ol>
</div>

<div class="two-col">
  <div class="section" aria-labelledby="trigger-details">
    <h2 id="trigger-details">Trigger Details</h2>
    <p><strong>Type:</strong> <code>${escHtml(auto.trigger)}</code></p>
    ${auto.cron ? `<p style="margin-top:8px"><strong>Schedule:</strong> <code>${escHtml(auto.cron)}</code></p>` : '<p style="margin-top:8px">Fires on incoming event</p>'}
  </div>
  <div class="section" aria-labelledby="included-in">
    <h2 id="included-in">Included In</h2>
    ${pkgs.length ? `<div class="pills">${pkgs.map(p => `<span class="pill pill-success">${escHtml(p)}</span>`).join('')}</div>` : '<p style="color:var(--muted)">Available as add-on to all packs</p>'}
  </div>
</div>

${siblingCards ? `<div class="section" aria-labelledby="more-in-category">
  <h2 id="more-in-category">More in ${escHtml(catName)}</h2>
  <div class="card-grid">${siblingCards}</div>
</div>` : ''}

<div class="trust-bar" aria-label="Trust signals">
  <strong>Works with your existing tools.</strong> Jobber, Housecall Pro, ServiceTitan, and more. 30-day money-back guarantee · Cancel anytime · <a href="/marketplace#faq">FAQ</a> · <a href="mailto:support@yourdeputy.com">Need help?</a>
  <div style="margin-top:12px;display:flex;gap:12px;flex-wrap:wrap;font-size:11px;">
    <span>⭐ <strong>4.8/5</strong> avg rating</span>
    <span>✓ <strong>2,000+</strong> workflows activated</span>
    <span>🛡️ SOC 2 Compliant</span>
    <span>🔒 256-bit SSL</span>
  </div>
</div>

<div class="cta-bar">
  <h3>Activate This Automation</h3>
  <p>Part of Your Deputy — the automation platform for service businesses.</p>
  <a href="/dashboard" class="btn">Get Started</a>
</div>
</article>`;

  const desc = `${auto.name}: ${autoDesc.substring(0, 100)} - Service business automation platform`;
  const canonical = `/automations/a/${s}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: auto.name,
    description: desc,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web'
  };

  return {
    html: page({
      title: `${auto.name} | Your Deputy`,
      description: desc.substring(0, 155),
      canonical,
      breadcrumbs: [
        { label: 'Marketplace', href: '/marketplace' },
        { label: catName, href: `/automations/categories/${catSlug}` },
        { label: auto.name },
      ],
      body,
      jsonLd
    }),
    path: join(OUT, 'a', `${s}.html`),
    slug: s,
  };
}

// ── Index pages ──────────────────────────────────────────────────────────────

function generateModulesIndex() {
  const cards = modules.map(m =>
    `<a href="/automations/modules/${slug(m.name)}" class="card-sm" title="View ${escHtml(m.name)} module">
      <h3>${escHtml(m.name)}</h3>
      <p>${escHtml(m.description_short || m.outcome || '')}</p>
      <div class="meta">$${m.price_monthly}/mo</div>
    </a>`
  ).join('\n');

  const body = `
<article>
<div class="hero-section">
  <h1>Automation Modules</h1>
  <p class="tagline">Pick exactly what you need. ${modules.length} individual modules at $19/mo each. Works with Jobber, Housecall Pro, ServiceTitan, and more.</p>
</div>
<div class="section"><div class="card-grid">${cards}</div></div>
</article>`;

  return page({
    title: 'Automation Modules — Individual Workflows | Your Deputy',
    description: `${modules.length} individual automation modules for service businesses. $19/mo each. Integrate with Jobber, Housecall Pro, ServiceTitan.`,
    canonical: '/automations/modules',
    breadcrumbs: [
      { label: 'Marketplace', href: '/marketplace' },
      { label: 'Modules' }
    ],
    body,
  });
}

function generatePacksIndex() {
  const cards = bundles.map(b =>
    `<a href="/automations/packs/${slug(b.name)}" class="card-sm" title="View ${escHtml(b.name)} pack">
      <h3>${escHtml(b.name)}</h3>
      <p>${escHtml(b.tagline || b.description || '')}</p>
      <div class="meta">$${b.price_monthly}/mo · ${(b.modules || []).length} modules</div>
    </a>`
  ).join('\n');

  const body = `
<article>
<div class="hero-section">
  <h1>Outcome Packs</h1>
  <p class="tagline">${bundles.length} curated outcome packs. Get related automations bundled at a discount. Works with Jobber, Housecall Pro, ServiceTitan, and more.</p>
</div>
<div class="section"><div class="card-grid">${cards}</div></div>
</article>`;

  return page({
    title: 'Outcome Packs — Automation Bundles | Your Deputy',
    description: `${bundles.length} outcome-focused automation bundles. Save money with combined modules. Works with Jobber, Housecall Pro, ServiceTitan.`,
    canonical: '/automations/packs',
    breadcrumbs: [
      { label: 'Marketplace', href: '/marketplace' },
      { label: 'Packs' }
    ],
    body,
  });
}

function generateCategoriesIndex() {
  const cards = Object.entries(CATEGORIES).map(([num, name]) => {
    const count = (automationsByCat[num] || []).length;
    return `<a href="/automations/categories/${slug(name)}" class="card-sm" title="View ${escHtml(name)} automations">
      <h3>${escHtml(name)}</h3>
      <p>${count} automations</p>
    </a>`;
  }).join('\n');

  const body = `
<article>
<div class="hero-section">
  <h1>Automation Categories</h1>
  <p class="tagline">Browse ${Object.keys(CATEGORIES).length} categories of ${AUTOMATIONS.length} automations. Find the right workflow for every part of your service business.</p>
</div>
<div class="section"><div class="card-grid">${cards}</div></div>
</article>`;

  return page({
    title: 'Automation Categories | Your Deputy',
    description: `Browse ${Object.keys(CATEGORIES).length} automation categories with ${AUTOMATIONS.length} workflows for service businesses. Find what you need.`,
    canonical: '/automations/categories',
    breadcrumbs: [
      { label: 'Marketplace', href: '/marketplace' },
      { label: 'Categories' }
    ],
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

console.log(`\nSuccess! Generated ${count} pages in public/automations/`);
console.log(`  - 3 index pages (modules, packs, categories)`);
console.log(`  - ${modules.length} module pages`);
console.log(`  - ${bundles.length} pack pages`);
console.log(`  - ${Object.keys(CATEGORIES).length} category pages`);
console.log(`  - ${AUTOMATIONS.length} automation pages`);
