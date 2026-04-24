# GTM funnel strategy — personas, pains, sites, and funnels

**Decision date:** 2026-04-10  

**Goal:** Sell the **smallest honest offer** that solves a **specific pain**, at the **right price**, without fragmenting brand or trust.

## Executive summary (what we’re doing)

| Option | Verdict | Why |
|--------|---------|-----|
| **Separate domain / website per persona (12 sites)** | **No** | Splits SEO authority, doubles compliance/privacy work, confuses “who is Your Deputy?”, raises scam perception. |
| **Separate website per pain point (50+ sites)** | **No** | Unmaintainable; message drift; same downsides amplified. |
| **Separate “funnels” (message match)** | **Yes** | **Same domain**, **dedicated paths** (`/for/...`), **UTM + `segment`**, **pre-set `archetype`** via query → `localStorage` → builder. Paid ads and partners link to one sharp page each. |
| **Single homepage only** | **Insufficient** | Ads and niche communities need **headline match** in &lt;3 seconds; `#who-its-for` helps organic, not paid LP quality. |

**Winner:** **One brand (`yourdeputy.com`) + ~8 segment landers + deep links into `/app` with `plan`, `archetype`, `segment`, optional `vertical`.**

## How “the team” scored options (profit · UX · satisfaction · trust)

1. **Profit:** Segment LPs improve conversion and **justify tier choice** (fewer wrong-tier refunds / support). Multiple domains add cost without proven lift.
2. **Usability:** One login, one builder, one manifest story — user isn’t re-learning a new site per segment.
3. **Satisfaction:** Expectations match **BUILD-MANIFEST** when we pre-select archetype + tier from the pain they clicked.
4. **Trust:** One legal entity, one privacy policy, one mature “what ships” page — critical for high-ticket B2B.

## Implementation map (live in repo)

| Path | Primary pain / persona | Default `segment` | Suggested `archetype` | Primary SKU |
|------|------------------------|-------------------|----------------------|-------------|
| `/for/viability` | Idea-stage / demo seller — wrong-build risk | `viability` | `demo_express` | Free → Foundation |
| `/for/capital` | Lender / investor pack | `capital` | `starter_5p` | Foundation |
| `/for/foundation-diy` | Docs + deploy; self-serve vendors | `foundation_diy` | `landing_1p` | Foundation |
| `/for/revenue-ops` | CRM / payments / automation chaos | `revenue_ops` | `growth` | Professional |
| `/for/full-launch` | Broad go-live stack | `full_launch` | `enterprise_full` | Enterprise |
| `/for/authority-seo` | SEO / authority site shape | `authority_seo` | `authority_site` | Enterprise |
| `/for/trades-vertical` | Plan / takeoff **assist** (disclaimed) | `trades_vertical` | `growth` + `vertical=1` | Professional |
| `/for/directory` | Directory / membership product | `directory` | `enterprise_full` | Enterprise |
| `/for/managed` | Post-launch operations | `managed_ops` | (any) | Managed $497/mo |

Hub: **`/for`** lists all paths and links to the pain map CSV.

## Operations checklist

1. **Ads:** One LP per campaign; use `utm_source`, `utm_campaign`; optional `segment` already supported for analytics in `localStorage`.
2. **Sales:** Map prospect to row in **`PAIN_POINT_MASTER_MAP.md`** Part 2 → pick LP + tier.
3. **Product:** Builder reads **`dynasty_funnel_segment`** and **`dynasty_build_profile`** from URL on first touch (see `app.html`).
4. **Review quarterly:** Retire landers with low traffic; add one only when a **new repeatable segment** appears (not one-off copy).

## UTM → spoke → default tier reference

Every spoke CTA links into `/app` with `plan`, `archetype`, `segment`, and `source=spoke`. The quiz adds `source=quiz` and `diag_id`. These params are captured in `localStorage` by `applyFunnelParamsFromUrl()` in `app.html` and surface in the Expected Scope preview so the user sees path confirmation.

### Full param chain per spoke

| Spoke path | `segment=` | `plan=` | `archetype=` | Extra params | Default tier |
|---|---|---|---|---|---|
| `/for/viability` | `viability` | `free` | `demo_express` | — | Free |
| `/for/viability` (upgrade CTA) | `viability_buy` | `foundation` | `landing_1p` | — | Foundation |
| `/for/capital` | `capital` | `foundation` | `starter_5p` | — | Foundation |
| `/for/capital` (free first CTA) | `capital_prescore` | `free` | `demo_express` | — | Free |
| `/for/foundation-diy` | `foundation_diy` | `foundation` | `landing_1p` | — | Foundation |
| `/for/revenue-ops` | `revenue_ops` | `professional` | `growth` | — | Professional |
| `/for/full-launch` | `full_launch` | `enterprise` | `enterprise_full` | — | Enterprise |
| `/for/authority-seo` | `authority_seo` | `enterprise` | `authority_site` | — | Enterprise |
| `/for/trades-vertical` | `trades_vertical` | `professional` | `growth` | `vertical=1` | Professional |
| `/for/directory` | `directory` | `enterprise` | `enterprise_full` | — | Enterprise |
| `/for/managed` | `managed_ops` | `managed` | — | — | Managed $497/mo |

### Quiz routing

The `/quiz` diagnostic resolves to one of the segments above using a weighted scoring algorithm across four inputs (stage, pain, delivery preference, budget). The result links to both the spoke guide page (`rec.guide`) and a prefilled builder URL with `source=quiz`.

### UTM conventions for paid ads

| Param | Purpose | Example |
|---|---|---|
| `utm_source` | Ad platform | `google`, `linkedin`, `meta` |
| `utm_medium` | Campaign type | `cpc`, `social`, `email` |
| `utm_campaign` | Campaign name | `revops_q2_2026` |
| `utm_persona` | Target persona | `P-FOUNDER`, `P-AGENCY`, `P-OPERATOR` |
| `segment` | Pre-set builder segment | `revenue_ops` |

All UTM params pass through to the spoke page. When the user clicks the spoke CTA into `/app`, `source=spoke` is appended. If `utm_persona` is present in the URL, `app.html` stores it in `localStorage` for analytics continuity.

### localStorage keys set by the funnel

| Key | Set by | Purpose |
|---|---|---|
| `dynasty_build_profile` | `applyFunnelParamsFromUrl()` | Archetype, vertical tool flag |
| `dynasty_funnel_segment` | `applyFunnelParamsFromUrl()` | Segment label for scope preview |
| `dynasty_funnel_source` | `applyFunnelParamsFromUrl()` | Traffic source (`spoke`, `quiz`, etc.) |
| `dynasty_utm_persona` | `applyFunnelParamsFromUrl()` | Persona tag from UTM |
| `dynasty_diagnostic_recommendation` | `checkPlanPurchase()` | Full quiz context (quiz traffic only) |
| `dynasty_diag_session_id` | Quiz / app | Diagnostic session continuity |

## What we are explicitly not doing (until data says otherwise)

- Separate Stripe accounts or brands per persona.
- Microsites on new domains for each trade vertical.
- Promising outcomes that **`maturity.html`** cannot support.


## Day-1 Success Kit (cross-tier)

Every paid build ships with:
1. **Interactive onboarding dashboard** (`public/onboard.html`) — self-contained HTML with localStorage progress, vendor links, env var copy
2. **Automated test suite** (`src/__tests__/`, `e2e/`) — Vitest unit, RTL component, Playwright e2e smoke tests
3. **Seed data** (`src/data/seed/`, `src/scripts/seed.ts`) — fictional users, content, transactions; executable seeder
4. **API collection** (`docs/openapi.json`, `docs/postman-collection.json`) — OpenAPI 3.0 + Postman v2.1
5. **90-day launch playbook** (`LAUNCH-PLAYBOOK.md`) — tier-aware week-by-week action plan

All AI-generated during the build, committed to the customer's repo, no external dependencies.
