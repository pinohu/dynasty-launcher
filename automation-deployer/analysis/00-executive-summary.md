# 00 — Executive Summary

## What's in the source docs

The 14 documents under `docs-source/` encode a full go-to-market and operations playbook for a service-business automation company:

| Artifact | Size | What it contains |
|---|---|---|
| `SERVICE_BUSINESS_AUTOMATION_CATALOG.md` | 100K | **353 atomic automations** across 45 functional categories. Each entry has task description, trigger, output, and tool stack. |
| `AUTOMATION_UX_BIBLE_PART1..7.md` | 280K | AIDA (attention/interest/desire/action) messaging, pain points, and persona mapping for every one of the 353 automations. |
| `JTBD_JOURNEYS_AND_SERVICE_BLUEPRINTS.md` | 29K | **26 JTBD clusters** (J01–J26), **4 journey maps** (outcome-led, control-led, procurement, sustainment), **9 service-blueprint episodes** (SB00–SB08), and coverage matrices. |
| `PERSONA_GROUPS_MASTER.md` | 27K | **19 personas** across 5 buyer groups (service-biz general, PA-CROP, productized-service verticals, SuiteDash, notary/title). |
| `MARCH_2026_AUTOMATIONS_INVENTORY.md` | 15K | Real reference implementation: 146 automations live for PA CROP Services. Proves the catalog is deployable. |
| 3× CSVs | 6K | Machine-readable persona/journey/blueprint traces. |

## The opportunity this repo unlocks

The catalog is an **intellectually complete** spec but delivery today is **monolithic** — the Dynasty Launcher's `api/provision.js` ships up to 17 pre-wired modules only when it generates a fresh app end-to-end (`api/automation-catalog.js` further wraps this in 353 workflow definitions for the customer's repo). A business that already has a website, a CRM, and an n8n instance can't buy "just automation 1.01 + 3.04 + 22.07."

This repo reframes delivery around **three decoupled primitives**:

1. **Registry** — 353 typed records (`registry/automations.json`) — the source of truth.
2. **Manifest** — per-automation declarative YAML — the deployment contract.
3. **Tenant** — per-business folder — the deployment target.

Adding a new automation is one manifest + one optional n8n workflow JSON. Onboarding a business is one `tenant.yaml`. Deploying is `init → interview → plan → deploy → verify`.

## Coverage summary

### By category size (top 10 of 45)

| # | Category | Count |
|---|---|---|
| 1 | Lead Generation & Prospecting | 20 |
| 2 | Lead Capture & Intake | 15 |
| 3 | Lead Qualification & Scoring | 10 |
| 4 | CRM & Contact Management | 10 |
| 5 | Sales Pipeline & Follow-Up | 10 |
| 8 | Client Onboarding | 10 |
| 9 | Scheduling & Appointments | 10 |
| 10 | Project & Task Management | 10 |
| 11 | Service Delivery & Fulfillment | 10 |
| 15 | Invoicing & Billing | 10 |

The long tail — 44 categories from 6 to 10 entries — is exactly what makes this a marketplace rather than a bundled product.

### By persona load (primary + secondary buyer fit)

| Persona | Primary fit | Secondary fit | Top categories |
|---|---|---|---|
| Solo Steve | 6 | 4 | 1-5, 8-9, 12-15, 21, 35 |
| Manager Maria | 8 | 6 | 4-5, 8, 10-11, 18, 22-23, 36-37 |
| Owner Omar | 11 | 8 | 1, 5-7, 10, 15-17, 23, 27, 30-31, 38, 45 |
| Franchise Fran | 9 | 10 | 8, 10-11, 18, 22-23, 37-38, 41, 45 |
| Startup Sam | 12 | 5 | 1-3, 8, 12-14, 24-28, 39, 42, 45 |
| Agency Alex | 10 | 7 | 5-8, 10-11, 15, 23-24, 30-31, 39 |
| Compliance Carol | 7 | 5 | 7, 20, 35, 37, 41, 43-44 |
| Field Service Fred | 6 | 5 | 8-11, 14, 38 |
| Bookkeeper Beth | 6 | 4 | 15-17, 20, 23, 35 |
| Marketing Mike | 8 | 6 | 24-28, 42 |

No persona is starved; no persona gets everything. Packaging per-persona (3-pack, 10-pack, full-stack) is addressable.

### By trigger type (derived from catalog)

| Trigger | Automation count | Typical topology |
|---|---|---|
| Cron (scheduled) | ~140 | T1 (pure n8n) |
| Webhook (event-driven) | ~95 | T3 (hybrid) |
| On-demand / API call | ~70 | T2 (Vercel serverless) |
| CRM tag change | ~30 | T4 (vendor-native) |
| Manual operator action | ~18 | mixed |

Cron is the largest slice, which means n8n is the default execution engine.

### By required vendor (top 10)

| Vendor | Automations requiring it |
|---|---|
| n8n | ~270 |
| SuiteDash (CRM/portal) | ~110 |
| Emailit (transactional email) | ~85 |
| Stripe (billing) | ~40 |
| Acumbamail (marketing email) | ~38 |
| OpenAI / Groq / Claude (LLM) | ~52 |
| Neon Postgres (data) | ~47 |
| Twilio / SMS-iT | ~32 |
| Google APIs (GBP, Sheets, Calendar) | ~28 |
| Stripe-adjacent (Lob, QBO, Xero) | ~22 |

A tenant with n8n + SuiteDash + Emailit + Stripe + one LLM provider can run **≈200 of the 353** automations.

## Core design decisions

1. **Manifests over scripts.** Every automation is described by a YAML contract. The deployer interprets contracts; manifests don't contain logic. This lets a non-engineer author a new automation by editing YAML and maybe an n8n JSON export.

2. **Per-tenant folders.** Tenants are git-native (YAML + encrypted env). A dry-run is `git diff`. A rollback is `git revert`.

3. **Idempotent drivers.** Every driver (n8n, vercel, github, stripe, etc.) is safe to re-run. Failure is recoverable without manual cleanup.

4. **Credential boundary enforced at the schema.** The manifest schema has a required `source:` field on every secret that makes `source: deployer` at runtime a schema-level error.

5. **LLM-augmented interview, rule-driven plan.** The interview step may use an LLM to rank candidates but the plan step is fully deterministic. Auditability > cleverness.

6. **Single source of truth for the catalog.** `scripts/parse-catalog.mjs` extracts automations from `docs-source/SERVICE_BUSINESS_AUTOMATION_CATALOG.md`. If the catalog changes, the registry rebuilds. If a human edits the registry directly, `scripts/validate.mjs` fails CI.

## What ships in this repo

| Area | Scope in this repo |
|---|---|
| Source docs | **All 14**, verbatim copies under `docs-source/` |
| Deep analysis | **11 top-level analysis files** + **per-category stubs** for all 45 |
| Registry | Schema + generator + **all 353 automations indexed** |
| Manifests | **Exemplar manifests for ~15 canonical automations** spanning all 5 topologies + a template |
| Workflow JSON | **Exemplar n8n workflows for the same set** |
| Deployer CLI | Full CLI (`init/interview/plan/deploy/verify/rollback/upgrade/status`) with lib modules + driver contract + 4 stub drivers (n8n, vercel, github, webhook-router) |
| API | Vercel-compatible serverless endpoints (`/api/provision`, `/api/webhook-router`, `/api/health`, `/api/tenants`) |
| Schemas | JSON Schemas for manifest, tenant, plan |
| Tenant | Template + one example tenant (`acme-plumbing`) |

## What doesn't ship (deliberately)

- Full manifests for all 353 automations (templates generated from the catalog are present, but the operator must fill in trigger specifics per manifest as each is put into service).
- Production secret-management (age/sops) — wired into the CLI but not configured.
- Vendor credential OAuth apps (each deployment operator registers their own).

See individual analysis docs in `analysis/` for category-specific depth.
