import fs from 'node:fs';
import path from 'node:path';
import { buildInstantPackage, listInstantOffers } from '../api/deliverables/_instant.mjs';

const root = process.cwd();
const outDir = path.join(root, 'public', 'live-deliverables');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function mkdir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function layout({ title, description, slugPath = '', body }) {
  const canonical = slugPath
    ? `https://www.yourdeputy.com/live-deliverables/${slugPath}`
    : 'https://www.yourdeputy.com/live-deliverables';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} - Your Deputy Live Deliverables</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<link rel="stylesheet" href="/site-shell.css">
<style>
:root{--gold:#c9a84c;--ink:#09090b;--bg:#0c0c14;--panel:#171720;--card:#22222c;--line:rgba(255,255,255,.13);--text:#fafaf9;--muted:#a1a1aa;--ok:#22c55e;--blue:#60a5fa}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.6}
a{color:var(--gold);font-weight:800;text-decoration:none}
a:hover{text-decoration:underline}
main{max-width:1120px;margin:0 auto;padding:92px 20px 60px}
.hero{padding:20px 0 28px;border-bottom:1px solid rgba(255,255,255,.08)}
.eyebrow{color:var(--gold);font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:900;margin-bottom:12px}
h1{font-size:clamp(36px,6vw,68px);line-height:1;margin:0 0 14px;letter-spacing:0}
h2{font-size:clamp(24px,4vw,38px);line-height:1.08;margin:0 0 10px;letter-spacing:0}
h3{font-size:17px;margin:0 0 8px}
p{color:var(--muted);margin:0 0 14px}
.lead{font-size:20px;max-width:840px}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:18px}
.grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
.card,.panel{border:1px solid var(--line);background:rgba(255,255,255,.035);border-radius:10px;padding:18px}
.panel{background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.02));padding:22px}
.tag{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:5px 9px;color:var(--muted);font-size:12px;font-weight:800;margin-bottom:8px}
.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
.btn{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:9px;padding:11px 15px;font-weight:900;text-align:center}
.btn.primary{background:var(--gold);color:var(--ink);border-color:var(--gold)}
.section{padding:30px 0;border-top:1px solid rgba(255,255,255,.08)}
.receipt{display:grid;gap:8px;margin-top:14px}
.receipt div{display:flex;justify-content:space-between;gap:14px;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:7px;color:var(--muted);font-size:13px}
.receipt strong{color:var(--text)}
.file{background:#09090f;border:1px solid var(--line);border-radius:10px;padding:14px;overflow:auto}
.file pre{white-space:pre-wrap;color:#d4d4d8;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;margin:0}
.list{margin:10px 0 0;padding-left:18px;color:var(--muted)}
.list li{margin:5px 0}
.matrix{display:grid;grid-template-columns:170px minmax(0,1fr);gap:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-top:16px}
.matrix div{padding:11px 13px;border-bottom:1px solid rgba(255,255,255,.08)}
.matrix div:nth-child(odd){background:rgba(255,255,255,.045);font-weight:900;color:var(--text)}
.matrix div:nth-child(even){color:var(--muted)}
@media(max-width:860px){main{padding-top:82px}.grid,.grid.two,.matrix{grid-template-columns:1fr}.actions .btn{width:100%}}
</style>
</head>
<body>
<main id="main-content">
${body}
</main>
<script src="/site-shell.js" defer></script>
</body>
</html>
`;
}

function offerCard(offer) {
  return `<article class="card">
  <span class="tag">${esc(offer.type)} - ${esc(offer.price_label)}</span>
  <h3>${esc(offer.name)}</h3>
  <p>${esc(offer.outcome)}</p>
  <p><a href="/live-deliverables/${esc(offer.id)}">Open full live deliverable</a></p>
</article>`;
}

function buildIndex(offers) {
  const groups = new Map();
  for (const offer of offers) {
    if (!groups.has(offer.type)) groups.set(offer.type, []);
    groups.get(offer.type).push(offer);
  }
  const sections = [...groups.entries()]
    .map(
      ([type, items]) => `<section class="section">
  <h2>${esc(type.replace(/_/g, ' '))}</h2>
  <div class="grid">${items.map(offerCard).join('\n')}</div>
</section>`,
    )
    .join('\n');
  return layout({
    title: 'Live Deliverables',
    description: 'Full live deliverable examples for every Your Deputy offer, module, pack, suite, edition, setup path, and launch package.',
    body: `<section class="hero">
  <div class="eyebrow">Sales-proof deliverables</div>
  <h1>Full live examples for every offer.</h1>
  <p class="lead">These are complete example packages, not click-through demos. Each page shows the smallest finished deliverable a customer can receive immediately after signup, plus the instant package API used to generate it.</p>
  <div class="actions">
    <a class="btn primary" href="/api/deliverables/instant?list=1">Open instant package API</a>
    <a class="btn" href="/deliverables">Compare artifact inventory</a>
    <a class="btn" href="/maturity">Read delivery boundaries</a>
  </div>
</section>
<section class="section">
  <div class="grid three">
    <article class="card"><h3>Instant handoff</h3><p>Every package includes START-HERE, manifest, outcome brief, workflow, acceptance tests, and receipt.</p></article>
    <article class="card"><h3>No manual creation step</h3><p>The package API returns a usable deliverable immediately. Vendor account setup remains customer-owned when credentials are required.</p></article>
    <article class="card"><h3>Customer-ready proof</h3><p>Use these pages in sales calls to show exactly what a buyer receives for each SKU.</p></article>
  </div>
</section>
${sections}`,
  });
}

function buildOfferPage(offer) {
  const pkg = buildInstantPackage(offer.id, {
    business_name: 'Acme HVAC Recovery',
    buyer: offer.buyer,
  });
  const files = pkg.files
    .map(
      (file) => `<article class="file">
  <h3>${esc(file.name)}</h3>
  <p>${esc(file.summary)}</p>
  <pre>${esc(file.body)}</pre>
</article>`,
    )
    .join('\n');
  return layout({
    title: offer.name,
    description: `Full live deliverable example for ${offer.name}.`,
    slugPath: offer.id,
    body: `<section class="hero">
  <div class="eyebrow">Full live deliverable - not a demo</div>
  <h1>${esc(offer.name)}</h1>
  <p class="lead">${esc(offer.outcome)}</p>
  <div class="actions">
    <a class="btn primary" href="/api/deliverables/instant?offer=${esc(offer.id)}">Open instant JSON package</a>
    <a class="btn" href="/live-deliverables">All live deliverables</a>
  </div>
  <div class="matrix">
    <div>Offer ID</div><div>${esc(offer.id)}</div>
    <div>Type</div><div>${esc(offer.type)}</div>
    <div>Price</div><div>${esc(offer.price_label)}</div>
    <div>Buyer</div><div>${esc(offer.buyer)}</div>
    <div>Manual package creation</div><div>None. The package is generated immediately by /api/deliverables/instant.</div>
  </div>
</section>
<section class="section">
  <h2>Smallest complete deliverable</h2>
  <p>This is the minimum finished package a customer can receive immediately after signup for this offer.</p>
  <ul class="list">${offer.included.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
</section>
<section class="section">
  <h2>Package receipt</h2>
  <div class="panel">
    <div class="receipt">
      <div><strong>Receipt</strong><span>${esc(pkg.receipt_id)}</span></div>
      <div><strong>Instant delivery</strong><span>${String(pkg.instant_delivery)}</span></div>
      <div><strong>Manual creation step</strong><span>none</span></div>
      <div><strong>Customer-owned boundary</strong><span>vendor credentials, domains, payment accounts, legal/tax review</span></div>
    </div>
  </div>
</section>
<section class="section">
  <h2>Generated files</h2>
  <div class="grid two">${files}</div>
</section>`,
  });
}

mkdir(outDir);
const offers = listInstantOffers();
fs.writeFileSync(path.join(outDir, 'index.html'), buildIndex(offers));
for (const offer of offers) {
  fs.writeFileSync(path.join(outDir, `${offer.id}.html`), buildOfferPage(offer));
}
console.log(`live-deliverables: generated ${offers.length} offer pages`);
