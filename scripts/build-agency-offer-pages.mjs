import fs from 'node:fs';
import path from 'node:path';
import {
  agencyOfferCategories,
  getAgencyOffer,
  listAgencyOffers,
  offerExampleUrl,
  offerUrl,
} from '../api/agency-offers/_catalog.mjs';

const root = process.cwd();
const outputRoots = [root, path.join(root, 'public')];
const offers = listAgencyOffers();

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function list(items) {
  return `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
}

function page({ title, description, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} | Your Deputy</title>
  <meta name="description" content="${esc(description)}">
  <link rel="stylesheet" href="/site-shell.css">
  <script src="/site-shell.js" defer></script>
  <style>
    :root { color-scheme: light; }
    .agency-wrap { width: min(1160px, calc(100% - 32px)); margin: 0 auto; padding: 72px 0 56px; }
    .agency-hero { display: grid; gap: 24px; padding: 38px 0 22px; border-bottom: 1px solid rgba(15, 23, 42, 0.12); }
    .agency-kicker { color: #0f766e; font-size: 0.8rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .agency-hero h1 { max-width: 900px; margin: 0; color: #0f172a; font-size: clamp(2.2rem, 5vw, 4.8rem); line-height: 0.95; letter-spacing: 0; }
    .agency-lede { max-width: 820px; margin: 0; color: #475569; font-size: 1.12rem; line-height: 1.7; }
    .agency-actions, .offer-actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .agency-button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; max-width: 100%; padding: 11px 16px; border: 1px solid #0f172a; border-radius: 8px; background: #0f172a; color: #fff; font-weight: 800; text-decoration: none; overflow-wrap: anywhere; white-space: normal; }
    .agency-button.secondary { background: #fff; color: #0f172a; border-color: rgba(15, 23, 42, 0.18); }
    .agency-stats { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); margin: 28px 0 0; }
    .agency-stat { border: 1px solid rgba(15, 23, 42, 0.12); border-radius: 8px; background: #fff; padding: 16px; box-shadow: 0 14px 32px rgba(15, 23, 42, 0.06); }
    .agency-stat strong { display: block; color: #0f172a; font-size: 1.45rem; line-height: 1; }
    .agency-stat span { display: block; margin-top: 8px; color: #64748b; line-height: 1.45; }
    .category-nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 28px 0; }
    .category-nav a { border: 1px solid rgba(15, 23, 42, 0.12); border-radius: 999px; color: #0f172a; padding: 8px 12px; text-decoration: none; background: #fff; }
    .agency-section { padding: 32px 0; }
    .agency-section h2 { margin: 0 0 14px; color: #0f172a; font-size: 1.55rem; letter-spacing: 0; }
    .offer-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .offer-card { border: 1px solid rgba(15, 23, 42, 0.12); border-radius: 8px; background: #fff; padding: 18px; box-shadow: 0 14px 32px rgba(15, 23, 42, 0.05); }
    .offer-card h3 { margin: 0 0 8px; color: #0f172a; font-size: 1.08rem; line-height: 1.3; }
    .offer-card p { margin: 0 0 12px; color: #475569; line-height: 1.55; }
    .offer-meta { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
    .offer-meta span { border: 1px solid rgba(15, 23, 42, 0.12); border-radius: 999px; color: #334155; background: #f8fafc; padding: 6px 9px; font-size: .82rem; }
    .offer-layout { display: grid; gap: 28px; grid-template-columns: minmax(0, 1.2fr) minmax(280px, .8fr); }
    .offer-panel { border: 1px solid rgba(15, 23, 42, 0.12); border-radius: 8px; background: #fff; padding: 20px; box-shadow: 0 14px 32px rgba(15, 23, 42, 0.05); }
    .offer-panel h2, .offer-panel h3 { margin-top: 0; color: #0f172a; letter-spacing: 0; }
    .offer-panel p, .offer-panel li { color: #475569; line-height: 1.65; }
    .offer-panel ul, .offer-panel ol { padding-left: 20px; }
    .offer-price { display: grid; gap: 10px; }
    .offer-price div { border-top: 1px solid rgba(15, 23, 42, 0.1); padding-top: 10px; color: #475569; }
    .offer-price strong { display: block; color: #0f172a; }
    .example-flow { display: grid; gap: 12px; counter-reset: step; }
    .example-step { border: 1px solid rgba(15, 23, 42, 0.12); border-radius: 8px; padding: 16px; background: #fff; }
    .example-step strong { display: block; color: #0f172a; }
    .example-step span { display: block; margin-top: 6px; color: #475569; line-height: 1.55; }
    @media (max-width: 820px) { .agency-wrap { width: min(100% - 24px, 1160px); padding-top: 54px; } .offer-layout { grid-template-columns: 1fr; } .agency-hero h1 { font-size: clamp(2rem, 12vw, 3.3rem); } }
  </style>
</head>
<body>
  <main id="main-content">
${body}
  </main>
</body>
</html>
`;
}

function categoryPageBody() {
  const grouped = agencyOfferCategories
    .map((category) => ({
      category,
      offers: offers.filter((item) => item.category === category),
    }))
    .filter((group) => group.offers.length);

  return `    <div class="agency-wrap">
      <section class="agency-hero" aria-labelledby="agency-title">
        <div class="agency-kicker">AI agency offers deployed from the 2026 source videos</div>
        <h1 id="agency-title">Productized AI agency offers that sell outcomes, not tools.</h1>
        <p class="agency-lede">This catalog turns the video research into live Your Deputy offers with buyer, outcome, price, required inputs, agent workflow, approval gates, provisioning assets, and example delivery pages.</p>
        <div class="agency-actions">
          <a class="agency-button" href="/api/agency-offers">Open offer API</a>
          <a class="agency-button secondary" href="/api/agency-offers/provision?list=1">Open provisioning list</a>
        </div>
        <div class="agency-stats" aria-label="Catalog statistics">
          <div class="agency-stat"><strong>${offers.length}</strong><span>live agency offers from the six video themes</span></div>
          <div class="agency-stat"><strong>${agencyOfferCategories.length}</strong><span>categories covering revenue, creative, operations, training, security, and digital assets</span></div>
          <div class="agency-stat"><strong>API</strong><span>schema and provisioning endpoints for every offer</span></div>
        </div>
      </section>
      <nav class="category-nav" aria-label="Agency offer categories">
        ${grouped.map((group) => `<a href="#${slug(group.category)}">${esc(group.category)}</a>`).join('')}
      </nav>
      ${grouped
        .map(
          (group) => `<section class="agency-section" id="${slug(group.category)}" aria-labelledby="${slug(group.category)}-title">
        <h2 id="${slug(group.category)}-title">${esc(group.category)}</h2>
        <div class="offer-grid">
          ${group.offers
            .map(
              (item) => `<article class="offer-card">
            <div class="offer-meta"><span>${esc(item.timeline)}</span><span>${esc(item.price.setup)} setup</span></div>
            <h3>${esc(item.name)}</h3>
            <p>${esc(item.outcome)}</p>
            <div class="offer-actions">
              <a class="agency-button" href="${offerUrl(item.id)}">View offer</a>
              <a class="agency-button secondary" href="${offerExampleUrl(item.id)}">Example</a>
            </div>
          </article>`,
            )
            .join('')}
        </div>
      </section>`,
        )
        .join('\n')}
    </div>`;
}

function offerPageBody(item) {
  return `    <div class="agency-wrap">
      <section class="agency-hero" aria-labelledby="offer-title">
        <div class="agency-kicker">${esc(item.category)} / ${esc(item.status)}</div>
        <h1 id="offer-title">${esc(item.name)}</h1>
        <p class="agency-lede">${esc(item.description)}</p>
        <div class="agency-actions">
          <a class="agency-button" href="/sign-up?offer=${esc(item.id)}">Start this offer</a>
          <a class="agency-button secondary" href="/api/agency-offers/provision?offer=${esc(item.id)}">Provisioning schema</a>
          <a class="agency-button secondary" href="${offerExampleUrl(item.id)}">Live example</a>
        </div>
      </section>
      <section class="agency-section offer-layout">
        <article class="offer-panel">
          <h2>Outcome</h2>
          <p>${esc(item.outcome)}</p>
          <h2>Who buys it</h2>
          <p>${esc(item.buyer)}</p>
          <h2>Customer receives</h2>
          ${list(item.deliverables)}
          <h2>Agent delivery workflow</h2>
          <ol>${item.agent_workflow.map((step) => `<li>${esc(step)}</li>`).join('')}</ol>
        </article>
        <aside class="offer-panel">
          <h2>Commercial model</h2>
          <div class="offer-price">
            <div><strong>Setup</strong>${esc(item.price.setup)}</div>
            <div><strong>Monthly</strong>${esc(item.price.monthly)}</div>
            <div><strong>Performance</strong>${esc(item.price.performance)}</div>
            <div><strong>Timeline</strong>${esc(item.timeline)}</div>
          </div>
          <h3>Required intake</h3>
          ${list(item.required_inputs)}
          <h3>Provisioned assets</h3>
          ${list(item.provisioned_assets)}
          <h3>Metrics</h3>
          ${list(item.sample_metrics)}
        </aside>
      </section>
      <section class="agency-section offer-layout">
        <article class="offer-panel">
          <h2>Approval gates</h2>
          ${list(item.approval_gates)}
        </article>
        <article class="offer-panel">
          <h2>Fit notes</h2>
          <p><strong>Best for:</strong> ${esc(item.best_for)}</p>
          <p><strong>Not for:</strong> ${esc(item.not_for)}</p>
          <p><strong>Source themes:</strong> ${esc(item.source_videos.join(', '))}</p>
        </article>
      </section>
    </div>`;
}

function examplePageBody(item) {
  const sampleBusiness = item.category === 'Revenue acquisition' ? 'Northstar Growth Clinic' : 'Harborline Studio';
  return `    <div class="agency-wrap">
      <section class="agency-hero" aria-labelledby="example-title">
        <div class="agency-kicker">Example package</div>
        <h1 id="example-title">${esc(item.name)} example delivery</h1>
        <p class="agency-lede">This example shows the concrete package a customer receives after provisioning. It is intentionally specific enough for sales, operations, and QA to inspect before purchase.</p>
        <div class="agency-actions">
          <a class="agency-button" href="${offerUrl(item.id)}">Back to offer</a>
          <a class="agency-button secondary" href="/api/agency-offers/provision?offer=${esc(item.id)}">View schema</a>
        </div>
      </section>
      <section class="agency-section offer-layout">
        <article class="offer-panel">
          <h2>Sample customer</h2>
          <p><strong>${esc(sampleBusiness)}</strong> buys this offer to achieve: ${esc(item.outcome)}</p>
          <h2>Delivery flow</h2>
          <div class="example-flow">
            ${item.agent_workflow
              .map(
                (step, index) => `<div class="example-step">
              <strong>Step ${index + 1}</strong>
              <span>${esc(step)}</span>
            </div>`,
              )
              .join('')}
          </div>
        </article>
        <aside class="offer-panel">
          <h2>Files generated</h2>
          ${list([
            'START-HERE.md',
            'DELIVERY-MANIFEST.json',
            'CUSTOMER-INTAKE-SCHEMA.json',
            'AGENT-WORKFLOW.json',
            'LAUNCH-CHECKLIST.md',
            'SAMPLE-DASHBOARD.json',
            'ACCEPTANCE-TESTS.md',
            'DELIVERY-RECEIPT.md',
          ])}
          <h3>Acceptance metrics</h3>
          ${list(item.sample_metrics)}
          <h3>Customer-owned inputs</h3>
          ${list(item.required_inputs)}
        </aside>
      </section>
    </div>`;
}

function writeBoth(relative, contents) {
  for (const base of outputRoots) {
    const file = path.join(base, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
}

writeBoth(
  'agency-offers.html',
  page({
    title: 'AI Agency Offer Catalog',
    description: 'Live AI agency offers with provisioning schemas, delivery workflows, and example packages.',
    body: categoryPageBody(),
  }),
);

for (const item of offers) {
  if (!getAgencyOffer(item.id)) throw new Error(`Catalog lookup failed for ${item.id}`);
  writeBoth(
    path.join('agency-offers', `${item.id}.html`),
    page({
      title: item.name,
      description: item.outcome,
      body: offerPageBody(item),
    }),
  );
  writeBoth(
    path.join('agency-offers', 'examples', `${item.id}.html`),
    page({
      title: `${item.name} Example`,
      description: `Example delivery package for ${item.name}.`,
      body: examplePageBody(item),
    }),
  );
}

console.log(`build-agency-offer-pages: wrote ${offers.length} offers to ${outputRoots.length} roots`);
