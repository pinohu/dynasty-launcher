# Automation Deployer

**Autonomously deploy any of 353 service-business automations to any business's own infrastructure.**

This repo is a companion to — and extracted analysis of — the Dynasty Launcher `docs/` knowledge base (the **353-automation catalog**, the **7-part UX Bible**, **JTBD / service-blueprint map**, and the **19-persona master**). It turns that reference material into an executable deployment system.

## What this repo gives you

1. **Complete copies of the source docs** under `docs-source/` — frozen snapshot for analysis and reproducibility.
2. **Deep analysis** under `analysis/` — a taxonomy, tech-stack matrix, dependency graph, deployment topology guide, packaging strategy, and per-category playbooks.
3. **A machine-readable registry** (`registry/automations.json`) — all 353 automations normalized as typed records with category, persona fit, stack, trigger type, credentials required.
4. **Per-automation deployment manifests** (`manifests/`) — YAML files that declaratively describe how to provision one automation: code artifacts, n8n workflow template, env schema, webhook wiring, health checks, rollback.
5. **Per-tenant configuration** (`tenants/`) — each customer business is a YAML folder. Onboard once, re-provision forever.
6. **A deployer CLI + API** (`deployer/`, `api/`) — `init → interview → plan → deploy → verify → status → rollback`. Runs on a laptop or as Vercel serverless functions.
7. **n8n workflow templates** (`workflows/`) — importable JSON exports for every automation that needs a scheduled or webhook-driven orchestration.

## Why this exists

The Dynasty Launcher's `api/provision.js` and `api/automation-catalog.js` already orchestrate up to 50 n8n workflows per build, but they're **coupled to a single delivery pipeline** (generate code → deploy to Vercel → wire modules). This repo **decouples** the 353 automations from that pipeline so they can be delivered:

- To an **existing** business that already has its own Vercel / GitHub / domain — not just a freshly generated app.
- **À la carte** — pick 3 automations, not 17 modules.
- **On the customer's own vendor accounts** — respecting the credential-boundary policy from `CLAUDE.md` ("shipped apps should sustain themselves on the customer's own vendor accounts").
- **Autonomously** — given only a short interview, the deployer picks the right automations, provisions them, wires webhooks, and reports back.

## Quickstart

```bash
# 1. Install
npm install

# 2. Create a tenant (a business you're deploying for)
npx automation-deployer init --tenant acme-plumbing

# 3. Run the interview to select automations automatically
npx automation-deployer interview --tenant acme-plumbing

# 4. Review the plan (dry-run; no side effects)
npx automation-deployer plan --tenant acme-plumbing

# 5. Deploy (provisions repos, n8n workflows, webhooks, env vars)
npx automation-deployer deploy --tenant acme-plumbing

# 6. Verify
npx automation-deployer verify --tenant acme-plumbing

# 7. Rollback if anything is off
npx automation-deployer rollback --tenant acme-plumbing --automation 1.01
```

## Repo map

```
automation-deployer/
├── README.md                   # You are here
├── ARCHITECTURE.md             # System design, data flow, deploy model
├── DEPLOYMENT_MODEL.md         # Per-tenant topology + credential boundary
├── docs-source/                # Frozen copies of the 14 source docs
├── analysis/                   # Deep analysis (NEW content)
│   ├── 00-executive-summary.md
│   ├── 01-catalog-synthesis.md
│   ├── 02-automation-taxonomy.md
│   ├── 03-persona-buying-journey.md
│   ├── 04-jtbd-to-automation-map.md
│   ├── 05-service-blueprint-coverage.md
│   ├── 06-tech-stack-matrix.md
│   ├── 07-dependency-graph.md
│   ├── 08-pricing-packaging.md
│   ├── 09-deployment-topologies.md
│   ├── 10-risk-and-boundaries.md
│   └── per-category/           # One deep-dive per catalog category
├── registry/                   # Machine-readable catalog
│   ├── automations.json        # All 353 automation records
│   ├── categories.json         # 45 category definitions
│   ├── personas.json           # 19 personas + buying behavior
│   ├── stacks.json             # Vendor/tool definitions
│   └── generator.mjs           # Rebuilds registry from catalog MD
├── manifests/                  # Per-automation deployment YAML
├── workflows/                  # n8n workflow JSON templates
├── tenants/                    # Per-business configs (git-ignored values)
│   └── _template/              # Copy this to create a new tenant
├── deployer/                   # Core deployer (CLI + library)
│   ├── cli.mjs
│   ├── lib/                    # Tenant, provisioner, secret vault, clients
│   └── commands/               # init, interview, plan, deploy, verify, rollback
├── api/                        # Vercel serverless deployer endpoints
├── schemas/                    # JSON Schemas (manifest, tenant, plan)
├── scripts/                    # Parser, validators, scaffolders
└── tests/                      # Vitest
```

## Source

All 14 source docs live under `docs-source/`:

- `SERVICE_BUSINESS_AUTOMATION_CATALOG.md` — 353 automations across 45 categories
- `AUTOMATION_UX_BIBLE_PART1.md` through `PART7.md` — AIDA messaging + pain mapping per automation
- `JTBD_JOURNEYS_AND_SERVICE_BLUEPRINTS.md` — 26 JTBD clusters, 4 journey maps, 9 service blueprint episodes
- `PERSONA_GROUPS_MASTER.md` — 19 personas across 5 buyer groups
- `PERSONA_HOMEPAGE_MESSAGING.csv`, `PERSONA_JOURNEY_STAGE_TRACE.csv`, `PERSONA_SERVICE_BLUEPRINT_TRACE.csv` — machine-readable traces
- `MARCH_2026_AUTOMATIONS_INVENTORY.md` — real reference implementation (PA CROP Services, 146 live automations)

## Relationship to Dynasty Launcher

This repo is derived from and depends on the Dynasty Launcher knowledge base but is **architecturally independent**:

- Dynasty Launcher provisions a **new** app end-to-end (docs + code + deploy) for a business idea.
- Automation Deployer ships **existing automations** into an **existing** business's stack, one at a time.

They share schemas (`DYNASTY_TOOL_CONFIG` structure) and can co-exist: a Launcher-built app can be onboarded as a tenant of the Deployer to pick up incremental automations post-launch.

## License

Proprietary — Dynasty Empire LLC. See `LICENSE`.
