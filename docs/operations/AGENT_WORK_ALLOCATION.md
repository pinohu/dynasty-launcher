# Agent Work Allocation

**Purpose:** with unlimited agents available, this document defines who owns
what, what each agent can change, what each agent must never touch, handoff
rules, definition of done, and escalation rules.

**Why it matters:** unlimited agents without non-overlap rules produces
chaos. This document is the reason that doesn't happen.

**Last updated:** 2026-04-15

---

## The 8 teams

1. **Program Office** — orchestration, status, blockers, release coordination
2. **Architecture** — schemas, registries, activation contract, core services
3. **Module Build** — one squad per pack (5 squads at launch)
4. **Integration** — vendor integrations (email, sms, phone, calendar, etc.)
5. **UI** — marketplace, onboarding, module settings, dashboard
6. **QA / Release** — validation harness, activation tests, release signoff
7. **Commercial Ops** — pricing files, edition definitions, bundle math, sales collateral, objection tracking
8. **Observability / Support** — logs, alerts, diagnostics, runbooks

---

## Team detail — what each team owns and cannot touch

### 1. Program Office

**Owns (may change):**
- `docs/operations/PRODUCTION_PROGRAM_BOARD.md`
- `docs/operations/MODULE_RELEASE_SCOREBOARD.md`
- `docs/operations/RELEASE_TRAIN.md`
- Status fields across all tracked files
- Weekly status notes

**Never touches:**
- Module JSON in `product/modules/` (statuses updated only after Module Build provides evidence)
- Pricing in `product/pricing/`
- Runtime code in `api/`

**Inputs from:** every other team's status updates

**Outputs to:** Architecture (blocker surfacing), founder (weekly rollup)

---

### 2. Architecture

**Owns:**
- `product/schema/*.schema.json` (all 8)
- `product/capabilities/*.json` definitions
- `api/catalog/*` — registry readers
- `api/tenants/*` — tenant creation, activation, deactivation
- `api/events/*` — ingestion, trigger evaluation, opportunity cards
- `docs/architecture/*`
- `docs/operations/ACTIVATION_FLOW_SPEC.md`
- `docs/operations/CAPABILITY_IMPLEMENTATION_MAP.md` (structural parts)

**Never touches:**
- Module workflow implementations (owned by Module Build)
- Vendor SDK code (owned by Integration)
- UI code (owned by UI)
- Template content (owned by Module Build)
- Pricing values (owned by Commercial Ops)

**Inputs from:** Commercial Ops (commercial decisions), Module Build (capability requests)

**Outputs to:** Module Build (interfaces), Integration (capability contracts), UI (endpoints)

---

### 3. Module Build — 5 squads

One squad per launch pack. Each squad owns a set of modules end-to-end from
`spec` → `live`.

| Squad | Modules owned |
|---|---|
| Squad A — Lead Capture | `missed_call_textback`, `webform_autoreply`, `instant_lead_ack`, `after_hours_autoresponder`, `speed_to_lead_response`, `voicemail_transcription` |
| Squad B — Scheduling | `appointment_confirmation`, `appointment_reminder`, `no_show_recovery`, `reschedule_workflow` |
| Squad C — Reviews | `post_job_review_request`, `unhappy_customer_interception` |
| Squad D — Billing | `invoice_sent_notification`, `overdue_invoice_reminder`, `payment_recovery` |
| Squad E — Retention / Sales | `dormant_customer_reactivation`, `service_due_reminder`, `estimate_followup`, `proposal_view_tracker`, `lost_deal_reactivation` |

**Owns (per squad):**
- Module JSON files (assigned modules only)
- Workflow implementations in `templates/workflow-templates/{module_code}/`
- Message templates in `templates/message-templates/`
- Module-specific preflight + postflight validators
- Module-specific rollback logic
- Module tests
- Module-specific observability events
- Customer-facing module description + first-run docs

**Never touches:**
- Schemas (owned by Architecture)
- Capability runtime (owned by Integration)
- UI rendering (owned by UI)
- Pricing values (owned by Commercial Ops)
- Other squads' modules

**Inputs from:** Architecture (interfaces), Integration (capability readiness)

**Outputs to:** QA/Release (for promotion gate review)

---

### 4. Integration

**Owns:**
- Vendor SDK wrappers for each capability
- Capability-level setup wizards
- Webhook handlers for vendor callbacks
- Vendor credential storage (tenant-scoped)
- Capability verification checks
- Fallback logic between vendors within a capability

**Never touches:**
- Module-specific workflow logic (owned by Module Build)
- Schema definitions (owned by Architecture)
- Pricing (owned by Commercial Ops)

**Inputs from:** Architecture (capability contracts), Module Build (capability needs)

**Outputs to:** Module Build (capability availability), Observability (vendor health)

---

### 5. UI

**Owns:**
- `app.html` (transitioning to `app/` over time)
- `index.html`
- Marketplace views
- Onboarding flows
- Module settings forms
- Dashboard widgets
- Opportunity card rendering
- Blueprint selection UI

**Never touches:**
- Runtime API logic (owned by Architecture)
- Module workflows (owned by Module Build)
- Vendor integrations (owned by Integration)
- Schemas or product JSON (read-only from UI)

**Inputs from:** Architecture (endpoints), Commercial Ops (copy, pricing)

**Outputs to:** QA/Release (UI test coverage)

---

### 6. QA / Release

**Owns:**
- `docs/operations/QA_MATRIX.md`
- Automated test suites (unit, integration, end-to-end)
- Staging tenant management
- Promotion gate reviews
- Release signoff

**Never touches:**
- Production module state (only recommends promotions)
- Module implementations (but can request changes)

**Inputs from:** every other team's deliverables

**Outputs to:** Program Office (promotion evidence)

---

### 7. Commercial Ops

**Owns:**
- `product/pricing/*.json` (tiers, bundle-pricing, module-pricing)
- `product/bundles/*.json` (pack definitions)
- `product/personas/*.json`
- `docs/strategy/COMMERCIAL_DECISIONS.md`
- `docs/operations/PRICING_BILLING_IMPLEMENTATION_SPEC.md` (values, not enforcement logic)
- `docs/operations/SALES_VALIDATION_PLAN.md`
- Homepage copy
- Sales playbook / objection log

**Never touches:**
- Module implementations
- Activation flow contract
- Schema definitions
- Runtime code

**Inputs from:** Sales validation calls (objection data), Program Office (what's shippable)

**Outputs to:** UI (pricing data, copy), Architecture (commercial decisions)

---

### 8. Observability / Support

**Owns:**
- Log formats and ingestion
- Metric definitions
- Alert rules
- Support runbooks (per module)
- Failure classification taxonomy
- `docs/operations/*` failure-mode sections

**Never touches:**
- Module implementations (but can request observability hooks)
- Pricing
- Schemas

**Inputs from:** Module Build (events), Integration (vendor health)

**Outputs to:** every team (failure signal), Commercial Ops (customer-facing errors)

---

## Non-overlap rules

These rules prevent agents from stepping on each other:

1. **One owner per file.** If two teams both need to modify a file, exactly
   one owns the file; the other opens a change request.

2. **Schemas are Architecture-only.** No other team may add or remove fields
   in `product/schema/*.schema.json`. Other teams request schema changes via
   a documented issue.

3. **Pricing values are Commercial Ops-only.** Architecture enforces; UI
   reads; no one else writes.

4. **Runtime code is tier-locked.**
   - `api/catalog/*` = Architecture
   - `api/tenants/*` = Architecture
   - `api/events/*` = Architecture
   - `api/provision.js` mod_* functions = Integration (legacy) or Module Build (new)

5. **Module JSON files are squad-scoped.** Squad A doesn't edit Squad B's
   module files.

6. **UI never includes runtime behavior.** UI calls API endpoints; UI does
   not embed business logic that belongs in Architecture or Module Build.

7. **QA may request changes but may not merge them.** QA opens issues
   against the team that owns the file.

8. **Observability events are defined by Module Build, not Observability.**
   Observability consumes and alerts; it does not invent events modules
   should emit.

---

## Handoff rules

### Module `spec` → `implemented`
- Module Build: code + templates + tests
- Handoff to: QA/Release for validation
- Artifact: a passing CI run + staging-tenant activation recording

### Module `implemented` → `validated`
- QA/Release: runs full test matrix on staging
- Handoff to: Architecture + Module Build for any fixes
- Artifact: signed QA report referenced in the module JSON's commit message

### Module `validated` → `deployable`
- QA/Release: confirms end-to-end activation with zero human steps
- Handoff to: Program Office for status update
- Artifact: screen recording + postflight log + rollback test pass

### Module `deployable` → `live`
- Ops: counts paying tenants, monitors failure rate, tracks compliance violations
- Handoff to: Commercial Ops for marketing clearance
- Artifact: 10-tenant activation log + 30-day failure-rate metric + zero-violation audit

### Capability `setup` → `ready`
- Integration: wizard works end-to-end on staging
- Handoff to: Architecture for capability-registry confirmation
- Artifact: wizard completion video + verification-check passing

---

## Definition of Done — per team

### Program Office DoD
- Every track has a current owner, status, and next-milestone
- Scoreboard reflects current reality (updated within 48h of any status change)
- Weekly status doc published

### Architecture DoD (per feature)
- Code written
- Tests passing
- Documentation updated in `docs/architecture/`
- Interface stable for at least 24h before downstream teams consume

### Module Build DoD (per module)
- All 16 admission criteria in [AUTOMATION_DEPLOYABILITY_STANDARD.md](../architecture/AUTOMATION_DEPLOYABILITY_STANDARD.md) satisfied
- Module promoted through the full status ladder
- Evidence on file

### Integration DoD (per capability)
- Vendor SDK wrapped, tested
- Setup wizard completable on staging
- Verification checks passing
- Fallback logic in place (if multiple vendors)

### UI DoD (per screen)
- Renders from API data (no hard-coded values)
- Accessible (keyboard nav, screen reader tested)
- Mobile responsive
- End-to-end tested

### QA/Release DoD (per module)
- Happy-path test passes
- Missing-capability path test passes
- Failed-provisioning path test passes
- Rollback path test passes
- Cancellation path test passes
- Reactivation path test passes

### Commercial Ops DoD
- Pricing files match the ladder
- Homepage copy matches positioning
- Sales playbook answers 10 most common objections
- Objection log updated after every call

### Observability/Support DoD
- Every module emits all declared events
- Every alert fires before a customer-visible failure
- Every runbook documented for every `live` module

---

## Escalation rules

### Level 1 — Intra-team
Normal work: PR review, squad lead call.

### Level 2 — Cross-team disagreement
If two teams disagree on an interface or contract:
1. Open an issue naming both teams
2. Architecture arbitrates interface disputes
3. Commercial Ops arbitrates commercial disputes
4. Program Office arbitrates schedule disputes

### Level 3 — Standard exception
Anything that would violate [AUTOMATION_DEPLOYABILITY_STANDARD.md](../architecture/AUTOMATION_DEPLOYABILITY_STANDARD.md):
1. Stop work
2. Surface to Program Office
3. Founder decides (update standard or fix the module)

### Level 4 — Security or compliance incident
1. Stop deployment immediately
2. Observability/Support owns incident response
3. Architecture + Commercial Ops assist

---

## Anti-patterns (don't do these)

- Agents silently modifying files outside their team's ownership
- Cross-team work without documented handoff
- Skipping promotion gates because "we're behind"
- Adding `assisted` activation as a shortcut
- Hardcoding tenant-specific logic in production
- Deviating from `ACTIVATION_FLOW_SPEC.md` because "this module is special"
- Emitting events that aren't declared in the module JSON
- Shipping modules past `spec` without evidence

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-04-15 | 8-team structure + non-overlap + handoff + DoD + escalation | Claude (drafted), pinohu (owner) |
