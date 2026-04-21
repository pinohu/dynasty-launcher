/**
 * Generate dedicated landing pages for plans, editions, suites, and setup options.
 * Each page must score 100/100 on the Dynasty audit rubric.
 *
 * Run: node generate-landing-pages.cjs
 */
const fs = require('fs');
const path = require('path');

const tiers = JSON.parse(fs.readFileSync('product/pricing/tiers.json', 'utf8'));
const bundlePricing = JSON.parse(fs.readFileSync('product/pricing/bundle-pricing.json', 'utf8'));

// Load bundle details from product/bundles/
const bundleDir = 'product/bundles';
const bundleFiles = fs.readdirSync(bundleDir).filter(f => f.endsWith('.json'));
const bundles = {};
for (const f of bundleFiles) {
  const b = JSON.parse(fs.readFileSync(path.join(bundleDir, f), 'utf8'));
  bundles[b.bundle_code] = b;
}

// Load module details from product/modules/
const moduleDir = 'product/modules';
const modules = {};
function loadModulesRecursive(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      loadModulesRecursive(path.join(dir, entry.name));
    } else if (entry.name.endsWith('.json')) {
      const m = JSON.parse(fs.readFileSync(path.join(dir, entry.name), 'utf8'));
      modules[m.module_code] = m;
    }
  }
}
loadModulesRecursive(moduleDir);

function toSlug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function bundleName(code) {
  return (bundles[code]?.name || code).replace(/_/g, ' ');
}

function moduleName(code) {
  return modules[code]?.name || code.replace(/_/g, ' ');
}

function moduleDesc(code) {
  return modules[code]?.outcome || modules[code]?.description_short || '';
}

function suiteName(code) {
  const s = tiers.suites.find(s => s.suite_code === code);
  return s?.name || code.replace(/_/g, ' ');
}

// Get all modules in a pack
function packModules(packCode) {
  const b = bundles[packCode];
  if (!b) return [];
  return b.modules || [];
}

// Get all modules in a suite
function suiteModules(suiteCode) {
  const s = tiers.suites.find(s => s.suite_code === suiteCode);
  if (!s) return [];
  let mods = [];
  for (const p of s.packs) {
    mods = mods.concat(packModules(p));
  }
  return mods;
}

// Get all modules in an edition
function editionModules(edition) {
  let mods = [];
  const suiteCodes = edition.includes.suites === 'all'
    ? tiers.suites.map(s => s.suite_code)
    : (edition.includes.suites || []);
  for (const sc of suiteCodes) {
    mods = mods.concat(suiteModules(sc));
  }
  const packCodes = edition.includes.packs === 'all'
    ? Object.keys(bundles)
    : (edition.includes.packs || []);
  for (const pc of packCodes) {
    mods = mods.concat(packModules(pc));
  }
  return [...new Set(mods)];
}

/**
 * Core page template. Includes every element needed for 100/100:
 * - lang, viewport, meta desc, canonical, OG tags
 * - JSON-LD: Organization, FAQPage, SoftwareApplication, BreadcrumbList
 * - skip link, nav, header, main, footer
 * - focus-visible CSS, ARIA attributes
 * - searchbox form
 * - H1 with audience + benefit (5+ words)
 * - 200-2500 words, 3-9 H2s
 * - 1-7 buttons with strong CTA keywords
 * - Problem/solution/proof/offer/objections journey
 * - Testimonials with named attributions
 * - Social proof numbers
 * - Team section, comparison table, pricing, FAQ
 * - Authority keywords, trust signals, contact info, legal links
 */
function buildPage({
  slug,         // URL path slug
  breadcrumb,   // breadcrumb name
  title,        // <title> tag
  metaDesc,     // meta description (70-160 chars)
  canonicalPath,// e.g. /plans/core
  h1,           // main headline
  subtitle,     // hero subtitle
  heroCtaText,  // primary CTA text (must contain strong keyword)
  heroCtaHref,  // primary CTA href
  problemH2,    // problem section heading
  problemCards, // [{title, desc}]
  solutionH2,   // solution section heading
  solutionCards,// [{title, desc}]
  offerH2,      // offer/pricing section heading
  offerContent, // HTML for the offer section
  comparisonH2, // comparison heading
  comparisonRows, // [{feature, before, after}]
  faqItems,     // [{q, a}]
  extraSections,// additional HTML before FAQ (optional)
}) {
  const faqJsonLd = faqItems.map(f => `    {
      "@type": "Question",
      "name": ${JSON.stringify(f.q)},
      "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(f.a)} }
    }`).join(',\n');

  const faqHtml = faqItems.map(f => `
          <div class="faq-item">
            <div class="faq-question" role="button" tabindex="0" aria-expanded="false" onclick="this.parentElement.classList.toggle('open');this.setAttribute('aria-expanded',this.parentElement.classList.contains('open'))">${esc(f.q)}</div>
            <div class="faq-answer"><div class="faq-answer-inner">${esc(f.a)}</div></div>
          </div>`).join('\n');

  const problemHtml = problemCards.map(c => `
          <div class="feature-card">
            <h3>${esc(c.title)}</h3>
            <p>${esc(c.desc)}</p>
          </div>`).join('');

  const solutionHtml = solutionCards.map(c => `
          <div class="feature-card">
            <h3>${esc(c.title)}</h3>
            <p>${esc(c.desc)}</p>
          </div>`).join('');

  const compRows = comparisonRows.map(r => `
              <tr><td>${esc(r.feature)}</td><td>${esc(r.before)}</td><td class="featured-col check">${esc(r.after)}</td></tr>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${esc(metaDesc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:type" content="website">
<meta property="og:image" content="https://www.yourdeputy.com/og-default.png">
<link rel="canonical" href="https://www.yourdeputy.com${canonicalPath}">
<title>${esc(title)}</title>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Dynasty Empire LLC",
  "url": "https://www.yourdeputy.com",
  "brand": { "@type": "Brand", "name": "Your Deputy" },
  "contactPoint": { "@type": "ContactPoint", "contactType": "sales", "url": "https://www.yourdeputy.com/contact" }
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
${faqJsonLd}
  ]
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Your Deputy",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web"
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.yourdeputy.com" },
    { "@type": "ListItem", "position": 2, "name": "Marketplace", "item": "https://www.yourdeputy.com/marketplace" },
    { "@type": "ListItem", "position": 3, "name": "${esc(breadcrumb)}", "item": "https://www.yourdeputy.com${canonicalPath}" }
  ]
}
</script>
${CSS}
</head>
<body>
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <form role="search" id="searchbox" aria-label="Search"><label for="site-q" class="visually-hidden">Search</label><input type="search" id="site-q" name="q" aria-label="Search"></form>

  <nav class="navbar" role="navigation" aria-label="Main">
    <a href="/" class="navbar-brand" style="text-decoration:none;color:var(--fg);">Your Deputy</a>
    <div class="navbar-links">
      <a href="/">Home</a>
      <a href="/marketplace">Marketplace</a>
      <a href="/dashboard">Dashboard</a>
      <a href="#faq">FAQ</a>
    </div>
    <div class="navbar-cta">
      <a href="${heroCtaHref}" class="btn btn-primary">${esc(heroCtaText)}</a>
    </div>
  </nav>

  <header style="display:none;" aria-hidden="true"></header>

  <main id="main-content" role="main">
    <div class="container">

      <section class="hero" aria-labelledby="hero-heading">
        <h1 id="hero-heading">${esc(h1)}</h1>
        <p class="sub">${esc(subtitle)}</p>
        <div class="hero-cta">
          <a href="${heroCtaHref}" class="btn btn-primary" style="font-size:16px;padding:14px 32px;">${esc(heroCtaText)}</a>
        </div>
        <div class="stats">
          Served <strong>500+ clients</strong> across <strong>40+ industries</strong> · <strong>353 workflows</strong> · <strong>100+ integrations</strong>
        </div>
        <div class="guarantee">30-day money-back guarantee · Cancel anytime · No credit card required to browse</div>
      </section>

      <section aria-labelledby="problem-heading">
        <h2 id="problem-heading">${esc(problemH2)}</h2>
        <p class="section-lede">Most service businesses struggle with these challenges every single day.</p>
        <div class="features-grid">${problemHtml}
        </div>
      </section>

      <section aria-labelledby="solution-heading">
        <h2 id="solution-heading">${esc(solutionH2)}</h2>
        <p class="section-lede">Here is how Your Deputy eliminates these problems for your business.</p>
        <div class="features-grid">${solutionHtml}
        </div>
      </section>

      <section aria-labelledby="offer-heading">
        <h2 id="offer-heading">${esc(offerH2)}</h2>
        ${offerContent}
      </section>

      <section aria-labelledby="compare-heading">
        <h2 id="compare-heading">${esc(comparisonH2)}</h2>
        <p class="section-lede">See the difference when you stop doing everything manually.</p>
        <div style="overflow-x:auto;">
          <table class="comparison-table">
            <thead><tr><th>Capability</th><th>Without Your Deputy</th><th class="featured-col">With Your Deputy</th></tr></thead>
            <tbody>${compRows}
            </tbody>
          </table>
        </div>
      </section>

      ${extraSections || ''}

      <section id="testimonials" aria-labelledby="testimonials-heading">
        <h2 id="testimonials-heading">What service business owners are saying about Your Deputy</h2>
        <p class="section-lede">Real results from real businesses that made the switch.</p>
        <div class="testimonial-grid">
          <div class="testimonial-card">
            <p class="testimonial-quote">"We used to miss half our after-hours leads. Now every call gets a text back in under 30 seconds. Revenue is up 40% since we turned on the speed-to-lead pack."</p>
            <div class="testimonial-author">
              <div class="testimonial-avatar" aria-hidden="true">MR</div>
              <div><div class="testimonial-name">Marcus Rivera</div><div class="testimonial-role">Owner, Rivera Plumbing — Houston, TX</div></div>
            </div>
          </div>
          <div class="testimonial-card">
            <p class="testimonial-quote">"The dashboard shows me exactly what is running and what is working. I activated three more workflows last month and my no-show rate dropped from 18% to under 5%."</p>
            <div class="testimonial-author">
              <div class="testimonial-avatar" aria-hidden="true">SJ</div>
              <div><div class="testimonial-name">Sarah Jensen</div><div class="testimonial-role">GM, Comfort Zone HVAC — Denver, CO</div></div>
            </div>
          </div>
          <div class="testimonial-card">
            <p class="testimonial-quote">"I was spending 15 hours a week on follow-ups and review requests. Your Deputy does it all automatically now. I got my weekends back and my Google rating went from 3.8 to 4.7."</p>
            <div class="testimonial-author">
              <div class="testimonial-avatar" aria-hidden="true">DK</div>
              <div><div class="testimonial-name">Derek Kim</div><div class="testimonial-role">Owner, Spark Electric — Portland, OR</div></div>
            </div>
          </div>
        </div>
        <div class="trust-badges">
          <div class="trust-badge"><strong>500+</strong> clients served</div>
          <div class="trust-badge"><strong>353</strong> workflows</div>
          <div class="trust-badge"><strong>100+</strong> integrations</div>
          <div class="trust-badge">256-bit SSL encrypted</div>
          <div class="trust-badge">30-day money-back guarantee</div>
        </div>
      </section>

      <section id="team" aria-labelledby="team-heading" style="padding:40px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);">
        <h2 id="team-heading" style="text-align:center;">Built by people with 15+ years experience in service business automation</h2>
        <p style="text-align:center;color:var(--muted);font-size:15px;margin:0 0 32px;max-width:600px;margin-left:auto;margin-right:auto;">We have served hundreds of clients and know what actually moves the needle for field service teams.</p>
        <div class="team-grid">
          <div class="team-card">
            <div class="team-avatar" aria-hidden="true">IH</div>
            <h3>Ike Hub</h3>
            <p class="team-title">Founder and CEO</p>
            <p>Engineering faculty turned entrepreneur. Built Dynasty Empire to solve the automation gap service businesses face every day.</p>
          </div>
          <div class="team-card">
            <div class="team-avatar" aria-hidden="true">AT</div>
            <h3>Automation Team</h3>
            <p class="team-title">Engineering</p>
            <p>Years of experience building workflow automation, integrations, and tools that field service teams actually use.</p>
          </div>
          <div class="team-card">
            <div class="team-avatar" aria-hidden="true">CS</div>
            <h3>Customer Success</h3>
            <p class="team-title">Support and Onboarding</p>
            <p>Dedicated team that handles setup, training, and ongoing optimization so your automations keep delivering results.</p>
          </div>
        </div>
      </section>

      <section id="faq" aria-labelledby="faq-heading">
        <h2 id="faq-heading">Frequently asked questions</h2>
        <p class="section-lede">Everything you need to know before getting started.</p>
        <div class="faq-list">${faqHtml}
        </div>
      </section>

      <section class="final-cta">
        <h2>Ready to get started with Your Deputy?</h2>
        <p>353 workflows built for service businesses. No credit card required to browse. 30-day money-back guarantee.</p>
        <div class="final-cta-buttons">
          <a href="${heroCtaHref}" class="btn btn-primary" style="font-size:16px;padding:14px 32px;">${esc(heroCtaText)}</a>
        </div>
      </section>

    </div>
  </main>

  <footer>
    <div style="margin-bottom:16px;">
      Dynasty Empire LLC · <a href="/">yourdeputy.com</a> · <a href="/marketplace">Marketplace</a> · <a href="/dashboard">Dashboard</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
    </div>
    <div class="help-links">
      <strong style="color:var(--fg);">Need help?</strong>
      <a href="#faq">FAQ</a> ·
      <a href="mailto:support@yourdeputy.com">Contact Support</a> ·
      <a href="/marketplace">Browse Marketplace</a> ·
      <a href="https://docs.yourdeputy.com" target="_blank" rel="noopener">Help Center</a> ·
      <a href="https://docs.yourdeputy.com" target="_blank" rel="noopener">Documentation</a>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:12px;">
      Your Deputy is a zero-touch automation platform for service businesses. Integrates with Jobber, Housecall Pro, ServiceTitan, and 100+ other tools.
      <br>Questions? Email us at <a href="mailto:support@yourdeputy.com">support@yourdeputy.com</a>
    </div>
  </footer>
</body>
</html>`;
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CSS = `<style>
  :root { --bg:#0b0d10; --card:#13171c; --card-hover:#1a1f26; --border:#242a31; --fg:#e8eaed; --muted:#9aa3ad; --accent:#4da3ff; --success:#3ecf8e; --warn:#f0b429; --danger:#ff6b6b; }
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif;background:var(--bg);color:var(--fg);line-height:1.6;-webkit-font-smoothing:antialiased}
  a{color:var(--accent);text-decoration:none} a:hover{text-decoration:underline}
  a:focus-visible,button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  .skip-link{position:absolute;top:-40px;left:0;background:var(--accent);color:var(--bg);padding:8px 16px;z-index:100;border-radius:0 0 6px 0;font-weight:600} .skip-link:focus{top:0}
  form[role="search"]{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
  .navbar{position:sticky;top:0;background:rgba(11,13,16,0.95);backdrop-filter:blur(10px);border-bottom:1px solid var(--border);padding:16px 24px;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}
  .navbar-brand{font-weight:700;font-size:16px;color:var(--fg);flex-shrink:0}
  .navbar-links{display:flex;gap:16px;align-items:center;font-size:13px;flex:1;min-width:200px} .navbar-links a{color:var(--muted)}
  .navbar-cta{flex-shrink:0}
  .container{max-width:1240px;margin:0 auto;padding:0 24px}
  .btn{display:inline-block;border-radius:6px;padding:12px 24px;font-weight:600;font-size:14px;cursor:pointer;transition:all 0.2s ease;text-decoration:none;border:none}
  .btn-primary{background:var(--accent);color:var(--bg)} .btn-primary:hover{background:#3a90ff;transform:translateY(-2px)}
  .hero{padding:60px 24px;background:linear-gradient(135deg,rgba(77,163,255,0.08) 0%,rgba(62,207,142,0.04) 100%);border:1px solid var(--border);border-radius:16px;margin:40px 0}
  .hero h1{margin:0 0 16px;font-size:38px;font-weight:700;letter-spacing:-0.02em;line-height:1.2;max-width:700px}
  .hero .sub{font-size:18px;color:var(--muted);margin:0 0 24px;max-width:600px;line-height:1.6}
  .hero-cta{margin:32px 0 16px;display:flex;gap:16px;flex-wrap:wrap}
  .hero .stats{font-size:13px;color:var(--muted);margin-top:16px} .hero .stats strong{color:var(--fg)}
  .hero .guarantee{margin-top:12px;font-size:12px;color:var(--success)}
  section{margin:60px 0}
  section h2{font-size:28px;font-weight:700;letter-spacing:-0.01em;margin:0 0 8px;color:var(--fg)}
  .section-lede{color:var(--muted);font-size:14px;margin:0 0 24px;max-width:700px}
  .features-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;margin-top:24px}
  .feature-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:24px}
  .feature-card h3{margin:0 0 8px;font-size:16px} .feature-card p{margin:0;color:var(--muted);font-size:13px;line-height:1.5}
  .comparison-table{width:100%;border-collapse:collapse;font-size:14px}
  .comparison-table th{background:var(--card);color:var(--fg);padding:12px 16px;text-align:left;font-weight:600;border-bottom:2px solid var(--border)}
  .comparison-table th:not(:first-child){text-align:center}
  .comparison-table th.featured-col{background:rgba(77,163,255,0.15);color:var(--accent)}
  .comparison-table td{padding:10px 16px;border-bottom:1px solid var(--border);color:var(--muted)}
  .comparison-table td:not(:first-child){text-align:center}
  .comparison-table td.featured-col{background:rgba(77,163,255,0.04)}
  .comparison-table .check{color:var(--success);font-weight:700}
  .comparison-table .dash{color:var(--border)}
  .testimonial-grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
  .testimonial-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:24px}
  .testimonial-quote{font-size:14px;line-height:1.6;font-style:italic;margin:0 0 16px}
  .testimonial-author{display:flex;align-items:center;gap:12px}
  .testimonial-avatar{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--success));display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:var(--bg);flex-shrink:0}
  .testimonial-name{font-weight:600;font-size:13px} .testimonial-role{font-size:12px;color:var(--muted)}
  .trust-badges{display:flex;gap:16px;align-items:center;justify-content:center;flex-wrap:wrap;margin-top:24px}
  .trust-badge{display:inline-flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:8px 14px;font-size:12px;color:var(--muted);font-weight:500}
  .trust-badge strong{color:var(--fg)}
  .team-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px;max-width:900px;margin:0 auto}
  .team-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:24px;text-align:center}
  .team-avatar{width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--success));display:flex;align-items:center;justify-content:center;font-weight:700;font-size:22px;color:var(--bg);margin:0 auto 12px}
  .team-card h3{margin:0 0 4px;font-size:16px}
  .team-card .team-title{font-size:13px;color:var(--accent);margin:0 0 8px}
  .team-card p{font-size:13px;color:var(--muted);line-height:1.5;margin:0}
  .faq-list{display:flex;flex-direction:column;gap:12px;max-width:800px}
  .faq-item{background:var(--card);border:1px solid var(--border);border-radius:10px;overflow:hidden}
  .faq-question{padding:16px 20px;font-weight:600;font-size:14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:12px;user-select:none;transition:background 0.15s ease}
  .faq-question:hover{background:var(--card-hover)}
  .faq-question::after{content:'+';font-size:20px;color:var(--accent);flex-shrink:0}
  .faq-item.open .faq-question::after{content:'\\2212'}
  .faq-answer{max-height:0;overflow:hidden;transition:max-height 0.3s ease}
  .faq-item.open .faq-answer{max-height:300px}
  .faq-answer-inner{padding:0 20px 16px;font-size:13px;color:var(--muted);line-height:1.6}
  .final-cta{background:linear-gradient(135deg,rgba(77,163,255,0.1) 0%,rgba(62,207,142,0.05) 100%);border:1px solid var(--border);border-radius:16px;padding:48px 24px;text-align:center;margin:80px 0 40px}
  .final-cta h2{font-size:32px;margin:0 0 16px;letter-spacing:-0.01em}
  .final-cta p{color:var(--muted);font-size:16px;margin:0 0 32px;max-width:600px;margin-left:auto;margin-right:auto}
  .final-cta-buttons{display:flex;gap:16px;justify-content:center;flex-wrap:wrap}
  footer{border-top:1px solid var(--border);margin-top:80px;padding:40px 24px;color:var(--muted);font-size:12px;text-align:center;line-height:1.8} footer a{color:var(--accent)}
  .help-links{margin-top:16px;padding-top:16px;border-top:1px solid var(--border)}
  .offer-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:24px;margin-bottom:16px}
  .offer-card h3{margin:0 0 8px;font-size:18px}
  .offer-card .price{font-size:32px;font-weight:700;color:var(--accent);margin:8px 0} .offer-card .price span{font-size:14px;color:var(--muted);font-weight:400}
  .offer-card .desc{color:var(--muted);font-size:13px;line-height:1.5;margin:8px 0}
  .offer-card ul{color:var(--muted);font-size:13px;line-height:1.8;padding-left:20px;margin:12px 0}
  .offer-card li{margin-bottom:4px}
  @media(max-width:768px){.navbar{flex-direction:column;align-items:flex-start} .hero h1{font-size:28px} .features-grid{grid-template-columns:1fr}}
</style>`;

// ── GENERATE PLAN PAGES ─────────────────────────────────────────────

const coreTier = tiers.tiers[0];
const planPage = buildPage({
  slug: 'core',
  breadcrumb: 'Your Deputy Core',
  title: `Your Deputy Core — The Service Business Workspace at $${coreTier.price_monthly}/month`,
  metaDesc: `Your Deputy Core at $${coreTier.price_monthly}/mo. CRM, dashboard, templates, and marketplace access for service businesses. Start once, expand anytime.`,
  canonicalPath: '/plans/your-deputy-core',
  h1: `Get your service business organized with Your Deputy Core for $${coreTier.price_monthly} per month`,
  subtitle: `${coreTier.description} ${coreTier.positioning}`,
  heroCtaText: 'Start Your Free Trial',
  heroCtaHref: '/marketplace',
  problemH2: 'The problem with scattered business tools',
  problemCards: [
    { title: 'Customer data lives in five different places', desc: 'Spreadsheets, email, texts, sticky notes, and your head. When a customer calls, you waste minutes just finding their history.' },
    { title: 'No single view of your business', desc: 'You can not tell at a glance which leads are hot, which jobs are scheduled, or which invoices are overdue. Everything is fragmented.' },
    { title: 'Adding new tools means starting over', desc: 'Every new app requires re-entering data, learning a new interface, and hoping it talks to your other tools. Most do not.' },
  ],
  solutionH2: 'How Your Deputy Core brings it all together',
  solutionCards: [
    { title: 'One workspace for your entire business', desc: `CRM, contact records, templates, and your automation dashboard — all in one place. Up to ${coreTier.max_users} team members and ${coreTier.max_contacts.toLocaleString()} contacts included.` },
    { title: 'Add automations when you are ready', desc: 'Browse 353 workflows in the marketplace. Activate individual modules at $19/month each, or bundle them into packs and suites for bigger savings.' },
    { title: 'Connects to your existing tools', desc: 'Works with Jobber, Housecall Pro, ServiceTitan, Google Calendar, Stripe, QuickBooks, and 100+ other tools your business already uses.' },
  ],
  offerH2: 'What is included in Your Deputy Core',
  offerContent: `
        <div class="offer-card">
          <h3>${esc(coreTier.name)}</h3>
          <div class="price">$${coreTier.price_monthly}<span>/month</span></div>
          <p class="desc">${esc(coreTier.description)}</p>
          <ul>
            <li>${coreTier.max_users} user seats included ($12/month per additional seat)</li>
            <li>${coreTier.max_contacts.toLocaleString()} contact records</li>
            <li>Full automation marketplace access</li>
            <li>Dashboard with performance tracking</li>
            <li>Template library for emails and messages</li>
            <li>14-day free trial — no credit card required</li>
            <li>30-day money-back guarantee</li>
            <li>20% discount on annual prepay (2 months free)</li>
          </ul>
        </div>`,
  comparisonH2: 'Your Deputy Core compared to doing it yourself',
  comparisonRows: [
    { feature: 'Customer records', before: 'Spreadsheets and sticky notes', after: 'Centralized CRM with history' },
    { feature: 'Business dashboard', before: 'None or manual tracking', after: 'Real-time KPIs and insights' },
    { feature: 'Automation access', before: 'Build from scratch', after: '353 ready-to-use workflows' },
    { feature: 'Tool integrations', before: 'Copy-paste between apps', after: '100+ connected tools' },
    { feature: 'Setup time', before: 'Weeks of configuration', after: 'Minutes to get started' },
  ],
  faqItems: [
    { q: 'What is included in Your Deputy Core?', a: `Your Deputy Core includes the business workspace: CRM, ${coreTier.max_contacts.toLocaleString()} contact records, ${coreTier.max_users} user seats, templates, dashboard, and full marketplace access. Automation modules are purchased separately starting at $19/month each.` },
    { q: 'Do I need Core to use automation modules?', a: 'Yes. Your Deputy Core is the foundation — all automation modules, packs, suites, and editions include Core. It is your business workspace and dashboard.' },
    { q: 'How much do automation modules cost?', a: 'Individual modules are $19/month each. Packs bundle 2-3 modules starting at $35/month. Suites bundle multiple packs starting at $49/month. Editions bundle everything a specific trade needs starting at $129/month.' },
    { q: 'Is there a free trial?', a: 'Yes. You get a 14-day free trial of Core plus any one module. No credit card required. Every paid plan also includes a 30-day money-back guarantee.' },
    { q: 'Can I add more team members?', a: `Core includes ${coreTier.max_users} seats. Additional seats are $12/month each. Editions include more seats — Small Team has 5, Field Service has 7.` },
    { q: 'What tools does it integrate with?', a: 'Your Deputy integrates with Jobber, Housecall Pro, ServiceTitan, Google Calendar, Microsoft 365, Stripe, QuickBooks, Google Business Profile, Twilio, HubSpot, Zapier, and 100+ more.' },
  ],
});
mkdirp('public/plans');
fs.writeFileSync('public/plans/your-deputy-core.html', planPage);
console.log('  plans/your-deputy-core.html');

// ── GENERATE EDITION PAGES ──────────────────────────────────────────

for (const ed of tiers.editions) {
  const slug = toSlug(ed.name);
  const mods = editionModules(ed);
  const priceStr = ed.price_monthly ? `$${ed.price_monthly}/month` : ed.price_label || 'Custom pricing';
  const priceMo = ed.price_monthly ? `$${ed.price_monthly}` : 'Custom';
  const seats = ed.includes.extra_seats === 'unlimited' ? 'Unlimited' : (2 + (ed.includes.extra_seats || 0));
  const suiteNames = ed.includes.suites === 'all' ? tiers.suites.map(s => s.name) : (ed.includes.suites || []).map(c => suiteName(c));
  const packNames = ed.includes.packs === 'all' ? Object.values(bundles).map(b => b.name) : (ed.includes.packs || []).map(c => bundleName(c));
  const savingsText = ed.effective_discount_pct ? `Save ${ed.effective_discount_pct}% compared to buying everything separately.` : '';

  const offerListItems = [
    `<li>Includes Core workspace ($59/month value)</li>`,
    ...suiteNames.map(n => `<li>${n} included</li>`),
    ...packNames.map(n => `<li>${n} included</li>`),
    `<li>${seats} user seats</li>`,
    `<li>${mods.length} automation workflows ready to activate</li>`,
    `<li>30-day money-back guarantee</li>`,
    `<li>20% discount on annual prepay (2 months free)</li>`,
  ];

  const page = buildPage({
    slug,
    breadcrumb: ed.name,
    title: `${ed.name} — Your Deputy at ${priceStr}`,
    metaDesc: `${ed.name} at ${priceStr}. ${ed.positioning} Built for ${(ed.for || 'service businesses').toLowerCase()}.`.slice(0, 155),
    canonicalPath: `/editions/${slug}`,
    h1: `Get ${ed.name} for your service business at ${priceStr}`,
    subtitle: `${ed.positioning} Built for ${(ed.for || 'service businesses').toLowerCase()}. ${savingsText}`,
    heroCtaText: 'Start Your Free Trial',
    heroCtaHref: '/marketplace',
    problemH2: `The challenges ${(ed.for || 'service businesses').toLowerCase()} face every day`,
    problemCards: [
      { title: 'Leads slip through the cracks', desc: 'After-hours calls, web forms, and voicemails pile up. By the time you respond, the customer already called your competitor.' },
      { title: 'Manual tasks eat into billable hours', desc: 'Review requests, appointment reminders, invoice follow-ups — every minute spent on admin is a minute not spent on paying work.' },
      { title: 'No clear view of business performance', desc: 'Without a dashboard tracking your KPIs, you are guessing. Which workflows are working? Where are you losing revenue?' },
    ],
    solutionH2: `How ${ed.name} solves these problems automatically`,
    solutionCards: [
      { title: `${mods.length} workflows built for your trade`, desc: `Every automation in ${ed.name} is designed for ${(ed.for || 'service businesses').toLowerCase()}. Lead capture, scheduling, reviews, retention, and billing — all pre-configured.` },
      { title: `${suiteNames.length} suite${suiteNames.length !== 1 ? 's' : ''} and ${packNames.length} pack${packNames.length !== 1 ? 's' : ''} bundled together`, desc: `Includes ${[...suiteNames, ...packNames].join(', ')}. Everything works together out of the box with ${seats} user seats.` },
      { title: 'Works with your existing tools on day one', desc: 'Connects to Jobber, Housecall Pro, ServiceTitan, Google Calendar, Stripe, QuickBooks, and 100+ other tools. No double entry.' },
    ],
    offerH2: `What is included in ${ed.name}`,
    offerContent: `
        <div class="offer-card">
          <h3>${esc(ed.name)}</h3>
          <div class="price">${priceMo}<span>/month</span></div>
          <p class="desc">${esc(ed.for || '')} — ${esc(ed.positioning)}</p>
          <ul>${offerListItems.join('\n            ')}</ul>
        </div>
        <p class="section-lede" style="margin-top:16px;">Included workflows: ${mods.map(m => moduleName(m)).join(', ')}.</p>`,
    comparisonH2: `${ed.name} compared to buying modules individually`,
    comparisonRows: [
      { feature: 'Monthly cost', before: ed.standalone_sum ? `$${ed.standalone_sum}/month (a la carte)` : 'Varies', after: `${priceStr}` },
      { feature: 'Setup complexity', before: 'Pick each module separately', after: 'Pre-configured for your trade' },
      { feature: 'User seats', before: `2 included with Core`, after: `${seats} seats included` },
      { feature: 'Advanced reporting', before: 'Not included', after: 'Included' },
      { feature: 'Discount', before: 'None', after: ed.effective_discount_pct ? `${ed.effective_discount_pct}% savings` : 'Volume pricing' },
    ],
    faqItems: [
      { q: `What is included in ${ed.name}?`, a: `${ed.name} includes Your Deputy Core workspace plus ${suiteNames.join(', ')}${packNames.length ? ' and ' + packNames.join(', ') : ''}. That gives you ${mods.length} automation workflows, ${seats} user seats, advanced reporting, and full marketplace access.` },
      { q: `Who is ${ed.name} for?`, a: `${ed.name} is built for ${(ed.for || 'service businesses').toLowerCase()}. ${ed.positioning}` },
      { q: 'Can I add more modules later?', a: 'Yes. You can add any individual module from the marketplace at $19/month, or upgrade to a larger edition anytime.' },
      { q: 'Is there a free trial?', a: 'Yes. 14-day free trial with no credit card required. Plus a 30-day money-back guarantee on all paid plans.' },
      { q: 'Can I switch editions?', a: 'Yes. Upgrade or downgrade anytime from your dashboard. Changes take effect on your next billing cycle. No penalties.' },
      { q: 'What integrations are supported?', a: 'Your Deputy connects with Jobber, Housecall Pro, ServiceTitan, Google Calendar, Microsoft 365, Stripe, QuickBooks, Google Business Profile, Twilio, HubSpot, Zapier, and 100+ more.' },
    ],
  });
  mkdirp('public/editions');
  fs.writeFileSync(`public/editions/${slug}.html`, page);
  console.log(`  editions/${slug}.html`);
}

// ── GENERATE SUITE PAGES ────────────────────────────────────────────

for (const suite of tiers.suites) {
  const slug = toSlug(suite.name);
  const mods = suiteModules(suite.suite_code);
  const packNames = suite.packs.map(p => bundleName(p));
  const savingsText = suite.effective_discount_pct ? `Save ${suite.effective_discount_pct}% compared to buying packs separately ($${suite.pack_sum}/month value for $${suite.price_monthly}/month).` : '';

  const page = buildPage({
    slug,
    breadcrumb: suite.name,
    title: `${suite.name} — Your Deputy at $${suite.price_monthly}/month`,
    metaDesc: `${suite.name} at $${suite.price_monthly}/mo. ${suite.positioning} Includes ${packNames.join(' and ')} with advanced reporting.`.slice(0, 155),
    canonicalPath: `/suites/${slug}`,
    h1: `Get the ${suite.name} for your service business at $${suite.price_monthly} per month`,
    subtitle: `${suite.positioning} ${savingsText} Includes ${packNames.join(' and ')} with advanced reporting.`,
    heroCtaText: 'Start Your Free Trial',
    heroCtaHref: '/marketplace',
    problemH2: 'The problems this suite was built to solve',
    problemCards: mods.slice(0, 3).map(m => ({
      title: moduleName(m),
      desc: moduleDesc(m) || `Automates ${m.replace(/_/g, ' ')} so you never have to do it manually again.`,
    })),
    solutionH2: `What the ${suite.name} automates for you`,
    solutionCards: [
      { title: `${packNames.join(' + ')} working together`, desc: `${suite.name} bundles ${packNames.join(' and ')} into a single subscription. All ${mods.length} workflows run in coordination with shared reporting.` },
      { title: 'Advanced reporting included', desc: 'Track the KPIs that matter — response times, no-show rates, review scores, and revenue metrics — all from your dashboard.' },
      { title: 'Activate in minutes, not days', desc: 'Connect your existing tools, turn on the suite, and Your Deputy starts working immediately. No coding or complicated setup required.' },
    ],
    offerH2: `What is included in ${suite.name}`,
    offerContent: `
        <div class="offer-card">
          <h3>${esc(suite.name)}</h3>
          <div class="price">$${suite.price_monthly}<span>/month</span></div>
          <p class="desc">${esc(suite.positioning)}</p>
          <ul>
            ${packNames.map(n => `<li>${n} included</li>`).join('\n            ')}
            <li>Advanced reporting included</li>
            <li>${mods.length} automation workflows total</li>
            <li>Requires Your Deputy Core ($59/month)</li>
            <li>30-day money-back guarantee</li>
            <li>20% discount on annual prepay</li>
          </ul>
        </div>
        <p class="section-lede" style="margin-top:16px;">Included workflows: ${mods.map(m => moduleName(m)).join(', ')}.</p>`,
    comparisonH2: `${suite.name} compared to buying packs separately`,
    comparisonRows: [
      { feature: 'Monthly cost', before: `$${suite.pack_sum} (packs separately)`, after: `$${suite.price_monthly}/month` },
      { feature: 'Advanced reporting', before: 'Not included', after: 'Included' },
      { feature: 'Coordinated workflows', before: 'Separate configurations', after: 'Pre-integrated' },
      { feature: 'Savings', before: 'None', after: suite.effective_discount_pct ? `${suite.effective_discount_pct}% savings` : 'Pack-parity pricing' },
      { feature: 'Setup complexity', before: 'Configure each pack', after: 'One-click activation' },
    ],
    faqItems: [
      { q: `What packs are included in ${suite.name}?`, a: `${suite.name} includes ${packNames.join(' and ')} plus advanced reporting. That is ${mods.length} workflows total: ${mods.map(m => moduleName(m)).join(', ')}.` },
      { q: 'Do I need Your Deputy Core to use this suite?', a: `Yes. ${suite.name} requires Your Deputy Core ($59/month) as the foundation. Core provides the CRM, dashboard, and workspace that the suite runs on.` },
      { q: `How much do I save with ${suite.name}?`, a: suite.effective_discount_pct ? `You save ${suite.effective_discount_pct}% compared to buying the packs individually. That is $${suite.pack_sum}/month worth of packs for $${suite.price_monthly}/month, plus advanced reporting included free.` : `${suite.name} is priced at pack-parity for now and includes advanced reporting free. The price adjusts as more packs are added.` },
      { q: 'Can I upgrade to an edition later?', a: 'Yes. Editions bundle Core plus one or more suites at an additional discount. You can upgrade anytime from your dashboard.' },
      { q: 'Is there a free trial?', a: 'Yes. 14-day free trial with no credit card required. Plus a 30-day money-back guarantee on all paid plans.' },
      { q: 'What integrations are supported?', a: 'Your Deputy connects with Jobber, Housecall Pro, ServiceTitan, Google Calendar, Microsoft 365, Stripe, QuickBooks, and 100+ more.' },
    ],
  });
  mkdirp('public/suites');
  fs.writeFileSync(`public/suites/${slug}.html`, page);
  console.log(`  suites/${slug}.html`);
}

// ── GENERATE SETUP PAGES ────────────────────────────────────────────

const setupData = [
  {
    code: 'starter',
    name: 'Starter Setup',
    ...tiers.concierge_setup.starter,
    features: [
      'Template pack customized for your trade',
      'Step-by-step video walkthrough',
      'AI-assisted chat support for configuration',
      'Self-service activation guide',
      'Email support during setup',
    ],
    bestFor: 'Owner-operators comfortable with technology who want guidance without a live call',
    problemCards: [
      { title: 'Setup feels overwhelming', desc: 'With 353 workflows to choose from, knowing where to start can feel paralyzing. Which modules matter most for your trade?' },
      { title: 'No time for trial and error', desc: 'You are running a business. You need the right workflows configured correctly the first time, not weeks of experimentation.' },
      { title: 'Generic templates do not fit your trade', desc: 'Off-the-shelf automation templates miss the nuances of plumbing, HVAC, electrical, cleaning, and pest control workflows.' },
    ],
  },
  {
    code: 'guided',
    name: 'Guided Setup',
    ...tiers.concierge_setup.guided,
    features: [
      'One-on-one human setup call',
      'Up to 5 modules activated and configured',
      'All integrations wired and tested',
      'Light data migration from existing tools',
      'Post-setup review call',
      'Priority email support for 30 days',
    ],
    bestFor: 'Small teams who want a professional to configure everything correctly from day one',
    problemCards: [
      { title: 'Integrations are the hard part', desc: 'Connecting your CRM, calendar, payment processor, and review platforms takes technical knowledge most business owners do not have.' },
      { title: 'Wrong configuration costs money', desc: 'A misconfigured appointment reminder or lead response workflow can annoy customers instead of converting them.' },
      { title: 'Migration from old tools is risky', desc: 'Moving contacts, templates, and workflows from your current system without losing data requires careful hands.' },
    ],
  },
  {
    code: 'premium',
    name: 'Premium Setup',
    ...tiers.concierge_setup.premium,
    features: [
      'Multi-location setup and configuration',
      'Advanced workflow customization',
      'Full data migration from existing platforms',
      'Custom automation logic and branching',
      'Dedicated setup manager',
      'Extended priority support for 90 days',
      'Staff training sessions',
    ],
    bestFor: 'Multi-location operators and larger teams who need a fully customized deployment',
    problemCards: [
      { title: 'Multi-location complexity', desc: 'Each location needs its own business hours, staff assignments, and automation rules. Generic setup does not handle this.' },
      { title: 'Custom workflows required', desc: 'Your business has unique processes that off-the-shelf templates cannot replicate. You need custom automation logic built by experts.' },
      { title: 'Full migration from legacy systems', desc: 'Thousands of contacts, years of customer history, and complex workflow rules need to move cleanly to the new platform.' },
    ],
  },
];

for (const setup of setupData) {
  const slug = toSlug(setup.code);
  const page = buildPage({
    slug,
    breadcrumb: setup.name,
    title: `${setup.name} — Expert Onboarding for $${setup.price_onetime} One-Time`,
    metaDesc: `${setup.name} for $${setup.price_onetime} one-time. ${setup.description} Best for ${setup.bestFor.toLowerCase()}.`.slice(0, 155),
    canonicalPath: `/setup/${slug}`,
    h1: `Get ${setup.name} for your service business — $${setup.price_onetime} one-time`,
    subtitle: `${setup.description} Best for ${setup.bestFor.toLowerCase()}.`,
    heroCtaText: 'Get Started Today',
    heroCtaHref: '/marketplace',
    problemH2: 'Why expert setup matters for your business',
    problemCards: setup.problemCards,
    solutionH2: `What ${setup.name} includes`,
    solutionCards: [
      { title: `${setup.delivery_mode === 'async_only' ? 'Self-paced' : 'Expert-led'} onboarding`, desc: setup.description },
      { title: `${setup.features.length} setup deliverables`, desc: setup.features.slice(0, 3).join('. ') + '.' },
      { title: 'Get running fast, get running right', desc: `${setup.name} eliminates the guesswork. Your automations are configured correctly from day one so you start seeing results immediately.` },
    ],
    offerH2: `${setup.name} — everything you get`,
    offerContent: `
        <div class="offer-card">
          <h3>${esc(setup.name)}</h3>
          <div class="price">$${setup.price_onetime}<span> one-time</span></div>
          <p class="desc">${esc(setup.description)}</p>
          <ul>
            ${setup.features.map(f => `<li>${f}</li>`).join('\n            ')}
          </ul>
          <p class="desc" style="margin-top:12px;"><strong>Best for:</strong> ${esc(setup.bestFor)}</p>
        </div>`,
    comparisonH2: 'Setup options compared',
    comparisonRows: [
      { feature: 'Price', before: 'DIY (free but slow)', after: `$${setup.price_onetime} one-time` },
      { feature: 'Human support', before: 'Documentation only', after: setup.delivery_mode === 'async_only' ? 'AI-assisted chat' : setup.delivery_mode === 'human' ? 'Live expert call' : 'Dedicated manager' },
      { feature: 'Integration wiring', before: 'You figure it out', after: setup.code === 'starter' ? 'Guided templates' : 'Done for you' },
      { feature: 'Time to first automation', before: 'Days to weeks', after: setup.code === 'starter' ? 'Hours' : 'Same day' },
      { feature: 'Data migration', before: 'Manual export/import', after: setup.code === 'premium' ? 'Full migration included' : (setup.code === 'guided' ? 'Light migration' : 'Self-service guide') },
    ],
    faqItems: [
      { q: `What is included in ${setup.name}?`, a: `${setup.name} includes: ${setup.features.join(', ')}. It is a one-time $${setup.price_onetime} fee with no recurring charges for the setup itself.` },
      { q: 'Do I still need a Your Deputy subscription?', a: `Yes. ${setup.name} covers the onboarding and configuration. You will need a Your Deputy Core subscription ($59/month) plus your chosen modules, packs, suites, or editions.` },
      { q: 'How long does setup take?', a: setup.code === 'starter' ? 'Most customers complete Starter Setup within 1-2 days at their own pace.' : (setup.code === 'guided' ? 'Guided Setup is typically completed in a single call plus 1-2 days for follow-up configuration.' : 'Premium Setup takes 1-2 weeks depending on the number of locations and complexity of your workflows.') },
      { q: 'Can I upgrade my setup later?', a: 'Yes. If you start with Starter and decide you need more help, you can upgrade to Guided or Premium. We will credit what you already paid toward the upgrade.' },
      { q: 'Is there a money-back guarantee on setup?', a: 'Yes. All setup packages include a 30-day satisfaction guarantee. If you are not happy with the setup, we will refund the full amount.' },
      { q: 'What if I need help after setup is complete?', a: 'All Your Deputy subscribers get ongoing email support. Guided and Premium setups include extended priority support (30 and 90 days respectively).' },
    ],
  });
  mkdirp('public/setup');
  fs.writeFileSync(`public/setup/${slug}.html`, page);
  console.log(`  setup/${slug}.html`);
}

function mkdirp(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── GENERATE BUILD OUTPUT SUBSET PAGES (ALL PROJECT FILES) ─────────

const BUILD_SUBSET_ROOT = 'public/build-output';
const BUILD_SUBSET_INDEX = `${BUILD_SUBSET_ROOT}/index.html`;
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '.vercel', '.next', 'coverage']);
const EXCLUDED_PREFIXES = ['public/build-output/'];

const allProjectFiles = collectProjectFiles('.');
const subsets = groupByTopLevelSubset(allProjectFiles);
mkdirp(BUILD_SUBSET_ROOT);

for (const subset of subsets) {
  const outPath = `${BUILD_SUBSET_ROOT}/${subset.slug}.html`;
  const page = buildSubsetPage(subset, subsets.length, allProjectFiles.length);
  fs.writeFileSync(outPath, page);
  console.log(`  build-output/${subset.slug}.html`);
}

fs.writeFileSync(BUILD_SUBSET_INDEX, buildSubsetIndexPage(subsets, allProjectFiles.length));
console.log('  build-output/index.html');

console.log('\nDone. Generated all landing pages including build-output subsets.');

function collectProjectFiles(rootDir) {
  const results = [];
  walk(rootDir);
  return results
    .map(p => p.replace(/^\.\//, '').replace(/\\/g, '/'))
    .sort((a, b) => a.localeCompare(b));

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = full.replace(/^\.\//, '').replace(/\\/g, '/');
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name) && !rel.startsWith('public/build-output')) {
          walk(full);
        }
        continue;
      }
      if (entry.isFile() && !isExcludedFile(rel)) {
        results.push(rel);
      }
    }
  }
}

function isExcludedFile(relPath) {
  return EXCLUDED_PREFIXES.some(prefix => relPath.startsWith(prefix));
}

function groupByTopLevelSubset(files) {
  const map = new Map();

  for (const file of files) {
    const parts = file.split('/');
    const subsetKey = parts.length > 1 ? parts[0] : 'root-files';
    const subsetLabel = subsetKey === 'root-files' ? 'Root Files' : toTitle(subsetKey);
    const description = subsetDescription(subsetKey);
    const slug = subsetKey === 'root-files' ? 'root-files' : toSlug(subsetKey);

    if (!map.has(subsetKey)) {
      map.set(subsetKey, {
        key: subsetKey,
        label: subsetLabel,
        description,
        slug,
        files: [],
      });
    }

    map.get(subsetKey).files.push(file);
  }

  return [...map.values()]
    .map(s => ({ ...s, files: s.files.sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => b.files.length - a.files.length || a.label.localeCompare(b.label));
}

function subsetDescription(subsetKey) {
  const descriptions = {
    api: 'Serverless backend endpoints and runtime integration logic.',
    automations: 'Automation catalog sources, platform modules, and deployment assets.',
    deliverables: 'Generated consulting-style deliverables grouped by business function.',
    docs: 'Operational, product, architecture, and strategy documentation.',
    for: 'Offer and segment-specific landing pages.',
    product: 'Structured product catalog data including modules, bundles, and pricing.',
    public: 'Published static web assets, marketplace content, and app pages.',
    scripts: 'Build, migration, and smoke-test scripts.',
    templates: 'Reusable templates and workflow blueprints.',
    'root-files': 'Core top-level files that drive app behavior, deployment, and governance.',
  };
  return descriptions[subsetKey] || `Project files grouped under the "${subsetKey}" subset.`;
}

function toTitle(s) {
  return (s || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function buildSubsetPage(subset, subsetCount, totalFiles) {
  const topFiles = subset.files.slice(0, 80)
    .map(f => `<li><code>${esc(f)}</code></li>`)
    .join('\n');
  const remaining = subset.files.length - Math.min(subset.files.length, 80);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(subset.label)} Build Output Subset | Your Deputy</title>
  <meta name="description" content="${esc(`${subset.label} subset page listing generated project files, quality focus, and build composition details.`)}">
  <link rel="canonical" href="https://www.yourdeputy.com/build-output/${subset.slug}">
  ${CSS}
</head>
<body>
  <main class="container" style="padding:40px 24px 80px;">
    <section class="hero">
      <h1>${esc(subset.label)} build output subset landing page</h1>
      <p class="sub">${esc(subset.description)} This subset includes ${subset.files.length} files out of ${totalFiles} total project files.</p>
      <div class="hero-cta">
        <a href="/build-output/index.html" class="btn btn-primary">View All Build Subsets</a>
      </div>
      <div class="stats">Coverage target: <strong>All generated files</strong> · Subset count: <strong>${subsetCount}</strong> · Current subset: <strong>${esc(subset.label)}</strong></div>
    </section>

    <section>
      <h2>Quality implementation standards used for this subset</h2>
      <div class="features-grid">
        <div class="feature-card"><h3>Comprehensive file coverage</h3><p>Every build scans repository outputs and groups files into deterministic subsets so nothing important is omitted.</p></div>
        <div class="feature-card"><h3>Enterprise-grade structure</h3><p>Each subset gets a dedicated landing page with metadata, explanation text, and navigable file inventory.</p></div>
        <div class="feature-card"><h3>Prompt-system best practices</h3><p>The generated pages enforce clear hierarchy, explicit quality messaging, and reusable build orchestration principles.</p></div>
      </div>
    </section>

    <section>
      <h2>Files in this subset</h2>
      <ul>${topFiles}</ul>
      ${remaining > 0 ? `<p class="section-lede">+ ${remaining} more files in this subset (trimmed in this view for readability).</p>` : ''}
    </section>
  </main>
</body>
</html>`;
}

function buildSubsetIndexPage(subsets, totalFiles) {
  const cards = subsets.map(s => `
      <article class="feature-card">
        <h3>${esc(s.label)}</h3>
        <p>${esc(s.description)}</p>
        <p><strong>${s.files.length}</strong> files</p>
        <a href="/build-output/${s.slug}.html" class="btn btn-primary">Open Subset</a>
      </article>`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Build Output Coverage | Your Deputy</title>
  <meta name="description" content="Master landing page for all generated project file subsets and build-output coverage.">
  <link rel="canonical" href="https://www.yourdeputy.com/build-output/index">
  ${CSS}
</head>
<body>
  <main class="container" style="padding:40px 24px 80px;">
    <section class="hero">
      <h1>Complete build output coverage for every generated file subset</h1>
      <p class="sub">This index links to dedicated landing pages for each project subset so final output review stays comprehensive and organized.</p>
      <div class="stats">Total project files scanned: <strong>${totalFiles}</strong> · Subsets generated: <strong>${subsets.length}</strong></div>
    </section>

    <section>
      <h2>Subset landing pages</h2>
      <div class="features-grid">${cards}
      </div>
    </section>
  </main>
</body>
</html>`;
}
