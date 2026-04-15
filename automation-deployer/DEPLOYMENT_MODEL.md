# Deployment Model

This document defines **where each automation runs**, **who holds the keys**, and **how the deployer orchestrates delivery** without becoming a permanent dependency.

## 1. Topologies

An automation can be deployed in one of five topologies, selected per manifest. The deployer selects the right topology based on the automation's trigger, latency, and data sensitivity.

### T1 — Pure n8n (hosted on tenant's n8n)

**When to use:** Scheduled tasks, internal integrations, data-enrichment jobs that don't need sub-second latency and don't serve end users.

**Stack:** Tenant's own n8n instance (self-hosted, Railway, or n8n Cloud).
**Artifact:** `workflows/<id>-<slug>.json` imported via n8n REST API.
**Credentials:** Stored in the tenant's n8n credential store. Deployer writes once, then forgets.
**Webhook URL:** `https://<tenant-n8n>/webhook/<id>-<slug>`
**Example automations:** 1.01 (GBP monitor), 1.03 (new filing alert), 26.* (SEO tasks), 31.* (retention workflows).

### T2 — Vercel serverless endpoint (on tenant's Vercel project)

**When to use:** Synchronous APIs called by the tenant's frontend or by webhooks that require fast response (<3s). Examples: form intake, lead qualification, chatbot routing.

**Stack:** Vercel serverless function deployed to the tenant's own Vercel team/project.
**Artifact:** `/api/<slug>.js` pushed to a repo the tenant owns on GitHub.
**Credentials:** Vercel environment variables set via Vercel API during provisioning.
**Example automations:** 2.01 (web form → CRM), 3.01 (lead qualifier), 22.* (AI chat endpoints), 42.* (website ops).

### T3 — Hybrid (Vercel API → n8n workflow)

**When to use:** The interface has to be an HTTP endpoint (for browser CORS, form actions), but the work is longer-running or fans out to many systems.

**Flow:** Browser → Tenant's Vercel endpoint → HTTP POST to tenant's n8n webhook → long-running orchestration.
**Example automations:** 1.14 (cold outreach launcher), 8.* (client onboarding), 27.* (paid ad campaigns).

### T4 — Vendor-native (no code)

**When to use:** The automation is entirely expressible as configuration in a SaaS the tenant already owns.

**Artifact:** A configuration document (e.g., SuiteDash Auto-Template JSON, Stripe product JSON, Acumbamail automation spec).
**Provisioning:** The deployer calls the vendor API to create/update the configuration on the tenant's account.
**Example automations:** 28.* (email-campaign sequences), 8.10 (SuiteDash native drips — see Layer 2 of `MARCH_2026_AUTOMATIONS_INVENTORY.md`).

### T5 — Out-of-band (external agent / scraper)

**When to use:** Work that can't run inside the tenant's infra because of IP/rate/cookies constraints (web scraping, public-record monitoring). The deployer runs a worker on its own infra but ships results to the tenant's endpoints.

**Stack:** Deployer-hosted worker (a separate serverless function) running on a schedule, posting results to the tenant's Vercel API endpoint.
**Boundary policy:** The worker holds **no** tenant business data longer than one run; results transit, they don't accumulate on deployer infra.
**Example automations:** 1.02 (competitor review scanner), 1.03 (SOS filings), 1.08 (Craigslist), 1.19 (court filings).

## 2. The credential boundary (enforced)

This is the non-negotiable rule from `CLAUDE.md`:

> Shipped apps should sustain themselves on the customer's own vendor accounts. Values documented in `.env.example`, `MANUAL-ACTIONS.md`, and env vars on the customer's own Vercel/GitHub — not a permanent dependency on the deployer's shared key pool.

### Credential sources

Every secret has one of three `source:` values in a manifest:

| `source` | Meaning | Lifetime | Example |
|---|---|---|---|
| `tenant` | Tenant owns the account and key | Permanent | Tenant's Google Business API key, Stripe live secret, n8n JWT |
| `customer-input` | Collected interactively during interview | Permanent on tenant side | GBP location ID, Twilio SID if provisioned for them |
| `deployer` | Deployer holds a transient provisioning credential | One-time | A Vercel OAuth token scoped to create one project, then revoked |

**`deployer` sources are never used at runtime.** If an automation needs `deployer`-source credentials at runtime (e.g., a shared paid vendor API), the manifest must declare it `shared_runtime: true` and the deployer will refuse to deploy it until the operator acknowledges the boundary violation in writing.

### Secret transport

1. Operator stores tenant secrets in `tenants/<slug>/.secrets/env.age` (age-encrypted).
2. `deployer deploy` decrypts in memory, pushes secrets to the tenant's Vercel/n8n/GitHub via vendor APIs.
3. The encrypted file is the source of truth. No plaintext ever hits disk outside the tenant's own infra.
4. `deployer rotate` can rewrite keys across every automation without re-provisioning.

## 3. Per-automation lifecycle

```
 ┌─────────────────────────────────────────────────────────────┐
 │ REGISTERED: manifest exists, not deployed to tenant         │
 └─────────────────────────────────────────────────────────────┘
                            │ deployer interview
                            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ SELECTED: in tenant's selected-automations.yaml             │
 └─────────────────────────────────────────────────────────────┘
                            │ deployer plan
                            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ PLANNED: in plan.json, dependencies resolved                │
 └─────────────────────────────────────────────────────────────┘
                            │ deployer deploy
                            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ PROVISIONING: drivers running                               │
 └─────────────────────────────────────────────────────────────┘
                │                               │
                ▼ (success)                     ▼ (failure)
 ┌──────────────────────────┐   ┌──────────────────────────────┐
 │ DEPLOYED                 │   │ FAILED  (auto-rollback)      │
 └──────────────────────────┘   └──────────────────────────────┘
                │ verify
                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ VERIFIED: health_check passed at least once                 │
 └─────────────────────────────────────────────────────────────┘
                │ runtime heartbeats
                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ RUNNING                                                     │
 └─────────────────────────────────────────────────────────────┘
```

Each state transition is logged to `tenants/<slug>/history/`.

## 4. Autonomous selection

The "autonomous" part of the deployer is the **interview → plan → deploy** chain.

### Interview

Inputs: persona, industry, revenue band, goals (top-3), pains (top-3), current stack (what the business already owns), budget band.

Process:
1. Run rule-based matching against `registry/selection-rules.json` (e.g., `persona=field_service_fred → include category 38`).
2. Score each automation by **fit**: `0.5 * persona_match + 0.3 * pain_match + 0.2 * stack_compatibility`.
3. Filter by `stack_compatibility`: drop automations whose required tools the tenant doesn't have and doesn't want to adopt.
4. Present the top-N automations to the operator for confirmation.
5. Write the final list to `tenants/<slug>/selected-automations.yaml`.

Optional LLM augmentation: if `OPENAI_API_KEY` (or any router-compatible key) is set, the deployer asks the LLM to re-rank candidates with reasoning and proposes a 3-pack starter bundle, a 10-pack growth bundle, and a full-stack bundle.

### Plan

The planner:
1. Loads each selected manifest.
2. Builds a dependency graph (e.g., 8.01 client-onboarding depends on 15.01 invoice generation because onboarding triggers a first invoice).
3. Computes a topological order.
4. Walks the order and for each automation determines:
   - Which credentials are already in the tenant's vault.
   - Which need interactive collection.
   - Which resources (n8n workflows, Vercel projects, repos) already exist.
5. Emits a plan document with per-automation deltas.

### Deploy

The provisioner iterates the plan and invokes drivers.

Each driver **must** be idempotent — re-running a driver on an already-provisioned resource is a safe no-op. See `deployer/lib/drivers/` for the driver contract.

## 5. Multi-tenant isolation

- Each tenant has its own folder. The deployer never cross-reads tenant folders.
- Tenant secrets are namespaced on the deployer's key-encryption-key (KEK) — a different KEK per tenant means a leak of one tenant's vault can't decrypt another.
- The deployer's own optional webhook router (for opt-in heartbeats) namespaces tenants by UUID; no tenant can read another's events.

## 6. Failure modes & recovery

| Failure | Behavior |
|---|---|
| A driver throws mid-deploy | The current automation auto-rollbacks; the plan halts; prior automations remain in place |
| Vendor API rate-limit | Exponential backoff up to 4 retries (matches git push policy) |
| Credential missing | `plan` fails with a precise list of what's missing — never silently proceeds |
| n8n instance down | `deploy` fails early with healthcheck output; nothing partial |
| Webhook URL conflict | Resolver picks a deterministic alternative path |

All failures are written to `tenants/<slug>/history/` with full stack traces and driver output.

## 7. Upgrading a deployed automation

```bash
npx automation-deployer upgrade --tenant acme-plumbing --automation 1.01 --to v2
```

Upgrade flow:
1. Diff the v1 and v2 manifests.
2. Compute the minimal driver actions (e.g., "replace n8n workflow JSON, preserve existing credentials, update cron expression").
3. Execute as a new plan with `mode: upgrade`.
4. Keep v1 snapshot in `tenants/<slug>/history/upgrades/` for rollback.

## 8. Non-goals

- **Not a replacement for `api/provision.js` in Dynasty Launcher.** The Launcher still generates full applications. This deployer is for the automation layer only.
- **Not a tenant-of-tenants platform.** The deployer is run by an operator (agency, consultant, or platform team) who has their own relationship with each tenant. It's not a public SaaS.
- **Not a long-running execution engine.** n8n, Vercel, and vendor SaaS are the execution engines. The deployer is the provisioner.
