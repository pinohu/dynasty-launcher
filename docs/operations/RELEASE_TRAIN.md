# Release Train

**Purpose:** the release schedule. Which modules, packs, capabilities, and
platform features ship in which wave. What is blocked. What is roadmap only.

**Convention:** waves are scope-based, not calendar-based. A wave ships when
its exit criteria are met. Agents may pull scope into an earlier wave only
after checking dependencies in
[PRODUCTION_PROGRAM_BOARD.md](./PRODUCTION_PROGRAM_BOARD.md).

**Last updated:** 2026-04-15

---

## Wave summary

| Wave | Scope | Gating commercial outcome |
|---|---|---|
| W0 | Commercial decisions, platform spine | — |
| W1 | 3 launch packs + capability depth | First paying tenants on Lead Capture / Scheduling / (Reviews requires W1→live) |
| W2 | Remaining 2 launch packs, dependent modules | Full launch ladder sellable |
| W3 | Atomic-only modules, expansion packs | Marketplace breadth |
| Roadmap | Deferred packs, non-launch verticals | Not sellable |

---

## Wave 0 — Precondition

**Ships when:** Track 0 and Track 12 exit criteria met.

**Scope:**
- Three commercial decisions answered in
  [COMMERCIAL_DECISIONS.md](../strategy/COMMERCIAL_DECISIONS.md)
- `tiers.json.launcher_build_handoff.status` no longer `UNRESOLVED`
- Homepage copy reflects FSM positioning
- Platform spine Tracks 1–4 reach at least `in-progress` with committed interfaces

**Deliverables:**
- Policy lock meeting recorded
- One commit updating pricing files + homepage
- Stub implementations of `api/catalog/*`, `api/tenants/*`, `api/events/*`

**Exit criteria:**
- Commercial decisions signed
- Stub API endpoints return shaped data (read-only)
- `app.html` marketplace placeholder fetches from stub endpoints

---

## Wave 1 — First launch ladder

**Ships when:** 3 launch packs have all required modules at `live` and each
pack has passed the QA matrix.

**Scope:**

### Platform features
- Control plane: tenant creation, capability state, entitlement writes, activation engine (`instant` + `guided`)
- Product registry served from JSON files
- Capability registry with verification checks
- Shared tenant model: tenant, contact, lead, appointment, job, invoice, template, entitlement, event
- Billing: Stripe subscription items for every W1 pack and module; annual discount; 14-day trial; SMS overage metering
- Marketplace: reads from catalog, filters by status, renders packs
- Observability: activation and failure events flowing to telemetry

### Capabilities to `deployable`
- email (Acumbamail first)
- sms (SMS-iT with A2P)
- crm (native)
- forms (native)
- calendar (Google + Trafft)

### Modules to `live` (five at minimum)
1. `missed_call_textback` (unlocks Lead Capture Pack partially)
2. `webform_autoreply` (unlocks Lead Capture Pack)
3. `instant_lead_ack` (completes Lead Capture Pack)
4. `appointment_confirmation` (partial Scheduling Pack)
5. `appointment_reminder` (partial Scheduling Pack)
6. `no_show_recovery` (completes Scheduling Pack)
7. `post_job_review_request` (Reviews Pack's first module; must accumulate 30d `live` before Reviews Pack can launch because of prereq gate)
8. `invoice_sent_notification` (partial Billing Pack)
9. `overdue_invoice_reminder` (partial Billing Pack, if billing infra ready)

### Packs to launch-ready
- Lead Capture Pack (3 modules live)
- Scheduling Pack (3 modules live)

### Blueprints to shippable
- `plumbing`, `hvac`, `cleaning` (three verticals that exercise most W1 capabilities)

### Commercial
- Solo Edition launch-ready
- Small Team Edition launch-ready
- Enterprise tier stub ("Talk to sales")
- Concierge Starter Kit and Guided Setup live

**Exit criteria:**
- First paying tenant activates Lead Capture Pack with zero human steps
- First paying tenant activates Scheduling Pack with zero human steps
- QA matrix passing for all 6 W1 modules that reach `live`
- 10+ paying tenants active
- 30-day rolling failure rate below 1%
- Zero compliance-flag violations in 30-day window

**Commercial outcome:** real paid tenants on the platform. First HVAC
customer calls drawn from this cohort.

---

## Wave 2 — Full launch ladder

**Ships when:** all 5 launch packs are launch-ready.

**Scope:**

### Platform features
- Entitlement: pause/resume/deactivate/revoke flows
- Billing: multi-location add-on, seat overage, voice overage
- HIPAA add-on gate
- Guided wizards handle every W1+W2 capability
- Recommendation engine evaluating 5+ rules against tenant activity
- Opportunity cards live on dashboard

### Capabilities to `deployable`
- reviews (Google + Facebook)
- invoicing (Stripe Invoices via Connect)
- phone (CallScaler with missed-call + voicemail webhooks)
- payments (Stripe Connect Express)

### Modules to `live`
10. `post_job_review_request` matures past 30d `live` (from W1)
11. `unhappy_customer_interception` (completes Reviews Pack)
12. `payment_recovery` (completes Billing Pack)
13. `dormant_customer_reactivation` (partial Retention Pack)
14. `service_due_reminder` (completes Retention Pack — HVAC killer module)

### Packs to launch-ready
- Reviews Pack
- Billing Pack
- Retention Pack

### Blueprints to shippable
- `electrical`, `pest-control`, `med-spa`

### Commercial
- Field Service Edition launch-ready
- Premium concierge tier live
- HIPAA add-on purchasable

**Exit criteria:**
- All 5 launch packs live
- Field Service Edition has ≥5 paying tenants
- HIPAA add-on has ≥1 paying med-spa tenant
- Recommendation engine driving ≥10% of upsells

**Commercial outcome:** full launch ladder sellable; pricing page shows all
4 editions.

---

## Wave 3 — Atomic modules and breadth

**Ships when:** W2 is stable at ≥50 paying tenants.

**Scope:**

### Modules to `live` (atomic-only)
- `after_hours_autoresponder`
- `speed_to_lead_response`
- `voicemail_transcription`
- `reschedule_workflow`
- `estimate_followup`
- `proposal_view_tracker`
- `lost_deal_reactivation`

These modules don't complete any new pack at launch, but they round out the
atomic-module marketplace.

### Blueprints to shippable
- `home-remodeling`, `auto-detail`

### Platform features
- Stackable entitlement (customer adds module already in their pack gets the
  bundled price, not double-billed)
- Annual plan migrations (monthly → annual discount mid-term)
- Multi-location dashboard
- Custom enterprise onboarding portal

### Commercial
- Annual plan migration promotions
- Competitive take-out credit ("moving from Jobber? Get $100 off first 3 months")

**Exit criteria:**
- All 20 modules `live`
- ≥8 blueprints shippable
- ≥50% of new signups choose annual

---

## Roadmap (not in any near-term wave)

### Deferred packs
- **Sales Follow-Up Pack** — waiting on 2 more sales modules (see `not_launching_yet` in bundle-pricing.json)
- **Communication Pack** — needs 3+ communication-specific modules (not just capability-shared)
- **Operations Pack** — 0 live modules; entirely greenfield

### Deferred capabilities
- Additional email providers (Postmark BAA, SES)
- Additional SMS providers (Twilio fallback)
- External CRM integrations (HubSpot read/write)
- External estimates (PandaDoc, Jobber)

### Deferred platform features
- Multi-location reporting unification
- White-label option for agencies
- Public API for custom integrations
- Module SDK for third-party module authors

These are genuine roadmap items. They do not appear on the pricing page.
They do not appear in marketing. They appear at most on a public roadmap or
in a "what's coming" admin view.

---

## What blocks each wave

### W1 blockers (as of 2026-04-15)
- Track 0 not complete (commercial decisions unresolved)
- Activation engine not implemented (Track 1)
- Capability verification not built (Track 3)
- Billing not wired (Track 7)
- Stripe subscription items not created
- Default templates not written

### W2 blockers
- All W1 blockers (cascade)
- Stripe Connect onboarding flow not built
- CallScaler webhook wiring not complete
- HIPAA add-on gate not implemented
- Recommendation engine not built

### W3 blockers
- W2 blockers (cascade)
- Stackable entitlement logic not designed
- Annual migration flow not spec'd

---

## Pull-in rules

A scope item may pull into an earlier wave only if:

1. All dependencies for that item are also pullable or already complete
2. Pull does not block other W1 items
3. QA/Release capacity exists
4. Commercial Ops confirms the commercial outcome is worth the scope shift

Pull requests go through Program Office. Silent pull-ins are an anti-pattern.

---

## Scope-push rules

If a scope item won't make its intended wave:

1. Surface at Monday status review
2. Identify whether the cause is the item itself or a dependency
3. Push to next wave OR pull in to earlier wave the dependency that's holding it up
4. Update this document

---

## Release-day checklist (per wave)

Before a wave is declared shipped:

- [ ] All module statuses updated in `MODULE_RELEASE_SCOREBOARD.md`
- [ ] All pack statuses updated in `PACK_READINESS_MAP.md`
- [ ] Pricing files reflect shipped scope (no vaporware)
- [ ] Homepage and pricing page updated
- [ ] QA matrix passing for every `live` module
- [ ] Observability dashboards green
- [ ] Sales playbook updated with new scope
- [ ] Customer announcement drafted
- [ ] Change log entries in every file touched

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-04-15 | Waves 0–3 defined; roadmap segregated; pull/push rules documented | Claude (drafted), pinohu (owner) |
