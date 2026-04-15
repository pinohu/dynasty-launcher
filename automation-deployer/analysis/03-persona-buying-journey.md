# 03 — Persona Buying Journey Analysis

Source: `PERSONA_GROUPS_MASTER.md` (19 personas) + `AUTOMATION_UX_BIBLE_PART1.md` (persona → category mapping).

## The 10 primary personas (Group 1)

Group 1 covers generic service-business buyers and drives most of the selection logic.

| # | Persona | Rev band | Buy $/mo | Decision speed | Best-fit categories |
|---|---|---|---|---|---|
| 1 | Solo Steve | $40K–$150K | $19–$49 | 1–2 days | 1–5, 8–9, 12–15, 21, 35 |
| 2 | Manager Maria | $250K–$2M | $99–$299 | 1–2 weeks | 4–5, 8, 10–11, 18, 22–23, 36–37 |
| 3 | Owner Omar | $2M–$10M | $299–$999 | 1 month | 1, 5–7, 10, 15–17, 23, 27, 30–31, 38, 45 |
| 4 | Franchise Fran | $5M–$50M | $999–$4,999 | 3–6 months | 8, 10–11, 18, 22–23, 37–38, 41, 45 |
| 5 | Startup Sam | $0–$500K | $49–$149 (one-time preferred) | hours | 1–3, 8, 12–14, 24–28, 39, 42, 45 |
| 6 | Agency Alex | $500K–$5M | $199–$499/tool | 1–2 weeks | 5–8, 10–11, 15, 23–24, 30–31, 39 |
| 7 | Compliance Carol | varies | $149–$499 | 2–4 weeks | 7, 20, 35, 37, 41, 43–44 |
| 8 | Field Service Fred | $500K–$5M | $99–$299 | 1–2 weeks | 8–11, 14, 38 |
| 9 | Bookkeeper Beth | $50K–$500K | $49–$149 | days | 15–17, 20, 23, 35 |
| 10 | Marketing Mike | varies | $99–$299 | days | 24–28, 42 |

## Deriving autonomous selection

The interview asks 6 questions that are sufficient to score every automation:

1. **Revenue band** → maps to persona candidates (`$40–150K` narrows to Solo Steve / early Bookkeeper Beth / Startup Sam).
2. **Team size** (solo / 2–10 / 11–50 / 50+) → further narrows.
3. **Top goal** (1-of-6 from the goals distilled across all personas).
4. **Top pain** (1-of-8 from the pains distilled across all personas).
5. **Current stack** (multi-select: CRM used, calendar, payment, email, SMS, LLM, n8n, etc.).
6. **Budget ceiling / month** (dollars) — caps automation count by per-automation vendor cost.

The selector produces a persona probability distribution (primary + secondary) and uses the UX Bible category mappings to produce a ranked list. See `registry/selection-rules.json` for the decision table.

## Journey stage → automation readiness

The deployer tracks "readiness" separately from "fit." A high-fit automation can still be **not-yet-ready** for a given tenant if prerequisite journey stages aren't complete.

| Journey stage (A–D) | Automations unlocked |
|---|---|
| A1–A2 (discover/evaluate) | None — pre-sales, not deployable |
| A3 (commit) | 15.01 (invoice), 2.01 (form→CRM) |
| A4 (intake) | 2.* (capture), 3.* (qualify), 4.* (CRM) |
| A5–A6 (strategize/specify) | 6.* (proposals), 7.* (contracts) |
| A7 (build) | N/A (internal to Launcher) |
| A8–A9 (deploy/configure) | Infrastructure automations (42.*, 41.*) |
| A10 (integrate) | All persona-fit automations per tier |
| A11 (operate) | 23.* (analytics), 31.* (retention), 20.* (compliance) |
| D1–D6 (sustainment) | 32.* (offboarding), 33.* (vendor), 37.* (QA) |

The planner uses stage gates: a tenant at A4 can't deploy 23.* (reporting) because there's nothing to report on yet. The UI surfaces this as "Available after X" with a clear unlock condition.

## Messaging surfaces per persona

From `PERSONA_HOMEPAGE_MESSAGING.csv` and Part 1 of the UX Bible:

| Persona | Hero line | Primary CTA | Trust cue |
|---|---|---|---|
| Solo Steve | "Stop working 70-hour weeks. Keep the phone off at dinner." | "Start with a $19 automation" | Facebook-group testimonials |
| Manager Maria | "Your team's tribal knowledge, turned into repeatable systems." | "See the 10-automation Growth pack" | Case study from similar-size biz |
| Owner Omar | "Scale revenue without stacking payroll." | "Book a 45-min architecture call" | Peer recs from mastermind circles |
| Franchise Fran | "Every location runs your best location's process." | "Request enterprise trial" | SOC2, per-location pricing |
| Startup Sam | "Automations your future self will thank you for." | "Buy the lifetime pack" | GitHub repo, docs depth |
| Agency Alex | "Client onboarding in 3 hours, not 3 weeks." | "Get the agency pack + white-label" | Agency-community proof |
| Compliance Carol | "Never miss another deadline." | "Audit-ready compliance, $149/mo" | Regulatory certifications |
| Field Service Fred | "Know where every tech is — without asking." | "Start dispatch pack ($99/mo)" | Route-reduction KPI |
| Bookkeeper Beth | "Reconciliation that reconciles itself." | "Free trial, QBO/Xero ready" | Accounting-firm endorsements |
| Marketing Mike | "From one article to 30 social posts — automated." | "Start the content pipeline" | ROAS/traffic deltas |

These are carried through into the deployer's tenant onboarding templates (`tenants/_template/onboarding/<persona>.md`) so each deployed automation's user-facing comms match the tenant's persona voice.

## Special-case persona groups

### Group 2 (PA CROP Services)
Four hyper-specific personas for the PA compliance vertical. These feed into `vertical-specific` deployer variants — see `analysis/per-category/cat-20-compliance.md` and `cat-43-business-formation.md`.

### Group 3 (Productized Service Buyers — 8 verticals)
These 8 verticals (coach, agency, SaaS, real estate, legal, healthcare, local-service, ecomm-service-hybrid) drive **bundle presets**. Each bundle in `registry/bundles.json` has a `vertical_fit:` tag keyed on Group 3.

### Group 4 (SuiteDash Implementation — 3 personas)
Drives a SuiteDash-only tenant variant: skip all non-SuiteDash automations, deep-configure SuiteDash native automations (catalog Layer 2).

### Group 5 (Notary / Title)
A narrow vertical with heavy compliance and document-generation needs. Drives presets emphasizing categories 7, 20, 35, 43, 44.

## How the deployer uses this

1. `deployer interview --tenant X` asks the 6 questions.
2. Produces a persona distribution (e.g., `{ manager_maria: 0.7, agency_alex: 0.2, field_service_fred: 0.1 }`).
3. Scores all 353 automations against the distribution.
4. Presents top-20 with a rationale.
5. Operator confirms or drops some, adds vertical-specific picks.
6. Final selection lands in `tenants/X/selected-automations.yaml` with rationale inline so future re-selection can be audited.

See `deployer/lib/selector.mjs` for the implementation.
