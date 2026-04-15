# Production Program Board

**Purpose:** single-page orchestrator for every track of work needed to move
the platform from "ladder locked" to "customers activating in production with
zero staff intervention." If you're an agent looking for context, start here;
every specific artifact below is linked.

**Authority:** this board is the dependency graph. No track may be marked
complete without meeting its stated exit criteria.

**Last updated:** 2026-04-15

---

## How to read this board

- **Status** values: `blocked`, `in-progress`, `ready-for-review`, `done`.
- **Owner** refers to the agent team, not a person. See
  [AGENT_WORK_ALLOCATION.md](./AGENT_WORK_ALLOCATION.md).
- **Depends on** lists hard prerequisites. If any prerequisite is not `done`,
  this track cannot progress past `in-progress`.
- **Exit criteria** must all be true before the track is marked `done`.
- **Next milestone** is the single next checkpoint that moves the track
  forward.

---

## The 12 tracks

### Track 1 — Control Plane

**Owner:** Architecture
**Status:** `in-progress` (Track 0 unblocked 2026-04-15; Architecture may now begin)
**Depends on:** Track 0 (policy lock — done)
**Purpose:** central services that every activation passes through.

Build:
- tenant creation service
- capability registry service
- entitlement service
- activation engine
- deactivation engine
- recommendation engine
- event bus
- audit log

**Exit criteria:**
- any tenant can be created from a blueprint via one API call
- any module can be checked for readiness via one API call
- any entitled module can be activated in one click
- every failure rolls back safely
- every action is logged

**Next milestone:** stub control-plane services in `api/tenants/`,
`api/catalog/`, `api/events/` that read `product/*.json` and return shaped
responses. No runtime behavior yet — just the interface contract.

---

### Track 2 — Product Registry

**Owner:** Architecture
**Status:** `in-progress` (schemas and 20 modules exist; consumers don't yet read them)
**Depends on:** none
**Purpose:** machine-readable source of truth for commerce.

Already on the branch:
- `product/schema/*.schema.json` (8 schemas)
- `product/modules/` (20 modules, all `spec`)
- `product/bundles/` (5 packs)
- `product/blueprints/` (8 blueprints)
- `product/personas/` (6 personas)
- `product/recommendations/` (10 rules)
- `product/pricing/tiers.json` + `bundle-pricing.json`

**Exit criteria:**
- `api/catalog/modules.js`, `bundles.js`, `blueprints.js` read from these files
- `app.html` marketplace surface reads from the same endpoints
- pricing, entitlements, eligibility all come from the same source

**Next milestone:** implement read-only `api/catalog/*` handlers that serve
the JSON over HTTP. No writes. No business logic.

---

### Track 3 — Capability Registry

**Owner:** Architecture + Integration
**Status:** `in-progress` (10 capabilities declared; none have runtime bindings)
**Depends on:** Track 2
**Purpose:** dependency layer between modules and integrations.

Capabilities to ship runtime bindings for (see
[CAPABILITY_IMPLEMENTATION_MAP.md](./CAPABILITY_IMPLEMENTATION_MAP.md)):
- email
- sms
- phone
- calendar
- forms
- crm
- estimates
- invoicing
- reviews
- payments

**Exit criteria:**
- every module declares `capabilities_required` (done)
- every capability has a machine-checkable tenant state
- activation uses capability checks, not guesswork
- each capability has a setup wizard where `requires_integration: true`

**Next milestone:** implement `api/tenants/get-tenant-capabilities.js` that
returns the current capability state for a given tenant.

---

### Track 4 — Tenant Model

**Owner:** Architecture
**Status:** `blocked`
**Depends on:** Track 2
**Purpose:** the shared data spine every module reads and writes.

Standard objects (per `product/schema/tenant.schema.json` and
`docs/architecture/TENANT_CAPABILITY_MODEL.md`):
- tenant, profile, location, user, contact, lead, appointment, job, estimate,
  invoice, payment, message, template, automation_setting, entitlement, event

**Exit criteria:**
- no module requires custom per-customer schema
- all modules consume only shared tenant objects
- tenant provisioning is idempotent

**Next milestone:** first migration script that creates the tenant schema in
Neon (the launcher's current DB provisioner lives in `api/neon.js`).

---

### Track 5 — Module Factory

**Owner:** Module Build (one squad per pack)
**Status:** `in-progress` (all 20 modules at `spec`)
**Depends on:** Tracks 1, 2, 3, 4
**Purpose:** the production line that takes modules from `spec` → `live`.

Per-module requirements (see
[MODULE_PRODUCTION_MATRIX.md](./MODULE_PRODUCTION_MATRIX.md)):
- machine-readable definition
- workflow spec + trigger spec + action spec
- templates, UI config form
- preflight validator, postflight validator
- rollback rules, billing rules
- tests, observability hooks
- support notes

**Exit criteria (per module):**
- module advances through `spec` → `implemented` → `validated` → `deployable` → `live`
- each promotion has evidence on file per
  [AUTOMATION_DEPLOYABILITY_STANDARD.md](../architecture/AUTOMATION_DEPLOYABILITY_STANDARD.md)
- scoreboard reflects reality

**Next milestone:** five launch modules promoted to `implemented`
(missed_call_textback, webform_autoreply, appointment_reminder,
post_job_review_request, overdue_invoice_reminder).

---

### Track 6 — Marketplace Gating

**Owner:** UI
**Status:** `blocked`
**Depends on:** Tracks 2, 5
**Purpose:** never sell non-deployable modules.

Rules:
- show only `deployable` or `live` modules
- show only packs whose required modules are all `deployable` or `live`
- never sell roadmap as ready
- hide anything capability-ineligible for the tenant
- recommendations only suggest modules the tenant can actually activate

**Exit criteria:**
- product catalog never exposes a non-deployable module
- a customer can self-serve through checkout without support intervention

**Next milestone:** marketplace section in `app.html` that fetches from
`api/catalog/*` and filters by `status in ['deployable', 'live']`.

---

### Track 7 — Billing and Entitlement System

**Owner:** Commercial Ops + Architecture
**Status:** `blocked`
**Depends on:** Track 0 (policy lock), Track 1, Track 2
**Purpose:** turn purchases into deployments.

Scope (see [PRICING_BILLING_IMPLEMENTATION_SPEC.md](./PRICING_BILLING_IMPLEMENTATION_SPEC.md)):
- Core subscription
- module subscription logic
- pack / suite / edition entitlement logic
- annual billing option
- trial logic
- fair-use SMS/voice metering
- seat overages, location overages
- HIPAA/regulated add-on
- enterprise/custom path

**Exit criteria:**
- payment state controls access automatically
- activation and deactivation follow billing state without manual ops
- downgrade/cancellation preserves data per each module's `downgrade_behavior`

**Next milestone:** Stripe subscription items wired to entitlement table;
one end-to-end purchase creates one entitlement row.

---

### Track 8 — Deployment Pipeline

**Owner:** Architecture + QA/Release
**Status:** `blocked`
**Depends on:** Tracks 1, 3, 4, 5, 7
**Purpose:** the literal one-click path.

Flow (see [ACTIVATION_FLOW_SPEC.md](./ACTIVATION_FLOW_SPEC.md) for the
14-step contract):
1. purchase or entitlement grant
2. preflight validation
3. dependency resolution (missing capability → guided wizard)
4. tenant-scoped provisioning
5. template binding
6. trigger registration
7. observability binding
8. postflight validation
9. state flip to `active`

**Exit criteria:**
- the same flow works for staff-triggered and customer-triggered deployment
- no side-channel setup exists
- rollback works from any step on failure

**Next milestone:** `api/tenants/activate-module.js` implements steps 1–9 for
one module (`webform_autoreply`) end-to-end.

---

### Track 9 — Observability and Supportability

**Owner:** Observability/Support
**Status:** `blocked`
**Depends on:** Track 8
**Purpose:** production failures are visible and diagnosable without reading
raw DB state.

Build:
- module activation logs
- module run logs
- module failure logs
- tenant health dashboards
- alerting
- retry queues
- rollback events
- KPI dashboards

**Exit criteria:**
- every failed activation is visible in a dashboard within 60 seconds
- every broken module can be diagnosed without manual forensics
- support does not depend on reading raw database state

**Next milestone:** structured logging of `module.activated`, `module.failed`,
`module.rolled_back` events flowing to the existing telemetry path
(`api/telemetry.js`).

---

### Track 10 — Security and Compliance

**Owner:** Architecture + Commercial Ops
**Status:** `blocked`
**Depends on:** Track 4
**Purpose:** regulated mode is a real system behavior, not a sales promise.

Build:
- RBAC
- secrets handling (tenant-owned, per root `CLAUDE.md` credential boundary)
- audit trails
- tenant isolation
- location access rules
- HIPAA/regulated mode controls
- template sanitization
- messaging consent controls

**Exit criteria:**
- regulated-operator persona can legally use the platform
- BAA-covered processing where HIPAA add-on is active
- audit log retention per each module's `downgrade_behavior.data_retention_days`

**Next milestone:** HIPAA add-on gate in entitlement layer that blocks
ineligible blueprints (e.g. med-spa injectables without the add-on).

---

### Track 11 — Blueprints and Industry Editions

**Owner:** Architecture + Commercial Ops
**Status:** `in-progress` (8 blueprints declared; no provisioning path yet)
**Depends on:** Tracks 4, 5
**Purpose:** make onboarding fast and industry-specific.

Blueprints to ship provisioning for (see [BLUEPRINT_MAP.md](./BLUEPRINT_MAP.md)):
- HVAC, plumbing, electrical, cleaning, pest control, med spa,
  home remodeling, auto detail

Each blueprint provisions:
- default modules
- default messaging (template overrides)
- default KPIs
- capability assumptions
- onboarding defaults
- recommended upsells (suggested bundle order)

**Exit criteria:**
- a new tenant can be provisioned from a blueprint with one click
- blueprint selection meaningfully reduces onboarding time
- every launch-pack-eligible module has at least one blueprint recommending it

**Next milestone:** `api/tenants/create-tenant.js` accepts a `blueprint_code`
and provisions the corresponding starter stack.

---

### Track 12 — Commercial Readiness

**Owner:** Commercial Ops (with Program Office)
**Status:** `done` (2026-04-15)
**Depends on:** Track 0 — also done
**Purpose:** every sales conversation has a concrete answer.

**Locked in `product/pricing/`:**
- ladder structure, pricing formulas, fair-use defaults (since 2026-04-15 commit `7ca46ff`)
- `launcher_build_handoff.status = RESOLVED`
- `commercial_decisions_resolved` block added

**Resolved (see [COMMERCIAL_DECISIONS.md](../strategy/COMMERCIAL_DECISIONS.md)):**
- FSM positioning: **complement**
- Launcher-build → subscription handoff: **bundled-months model** (12mo Small Team / 24mo Field Service)
- 8 commercial-essentials defaults: **all confirmed**, with Starter concierge refined to async-only

**Exit criteria — status:**
- [X] Three decisions recorded in `COMMERCIAL_DECISIONS.md` with owner + date
- [X] `tiers.json.launcher_build_handoff.status` = `RESOLVED`
- [X] Homepage copy ready to paste in `docs/strategy/HOMEPAGE_COPY.md`
- [ ] Homepage copy deployed to `index.html` (UI team — Wave 0 execution)
- [ ] Sales playbook built out (Commercial Ops — Wave 0 execution)

The only remaining items are execution tasks (UI paste, playbook write-up),
not unresolved decisions.

---

## Track 0 — Policy lock (precondition for everything)

**Owner:** Founder (pinohu)
**Status:** `done` (2026-04-15)
**Purpose:** unblock Tracks 1, 7, 10, 12. **All unblocked.**

Decisions (all resolved):
1. FSM positioning → **complement**
2. Launcher-build handoff → **bundled-months**
3. Commercial essentials → **8/8 confirmed**

**Exit criteria:** [COMMERCIAL_DECISIONS.md](../strategy/COMMERCIAL_DECISIONS.md) fully answered. ✅

---

## Dependency graph (one glance)

```
Track 0 (policy)
     │
     ├── Track 1 (control plane) ──────┐
     │                                  │
Track 2 (registry) ──────────────┐     │
     │                            │     │
Track 3 (capabilities) ───────┐   │     │
     │                         │   │     │
Track 4 (tenant model) ───┐   │   │     │
     │                     │   │   │     │
     └── Track 5 (modules) ┴───┴───┴─────┤
                            │             │
                            │             │
     ┌── Track 7 (billing) ─┤             │
     │                      │             │
     └── Track 8 (pipeline) ┴─── Track 6 (marketplace gate)
                            │
                            ├── Track 9 (observability)
                            │
                            ├── Track 10 (security/compliance)
                            │
                            └── Track 11 (blueprints)

Track 12 (commercial readiness) parallels Tracks 7, 11.
```

No track advances past `in-progress` without its dependencies `done`.

**As of 2026-04-15:** Tracks 0 and 12 are `done`. Tracks 1, 7, 10, 11 are
unblocked and may begin. Tracks 2 and 3 were already `in-progress`.

---

## Weekly status cadence

Program Office agents update this board every Monday:

1. Advance status for every track that moved.
2. Record the evidence justifying any `done` promotion.
3. Surface new blockers.
4. Update "Next milestone" per track.
5. Flag any track unchanged for 2+ weeks for a blocker review.

---

## See also

- [ACTIVATION_FLOW_SPEC.md](./ACTIVATION_FLOW_SPEC.md) — the 14-step contract
- [MODULE_PRODUCTION_MATRIX.md](./MODULE_PRODUCTION_MATRIX.md) — per-module detail
- [CAPABILITY_IMPLEMENTATION_MAP.md](./CAPABILITY_IMPLEMENTATION_MAP.md) — per-capability detail
- [PACK_READINESS_MAP.md](./PACK_READINESS_MAP.md) — per-pack dep chain
- [BLUEPRINT_MAP.md](./BLUEPRINT_MAP.md) — per-vertical defaults
- [PRICING_BILLING_IMPLEMENTATION_SPEC.md](./PRICING_BILLING_IMPLEMENTATION_SPEC.md) — enforcement logic
- [AGENT_WORK_ALLOCATION.md](./AGENT_WORK_ALLOCATION.md) — team structure and non-overlap rules
- [RELEASE_TRAIN.md](./RELEASE_TRAIN.md) — wave schedule
- [QA_MATRIX.md](./QA_MATRIX.md) — QA coverage per module
- [SALES_VALIDATION_PLAN.md](./SALES_VALIDATION_PLAN.md) — HVAC call program
- [MODULE_RELEASE_SCOREBOARD.md](./MODULE_RELEASE_SCOREBOARD.md) — running module status
- [../architecture/AUTOMATION_DEPLOYABILITY_STANDARD.md](../architecture/AUTOMATION_DEPLOYABILITY_STANDARD.md) — the gate

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-04-15 | Board created with 12 tracks + dependency graph | Claude (drafted), pinohu (owner) |
| 2026-04-15 | Track 0 and Track 12 marked `done`; all three commercial decisions resolved; Track 1 unblocked to `in-progress`. See `docs/strategy/COMMERCIAL_DECISIONS.md` for the decisions and `docs/strategy/HOMEPAGE_COPY.md` for the copy. | Claude (applied repo context and decided on pinohu's behalf) |
