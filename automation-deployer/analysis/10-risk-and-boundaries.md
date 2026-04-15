# 10 — Risk & Boundaries

Explicit articulation of the failure modes, trust boundaries, and security/compliance posture the deployer must maintain.

## The three boundaries

### Boundary A: Deployer ↔ Tenant
- The deployer is a **provisioner**, not a runtime dependency.
- Nothing the deployer deploys should fail if the deployer's infrastructure disappears tomorrow.
- The deployer may receive opt-in heartbeats from deployed automations but these are best-effort observability, not required.

### Boundary B: Tenant ↔ Tenant's customer
- The tenant's customers' PII lives on the tenant's vendors (CRM, email, payments).
- The deployer never reads or stores the tenant's customer data. T5 workers handle payloads ephemerally.
- Automations that handle PII (source class `customer_pii` or `financial`) are flagged in the manifest and additionally require the tenant to acknowledge the data-handling scope during `deploy`.

### Boundary C: Deployer operator ↔ Tenant secrets
- Tenant secrets are age-encrypted at rest in `tenants/<slug>/.secrets/`.
- Decryption happens in-memory during a deploy run.
- The operator's workstation is a risk surface; `deployer rotate` makes full key rotation a one-command operation.

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Tenant's Stripe webhook secret leaks via misconfigured env | M | H | Driver refuses to set Stripe webhook secret on deployer-adjacent infra; only on tenant's own Vercel |
| Tenant's LLM bill spikes from runaway automation | M | M | `estimated_monthly_tokens` in manifest + plan-time warning; 45.* orchestrator has default token caps |
| Vendor API change breaks a deployed automation silently | H | M | `health_check` in every manifest; daily aggregated health report to operator |
| Multiple tenants share a Vercel OAuth token | L | H | Each tenant has its own OAuth-scoped token in `.secrets/`; deployer refuses cross-tenant token reuse |
| Public-record scraper violates TOS | M | L | T5 workers include User-Agent tagging + rate limits; runbook per source |
| Operator's workstation is compromised | L | H | age-encrypted secrets; short-lived tokens; operator MFA required for vendor OAuth |
| A manifest is edited post-deploy and diverges from deployed state | M | M | `deployer drift` command compares manifest vs deployed resource; surfaces diff |
| CRM dedup automation double-processes during retries | M | M | All drivers are idempotent; automations use idempotency keys (enforced at schema) |
| A tenant unsubscribes from a vendor but automation keeps firing | M | L | Pre-flight check per automation; graceful disable on vendor auth failure |

## Data-handling classifications

Every manifest declares one of:

- `public` — only touches public-record or public-website data.
- `internal` — tenant's own business data (their own contacts, deals, invoices to their own customers).
- `customer_pii` — tenant's customers' personal info.
- `financial` — money-handling (card numbers handled by vendor, but amounts/account refs in play).
- `regulated` — HIPAA, PCI, GLBA, FERPA, etc.

The deployer applies extra guardrails based on classification:

| Class | Added behavior |
|---|---|
| `customer_pii` | Tenant must sign a data-handling acknowledgement before deploy |
| `financial` | Webhook endpoints require HMAC signing; idempotency keys required |
| `regulated` | Manifest must specify compliance attestations and the deployer logs richer audit |

## Observability & audit

Every deploy run produces a JSONL log at `tenants/<slug>/history/<timestamp>.jsonl`:

```
{"ts":"...","event":"plan.start","plan_id":"..."}
{"ts":"...","event":"driver.n8n.import_workflow","automation_id":"1.01","status":"ok","duration_ms":480}
{"ts":"...","event":"driver.vercel.set_env","automation_id":"2.01","vars":["GOOGLE_API_KEY"],"status":"ok"}
{"ts":"...","event":"plan.complete","automations":10,"failed":0}
```

Logs contain only metadata; no payload bodies, no secrets. `deployer audit --tenant X --since 30d` produces a human-readable report for tenant-side review.

## Compliance posture

- **No SOC2 claim** — the deployer is not independently audited. Tenants with SOC2 obligations must perform their own vendor-risk assessment.
- **GDPR / CCPA** — The deployer processes tenant data only during deploy runs. There's no long-running personal-data storage on deployer infra. A DPA template lives at `legal/DPA_template.md`.
- **HIPAA** — Off-the-shelf the deployer is not HIPAA-ready. The `regulated` automation class exists for tenants who bring their own HIPAA-compliant stack; the deployer does **not** cover BAAs with vendors.

## What "autonomous" means — and doesn't mean

The deployer is autonomous at the **selection + provisioning** level:

- It can interview a tenant, pick automations, compute a plan, and deploy without human babysitting.
- It cannot and should not autonomously provision automations that touch PII without operator confirmation.
- It cannot and should not autonomously rotate vendor credentials that require human-in-the-loop (Stripe business verification, DNS records).

The interview surfaces these gates as `[CONFIRM]` steps; the deploy halts at them until the operator or tenant clicks through.

## Kill-switch

Two kill-switches are available:

### Per-automation
`deployer disable --tenant X --automation 1.01` — deactivates without uninstalling. Preserves configuration for rapid re-enable.

### Per-tenant
`deployer freeze --tenant X` — disables every deployed automation and revokes the deployer's transient credentials against the tenant's infra. No resources are destroyed. Full restoration via `deployer unfreeze`.

## Incident-response playbook

1. Detect via health check failure cascade or manual report.
2. `deployer freeze --tenant X` if tenant scope.
3. `deployer disable --automation <id>` if single-automation scope.
4. Forensic: read `tenants/<slug>/history/` for the relevant window.
5. Fix the manifest or driver.
6. `deployer deploy --dry-run` to re-plan.
7. `deployer unfreeze` or re-enable.

The playbook is in `deployer/runbooks/incident.md`.
