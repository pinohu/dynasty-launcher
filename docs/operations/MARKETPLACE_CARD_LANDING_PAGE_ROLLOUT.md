# Marketplace card → landing page rollout plan

## Goal

Give every marketplace card on `https://www.yourdeputy.com/marketplace` a dedicated, indexable landing page that can:

1. convert ad/SEO traffic,
2. support direct deep links from sales and support,
3. share one rendering contract across modules, packs, suites, editions, and concierge offers.

---

## What exists today

- `marketplace.html` renders cards from catalog APIs, but cards are not clickable and no per-card route is emitted yet.
- The catalog already has stable machine IDs (`module_code`, bundle code, suite code, tier/edition codes) from API payloads.
- The repo already has static-page patterns (`for/*.html`, `deliverables/*.html`) and a sitemap at `sitemap.xml`.

---

## Recommended architecture (phased)

## Phase 1 — URL contract and routing (do this first)

Define one canonical URL shape and never change it:

- Modules: `/marketplace/modules/:module_code`
- Packs: `/marketplace/packs/:bundle_code`
- Suites: `/marketplace/suites/:suite_code`
- Editions: `/marketplace/editions/:edition_code`
- Concierge: `/marketplace/concierge/:sku_code`

Rules:

- Keep machine code in the URL (no title-derived slugs as primary keys).
- Add `<link rel="canonical">` on every landing page.
- If marketing wants pretty slugs later, support redirects to canonical machine-code URLs.

Implementation options in this repo:

1. **Static pre-rendered pages (recommended for speed/SEO):** generate HTML files from catalog JSON at build/deploy time.
2. **SSR/API-driven route:** one template HTML + runtime fetch by `:code`.

Given the current mostly-static repo structure, start with static pre-render generation.

---

## Phase 2 — Reusable landing page template

Create one shared template fragment and hydrate with entity data.

Required sections per page:

1. **Hero:** headline, one-line outcome, trust marker.
2. **What it does:** 3–5 bullets, outcome-first.
3. **How it works:** trigger → actions → result.
4. **Integrations/capabilities required:** map from `capabilities_required`.
5. **Pricing block:** monthly/one-time + guarantee language.
6. **Who it’s for:** blueprint/persona fit.
7. **Proof block:** status badge (spec/deployable/live) + implementation notes.
8. **Primary CTA:** checkout/install/contact depending on status.
9. **Related cards:** cross-link to suite/pack/module neighbors.

Keep this as a single rendering contract so all card types stay consistent.

---

## Phase 3 — Make cards clickable in marketplace UI

In `marketplace.html`:

- Add a `landingUrl` resolver for each card type using code fields from catalog data.
- Wrap card markup in `<a class="card-link" href="...">` (or add explicit “View details” CTA).
- Preserve current admin/marketplace filtering behavior.
- For non-public statuses (`spec`) in marketplace view, either hide links or route to waitlist/contact page.

This gives immediate navigability without changing pricing/status logic.

---

## Phase 4 — SEO + measurement baseline

Per landing page:

- Unique `<title>` and meta description.
- Open Graph/Twitter tags.
- JSON-LD (`SoftwareApplication` or `Service`, whichever fits your schema strategy).
- Internal links back to marketplace and sideways to related cards.

Site-wide:

- Add generated landing-page URLs to `sitemap.xml`.
- Ensure `robots.txt` allows crawl for public pages.
- Fire analytics events:
  - `marketplace_card_click` (source marketplace)
  - `landing_cta_click` (source landing page)
  - `landing_checkout_start` / `landing_contact_start`

---

## Phase 5 — Content ops workflow

Avoid hand-editing hundreds of pages.

Create a content map keyed by card code:

- short headline
- pain point
- promise/outcome
- proof points
- CTA variant
- FAQs

Then generate pages from:

- structural data from `product/*.json` catalog,
- marketing copy overrides from `docs`/content map.

This keeps product truth and marketing copy synchronized.

---

## Data model checklist (must be true before full rollout)

For each card type, verify these fields exist and are stable:

- `code` (machine identifier)
- `name`
- `description_short` / `outcome`
- `price_monthly` or `price_onetime` (or `price_label`)
- `status`
- `category` and/or blueprint/persona targeting
- optional related IDs (module ↔ pack ↔ suite)

If related IDs are missing, add a lightweight join map in `product/` so “Related cards” can be generated deterministically.

---

## Suggested execution order (small, low-risk increments)

1. Ship URL contract + one template + one entity type (modules only).
2. Add module links in marketplace cards.
3. Generate module pages + sitemap entries.
4. Add conversion tracking + CTA attribution.
5. Expand same pattern to packs/suites/editions/concierge.

This sequence gives measurable value fast and avoids a giant all-at-once migration.

---

## Definition of done

You are done when all are true:

- Every visible marketplace card has a working detail URL.
- Each URL has canonical/meta/structured-data tags.
- Sitemap includes all public landing pages.
- Marketplace clickthrough and landing conversion events are tracked.
- Content updates can be done through structured data + copy map, not manual HTML editing.

---

## Practical next step in this repo (first PR)

Implement a first PR that only includes:

1. URL resolver helpers in `marketplace.html`.
2. Clickable module cards linking to `/marketplace/modules/:module_code`.
3. One generated template for module landing pages (minimum viable content blocks).
4. Sitemap generation/update for module URLs.

Then expand to other card types after validating module conversion and maintenance overhead.
