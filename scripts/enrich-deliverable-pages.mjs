import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const deliverablesDir = path.join(root, 'deliverables');
const publicDeliverablesDir = path.join(root, 'public', 'deliverables');

const categoryMeta = {
  strategy: { label: 'Strategy & Business Planning', icon: '01', package: 'Strategy Pack', value: 'decision-grade planning' },
  legal: { label: 'Legal & Compliance Templates', icon: '02', package: 'Strategy Pack', value: 'attorney-review-ready drafts' },
  frontend: { label: 'Frontend Code', icon: '03', package: 'Foundation', value: 'customer-facing product experience' },
  backend: { label: 'Backend, Infrastructure & Configuration', icon: '04', package: 'Foundation', value: 'deployable application backbone' },
  financial: { label: 'Financial Planning & Modeling', icon: '05', package: 'Strategy Pack', value: 'funding and operating clarity' },
  marketing: { label: 'Marketing & Growth', icon: '06', package: 'Strategy Pack', value: 'distribution-ready growth assets' },
  operations: { label: 'Operations & Team', icon: '07', package: 'Strategy Pack', value: 'repeatable operating discipline' },
  technical: { label: 'Technical Docs', icon: '08', package: 'Foundation', value: 'developer and operator handoff' },
  testing: { label: 'Testing & QA', icon: '09', package: 'Foundation', value: 'quality gates and launch confidence' },
  'launch-kit': { label: 'Day-1 Launch Kit', icon: '10', package: 'Foundation', value: 'owner-ready activation' },
};

const inventorySectionToCategory = {
  strategy: 'strategy',
  legal: 'legal',
  frontend: 'frontend',
  backend: 'backend',
  financial: 'financial',
  marketing: 'marketing',
  operations: 'operations',
  techdocs: 'technical',
  testing: 'testing',
  launch: 'launch-kit',
};

const categoryFiles = new Map();

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textFromHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&mdash;/g, '-')
    .replace(/&rarr;/g, '->')
    .replace(/&#8592;/g, '<-')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchOne(html, re, fallback = '') {
  const match = html.match(re);
  return match ? match[1].trim() : fallback;
}

function parseListItems(html) {
  const match = html.match(/<ol>([\s\S]*?)<\/ol>/i);
  if (!match) return [];
  return Array.from(match[1].matchAll(/<li>([\s\S]*?)<\/li>/gi)).map((m) => textFromHtml(m[1]));
}

function buildCategoryFileMap() {
  for (const [category] of Object.entries(categoryMeta)) {
    const categoryPage = path.join(deliverablesDir, `${category}.html`);
    if (!fs.existsSync(categoryPage)) continue;
    const html = fs.readFileSync(categoryPage, 'utf8');
    const map = new Map();
    for (const match of html.matchAll(/<a href="([^"]+)" class="item"[\s\S]*?<div class="file">([\s\S]*?)<\/div>/g)) {
      map.set(textFromHtml(match[2]), match[1]);
    }
    categoryFiles.set(category, map);
  }
}

function enrichInventoryLinks() {
  const inventoryPath = path.join(root, 'deliverables.html');
  let html = fs.readFileSync(inventoryPath, 'utf8');
  for (const [sectionId, category] of Object.entries(inventorySectionToCategory)) {
    const fileMap = categoryFiles.get(category);
    if (!fileMap) continue;
    const start = html.indexOf(`<div class="section" id="${sectionId}">`);
    if (start === -1) continue;
    const next = html.indexOf('\n<!--', start + 1);
    const end = next === -1 ? html.indexOf('<div class="cta-bottom"', start) : next;
    const before = html.slice(0, start);
    let section = html.slice(start, end);
    const after = html.slice(end);
    section = section.replace(/<a href="#main" class="item"([\s\S]*?<div class="file">([\s\S]*?)<\/div>)/g, (full, rest, fileHtml) => {
      const file = textFromHtml(fileHtml);
      const href = fileMap.get(file);
      return href ? `<a href="${href}" class="item"${rest}` : full;
    });
    section = section.replace(
      new RegExp(`<a href="#${sectionId}" style="text-decoration:none;color:inherit;display:block">`),
      `<a href="/deliverables/${category}" style="text-decoration:none;color:inherit;display:block">`,
    );
    html = before + section + after;
  }
  html = html
    .replace('across 10 categories', 'across 10 categories, with a dedicated landing page for every deliverable')
    .replace('<div class="ct"><div class="n">120+</div><div class="l">Total files</div></div>', '<div class="ct"><div class="n">150+</div><div class="l">Item pages</div></div>');
  fs.writeFileSync(inventoryPath, html);
}

function buildItemPage({ category, slug, title, file, short, detail, inside, prevNext }) {
  const meta = categoryMeta[category] || { label: category, icon: 'YD', package: 'Foundation', value: 'launch readiness' };
  const source = `item_${category}_${slug}`;
  const insideHtml = inside.map((item) => `<li>${esc(item)}</li>`).join('\n');
  const proofCards = [
    ['Generated from your business', `The page is not a generic description of ${esc(file)}. Dynasty uses your niche, target customer, location, business model, primary offer, and secondary offers to shape the content and keep the artifact relevant.`],
    ['Connected to the operating system', `This deliverable is designed to work with the rest of the autonomous business unit: website, funnel, CRM, RevOps, payments, onboarding, support, PostHog-ready analytics, AI/MCP tools, open-weight model routing, optional video assets, provider abstractions, workflows, repair telemetry, and self-hostable infrastructure.`],
    ['Built for review and action', `The output is written so an owner, operator, developer, advisor, lender, or implementation partner can understand what to do next without decoding raw generator output.`],
  ].map(([h, p]) => `<article class="proof-card"><h2>${h}</h2><p>${p}</p></article>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} - ${esc(meta.label)} - Your Deputy</title>
<meta name="description" content="${esc(`${title} is a ${meta.value} deliverable generated for each Your Deputy autonomous business-unit build.`)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://www.yourdeputy.com/deliverables/${category}/${slug}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/site-shell.css">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Service",
  "name": ${JSON.stringify(title)},
  "serviceType": "Autonomous business-unit deliverable",
  "provider": { "@type": "Organization", "name": "Your Deputy", "url": "https://www.yourdeputy.com" },
  "areaServed": "United States",
  "description": ${JSON.stringify(short)}
}
</script>
<style>
:root{--gold:#C9A84C;--ink:#09090B;--card:#1E1E2A;--card2:#15151D;--bdr:rgba(255,255,255,.12);--tx:#FAFAF9;--sub:#A1A1AA;--dim:#8A8A8A;--grn:#22C55E}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0C0C14;color:var(--tx);font-family:'DM Sans',system-ui,sans-serif;font-size:15px;line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:var(--gold);text-decoration:none}a:hover{text-decoration:underline}
:focus-visible{outline:2px solid var(--gold);outline-offset:2px;border-radius:4px}
.skip:focus{position:fixed!important;left:16px;top:16px;width:auto!important;height:auto!important;overflow:visible!important;z-index:9999}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
.crumbs{font-size:13px;color:var(--dim);padding:28px 0 8px}
.crumbs a{color:var(--sub);margin-right:8px}
.hero{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:32px;align-items:center;padding:44px 0 30px}
.eyebrow{display:inline-flex;gap:8px;align-items:center;color:var(--gold);font-size:12px;text-transform:uppercase;letter-spacing:.12em;font-weight:700;margin-bottom:14px}
.mark{width:34px;height:34px;border-radius:10px;background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.28);display:inline-flex;align-items:center;justify-content:center;color:var(--gold);letter-spacing:0}
h1{font-family:'Playfair Display',serif;font-size:clamp(36px,6vw,68px);line-height:.98;font-weight:500;letter-spacing:-.03em;margin-bottom:18px}
.lead{font-size:18px;color:var(--sub);max-width:760px}
.file-pill{display:inline-flex;align-items:center;margin-top:18px;padding:8px 12px;border:1px solid var(--bdr);border-radius:999px;color:var(--sub);font-family:'SF Mono','Fira Code',monospace;font-size:12px;background:rgba(255,255,255,.03)}
.hero-card{background:linear-gradient(145deg,rgba(201,168,76,.10),rgba(255,255,255,.025));border:1px solid rgba(201,168,76,.24);border-radius:18px;padding:24px;box-shadow:0 20px 70px rgba(0,0,0,.35)}
.hero-card h2{font-size:14px;color:var(--gold);text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px}
.hero-card p{color:var(--sub);font-size:14px;margin-bottom:18px}
.cta-row{display:flex;gap:10px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;transition:all .18s;font-family:inherit;border:1px solid var(--bdr)}
.btn:hover{transform:translateY(-1px);box-shadow:0 8px 28px rgba(0,0,0,.32);text-decoration:none}
.btn-primary{background:var(--gold);color:#09090B;border-color:var(--gold)}
.btn-secondary{background:rgba(201,168,76,.10);border-color:rgba(201,168,76,.35);color:var(--gold)}
.btn-ghost{background:transparent;color:var(--sub)}
.section{padding:34px 0;border-top:1px solid rgba(255,255,255,.07)}
.section h2{font-size:22px;margin-bottom:10px}
.section p{color:var(--sub);max-width:850px}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:18px}
.proof-card,.use-card{background:var(--card);border:1px solid var(--bdr);border-radius:14px;padding:18px}
.proof-card h2,.use-card h3{font-size:15px;color:var(--tx);margin-bottom:8px}
.proof-card p,.use-card p{font-size:13.5px;color:var(--sub)}
.inside{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}
.inside li{list-style:none;background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:12px 14px;color:var(--sub);font-size:13.5px}
.inside li::before{content:'✓';color:var(--gold);font-weight:800;margin-right:8px}
.process{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:18px}
.step{background:var(--card2);border:1px solid var(--bdr);border-radius:14px;padding:16px}
.step strong{display:block;color:var(--gold);font-size:12px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:7px}
.step p{font-size:13px;color:var(--sub)}
.note{background:rgba(255,255,255,.035);border:1px solid var(--bdr);border-radius:14px;padding:18px;color:var(--sub);font-size:13px;margin-top:18px}
.bottom-nav{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:30px 0 46px}
.bottom-nav a{font-size:13px;color:var(--sub)}
@media(max-width:900px){.hero{grid-template-columns:1fr}.grid,.process{grid-template-columns:1fr 1fr}.inside{grid-template-columns:1fr}}
@media(max-width:640px){.wrap{padding:0 16px}.grid,.process{grid-template-columns:1fr}h1{font-size:36px}.hero{padding-top:28px}}
</style>
</head>
<body>
<a href="#main-content" class="skip" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;font-size:14px;padding:8px 16px;background:var(--gold);color:var(--ink);border-radius:8px;font-weight:700">Skip to content</a>
<main id="main-content" role="main">
<div class="wrap">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/deliverables">Deliverables</a> / <a href="/deliverables/${category}">${esc(meta.label)}</a></nav>
<section class="hero" aria-labelledby="deliverable-title">
<div>
<div class="eyebrow"><span class="mark">${esc(meta.icon)}</span>${esc(meta.label)}</div>
<h1 id="deliverable-title">${esc(title)}</h1>
<p class="lead">${esc(short)}. This page explains what the deliverable is, why it matters, what it contains, and how it helps turn a business idea into a revenue-ready, AI-operable, self-hostable operating unit.</p>
<span class="file-pill">${esc(file)}</span>
</div>
<aside class="hero-card" aria-label="Get this deliverable">
<h2>Included in ${esc(meta.package)}</h2>
<p>${esc(title)} is generated as part of the Your Deputy launch package, then connected to the broader business system so it is useful on day one instead of sitting as a disconnected document.</p>
<div class="cta-row">
<a href="/app?plan=foundation&source=${source}_hero" class="btn btn-primary">Start a Foundation build</a>
<a href="/app?plan=strategy_pack&source=${source}_hero" class="btn btn-secondary">Get Strategy Pack</a>
<a href="/quiz?source=${source}_hero" class="btn btn-ghost">Find my path</a>
</div>
</aside>
</section>

<section class="section">
<h2>What this deliverable is</h2>
<p>${esc(detail)} It is written as an implementation-ready asset: specific enough for action, structured enough for review, and connected enough to support the other deliverables, validation gates, workflow events, analytics signals, and customer lifecycle systems in the build.</p>
<div class="grid">${proofCards}</div>
</section>

<section class="section">
<h2>What is inside</h2>
<p>The exact content adapts to the business model, target customer, offer, and launch scope. A typical generated version includes:</p>
<ul class="inside">
${insideHtml}
</ul>
</section>

<section class="section">
<h2>How the builder uses it</h2>
<div class="process">
<div class="step"><strong>1. Interpret</strong><p>The builder extracts the niche, buyer, offer, constraints, and operational assumptions from your brief.</p></div>
<div class="step"><strong>2. Generate</strong><p>The deliverable is produced with business-specific language, concrete sections, and implementation-oriented structure.</p></div>
<div class="step"><strong>3. Validate</strong><p>Quality gates check for placeholder residue, generic copy, missing modules, broken routes, accessibility issues, button containment, and promise-to-artifact drift.</p></div>
<div class="step"><strong>4. Activate</strong><p>The artifact becomes part of your launch package, supporting sales, operations, engineering, governance, customer delivery, analytics, and AI/MCP tooling.</p></div>
</div>
</section>

<section class="section">
<h2>Why it matters before launch</h2>
<div class="grid">
<article class="use-card"><h3>It reduces ambiguity</h3><p>Teams can see the purpose, scope, dependencies, and expected next actions instead of guessing from scattered notes.</p></article>
<article class="use-card"><h3>It improves accountability</h3><p>The deliverable creates a concrete artifact that can be reviewed, improved, tested, and handed to a specialist when needed.</p></article>
<article class="use-card"><h3>It supports revenue readiness</h3><p>Every artifact ultimately supports acquisition, conversion, fulfillment, retention, governance, or operational scale.</p></article>
</div>
<div class="note">Important: legal, tax, compliance, financial, and security artifacts are generated readiness assets, not professional certification or legal advice. Use qualified advisors where required.</div>
</section>

<section class="section" style="text-align:center">
<h2>Get ${esc(title)} with the rest of the launch system.</h2>
<p style="margin-left:auto;margin-right:auto">A single deliverable is useful. The full value comes when this file is generated alongside the website, funnel, CRM, RevOps, payments, onboarding, support, PostHog-ready analytics, AI/MCP tools, model routing, optional media assets, workflow engine, provider abstractions, self-hosted infrastructure, resumable repair telemetry, and validation gates.</p>
<div class="cta-row" style="justify-content:center;margin-top:18px">
<a href="/app?plan=foundation&source=${source}_bottom" class="btn btn-primary">Launch the full business unit</a>
<a href="/deliverables" class="btn btn-ghost">See all deliverables</a>
</div>
</section>

<div class="bottom-nav">${prevNext}</div>
</div>
</main>
<script src="/site-shell.js" defer></script>
</body>
</html>
`;
}

function enrichItemPages() {
  for (const [category] of Object.entries(categoryMeta)) {
    const dir = path.join(deliverablesDir, category);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
      const filePath = path.join(dir, entry.name);
      const html = fs.readFileSync(filePath, 'utf8');
      if (html.includes('class="file-pill"') && html.includes('What this deliverable is')) continue;
      const slug = entry.name.replace(/\.html$/, '');
      const title = textFromHtml(matchOne(html, /<h1>([\s\S]*?)<\/h1>/i, slug));
      const file = textFromHtml(matchOne(html, /<span class="file">([\s\S]*?)<\/span>/i, title));
      const short = textFromHtml(matchOne(html, /<p class="short">([\s\S]*?)<\/p>/i, title));
      const detail = textFromHtml(matchOne(html, /<div class="detail">[\s\S]*?<p>([\s\S]*?)<\/p>/i, short));
      const inside = parseListItems(html);
      const prevNext = matchOne(html, /<div style="display:flex;justify-content:space-between;gap:16px;margin:32px 0 0;flex-wrap:wrap">([\s\S]*?)<\/div>\s*<\/div>\s*<\/main>/i, '');
      fs.writeFileSync(filePath, buildItemPage({ category, slug, title, file, short, detail, inside, prevNext }));
    }
  }
}

function copyPublicTree() {
  fs.rmSync(publicDeliverablesDir, { recursive: true, force: true });
  fs.cpSync(deliverablesDir, publicDeliverablesDir, { recursive: true });
  fs.copyFileSync(path.join(root, 'deliverables.html'), path.join(root, 'public', 'deliverables.html'));
}

buildCategoryFileMap();
enrichInventoryLinks();
enrichItemPages();
copyPublicTree();

console.log('enrich-deliverable-pages: ok');
