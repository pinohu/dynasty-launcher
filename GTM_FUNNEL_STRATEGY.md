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
| `/for/trades-vertical` | Plan / takeoff **assist** (disclaimed) | `trades_vertical` | `growth` + `vertical=1` | Professional+ |
| `/for/directory` | Directory / membership product | `directory` | `enterprise_full` | Enterprise |
| `/for/managed` | Post-launch operations | `managed_ops` | (any) | Managed $497/mo |

Hub: **`/for`** lists all paths and links to the pain map CSV.

## Operations checklist

1. **Ads:** One LP per campaign; use `utm_source`, `utm_campaign`; optional `segment` already supported for analytics in `localStorage`.
2. **Sales:** Map prospect to row in **`PAIN_POINT_MASTER_MAP.md`** Part 2 → pick LP + tier.
3. **Product:** Builder reads **`dynasty_funnel_segment`** and **`dynasty_build_profile`** from URL on first touch (see `app.html`).
4. **Review quarterly:** Retire landers with low traffic; add one only when a **new repeatable segment** appears (not one-off copy).

## What we are explicitly not doing (until data says otherwise)

- Separate Stripe accounts or brands per persona.
- Microsites on new domains for each trade vertical.
- Promising outcomes that **`maturity.html`** cannot support.
