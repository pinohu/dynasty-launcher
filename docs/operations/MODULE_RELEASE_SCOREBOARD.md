# Module Release Scoreboard

**Purpose:** single source of truth for which automations are actually ready
to sell, activate, and support. Internal ambition lives in
`docs/strategy/SERVICE_BUSINESS_AUTOMATION_CATALOG.md`. **Commercial truth
lives here.**

**Authority:** every status below is evaluated against
`docs/architecture/AUTOMATION_DEPLOYABILITY_STANDARD.md`. No module may be
marked `deployable` without the evidence listed there.

**Last updated:** 2026-04-15

---

## Status model

Each module holds exactly one status:

- `draft` — idea exists but no complete spec
- `spec` — module definition, dependencies, and behavior documented (schema file exists)
- `implemented` — workflow logic and system hooks exist
- `validated` — preflight, postflight, and core tests pass in test environments
- `deployable` — satisfies every readiness gate; one-click activation works end-to-end
- `live` — deployable and actively running in ≥10 paying tenants
- `deprecated` — no longer recommended for new activations; existing tenants supported
- `retired` — no longer offered or supported

> **Note on naming.** Some earlier drafts used `specified` instead of `spec`.
> The repo uses `spec` (matches the `status` enum in
> `product/schema/module.schema.json`). Both names refer to the same state.

---

## Release gate legend

Each module is scored across 12 gates. `Y` = evidence on file, `N` = not yet.

| Gate | What it means |
|---|---|
| **Spec** | Product definition complete in `product/modules/…` |
| **Build** | Workflow logic implemented in the runtime |
| **UI** | Customer-editable settings exposed in the product UI |
| **Caps** | Capability dependencies declared and checkable at runtime |
| **Preflight** | Activation-readiness validator exists and is wired in |
| **Postflight** | Post-deploy validator exists and is wired in |
| **Rollback** | Rollback path defined for failed/partial/broken activations |
| **Obs** | Logs, health, and KPIs emitted |
| **Billing** | Entitlement and downgrade behavior wired |
| **Tests** | Core activation lifecycle tests passing |
| **Pack** | Pack-eligible (only `deployable` or `live` qualify) |
| **Mkt** | Marketplace-eligible (only `deployable` or `live` qualify) |

---

## Status summary

| Status | Count | Sellable? | In marketplace? |
|---|---|---|---|
| `draft` | 0 | No | No |
| `spec` | **20** | No | No |
| `implemented` | 0 | No | No |
| `validated` | 0 | No | No |
| `deployable` | 0 | Beta only | Optional |
| `live` | 0 | **Yes** | **Yes** |
| `deprecated` | 0 | No | Degraded |
| `retired` | 0 | No | No |

- **Total modules:** 20
- **Sellable today:** 0
- **Packs launch-ready:** 0 of 5
- **Suites launch-ready:** 0 of 3
- **Editions launch-ready:** 0 of 4

Nothing ships past `spec` until it earns the promotion. That is the point.

---

## Current scoreboard

| Module Code | Name | Status | Spec | Build | UI | Caps | Preflight | Postflight | Rollback | Obs | Billing | Tests | Pack | Mkt | Notes / blocker |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| missed_call_textback | Missed Call Text-Back | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | needs A2P flow + SMS wizard — `missing_activation_flow` |
| webform_autoreply | Web Form Auto-Reply | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | simplest path to first `deployable` — `missing_ui` |
| instant_lead_ack | Instant Lead Acknowledgment | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | cross-source router not built — `missing_activation_flow` |
| after_hours_autoresponder | After-Hours Auto-Responder | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | hours evaluator not built — `missing_activation_flow` |
| speed_to_lead_response | Speed-to-Lead Dispatcher | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | dispatch-chain runtime — `missing_activation_flow` |
| voicemail_transcription | Voicemail Transcription to CRM | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | transcription integration — `integration_blocked` |
| appointment_confirmation | Appointment Confirmation | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | ICS generator — `missing_activation_flow` |
| appointment_reminder | Appointment Reminder Sequence | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | offset scheduler — `missing_activation_flow` |
| no_show_recovery | No-Show Recovery | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | no-show detection — `missing_activation_flow` |
| reschedule_workflow | Self-Serve Reschedule Workflow | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | slot presenter + calendar write — `missing_activation_flow` |
| estimate_followup | Estimate Follow-Up Sequence | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | cadence engine — `missing_activation_flow` |
| proposal_view_tracker | Proposal View Tracker | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | view-beacon — `integration_blocked` |
| lost_deal_reactivation | Lost Deal Reactivation | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | cohort evaluator — `missing_activation_flow` |
| post_job_review_request | Post-Job Review Request | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | review-link router + sentiment gate — `missing_activation_flow` |
| unhappy_customer_interception | Unhappy Customer Interception | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | depends on `post_job_review_request` — `missing_dependency_map` |
| invoice_sent_notification | Invoice Sent Notification | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | pay-link generator — `missing_activation_flow` |
| overdue_invoice_reminder | Overdue Invoice Reminder | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | cadence + tone ladder — `missing_activation_flow` |
| payment_recovery | Failed Payment Recovery | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | Stripe Connect wiring — `integration_blocked` |
| dormant_customer_reactivation | Dormant Customer Reactivation | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | cohort detector — `missing_activation_flow` |
| service_due_reminder | Service-Due Reminder | `spec` | Y | N | N | Y | N | N | N | N | N | N | N | N | per-contact cadence — `missing_activation_flow` |

> **Reading the table.** All 20 modules are currently `spec`: machine-readable
> definitions exist and validate, capabilities are declared. None has
> workflow implementation yet. No module may be sold, no pack may launch,
> until this table shows real `Y`s in Build, Preflight, Postflight, Rollback,
> Obs, Billing, Tests for at least one full pack's worth of modules.

---

## Launch pack readiness view

A pack is launch-ready only when every required module is `deployable` or
`live`, billing references resolve, templates exist, dependencies resolve,
pack pricing is active (see `product/pricing/bundle-pricing.json`), and
support notes exist.

### Lead Capture Pack — $49/mo

Required modules:
- `missed_call_textback` — `spec`
- `webform_autoreply` — `spec`
- `instant_lead_ack` — `spec`

Readiness:
- `deployable` or `live`: **0/3**
- `spec`: 3/3
- `draft`: 0/3

**Launch status: NOT LAUNCH READY**

---

### Scheduling Pack — $49/mo

Required modules:
- `appointment_confirmation` — `spec`
- `appointment_reminder` — `spec`
- `no_show_recovery` — `spec`

Readiness:
- `deployable` or `live`: **0/3**
- `spec`: 3/3
- `draft`: 0/3

**Launch status: NOT LAUNCH READY**

---

### Reviews Pack — $35/mo

Required modules:
- `post_job_review_request` — `spec`
- `unhappy_customer_interception` — `spec` (prerequisite: `post_job_review_request`)

Readiness:
- `deployable` or `live`: **0/2**
- `spec`: 2/2
- `draft`: 0/2

**Launch status: NOT LAUNCH READY**

---

### Billing Pack — $49/mo

Required modules:
- `invoice_sent_notification` — `spec`
- `overdue_invoice_reminder` — `spec`
- `payment_recovery` — `spec`

Readiness:
- `deployable` or `live`: **0/3**
- `spec`: 3/3
- `draft`: 0/3

**Launch status: NOT LAUNCH READY**

---

### Retention Pack — $35/mo

Required modules:
- `dormant_customer_reactivation` — `spec`
- `service_due_reminder` — `spec`

Readiness:
- `deployable` or `live`: **0/2**
- `spec`: 2/2
- `draft`: 0/2

**Launch status: NOT LAUNCH READY**

---

### Deferred packs (see `product/pricing/bundle-pricing.json` → `not_launching_yet`)

| Bundle | Reason | Unblocks when |
|---|---|---|
| sales_followup_pack | Only `estimate_followup` exists of the promised 3 | 2 more sales modules reach `spec` and then advance |
| communication_pack | No dedicated modules — adjacent concepts live in lead-response | 3+ communication-specific modules exist |
| operations_pack | No modules built — task alerts, job-status triggers, handoff alerts | 3+ ops modules exist |

---

## Suite and edition readiness

Inherits strictest member status per
`AUTOMATION_DEPLOYABILITY_STANDARD.md` → *How bundles, suites, and editions
interact*.

| Container | Depends on | Effective status |
|---|---|---|
| `growth_suite` | `lead_capture_pack` + `reviews_pack` | `spec` |
| `service_operations_suite` | `scheduling_pack` + `retention_pack` | `spec` |
| `revenue_suite` | `billing_pack` | `spec` |
| Solo Edition | `growth_suite` | `spec` |
| Small Team Edition | `growth_suite` + `service_operations_suite` | `spec` |
| Field Service Edition | `growth_suite` + `service_operations_suite` + `billing_pack` | `spec` |
| Enterprise Edition | all of the above | `spec` |

**All containers remain un-sellable until every member reaches `deployable`.**

---

## Readiness rules (the short version)

### Pack-eligible
A module is pack-eligible only when status is `deployable` or `live`.

### Pack launch-ready
A pack is launch-ready only when all required modules are `deployable` or
`live`, billing resolves, templates exist, dependencies resolve, pack pricing
is active, support notes exist.

### Marketplace-eligible
A module is marketplace-eligible only when status is `deployable` or `live`,
customer copy exists, entitlement is active, and a UI activation path exists.

---

## Evidence required for promotion

No module may be marked `deployable` without the following on file:

- validation logs
- activation test pass
- postflight pass
- rollback pass
- entitlement enforcement pass
- UI settings screenshot or route confirmation
- a recorded end-to-end activation on a staging tenant with zero human steps

For promotion to `live`, also required:

- ≥10 paying tenants activated with no intervention
- 30-day rolling failure rate < 1%
- zero compliance-flag violations in the window

---

## Blocker tag vocabulary

Use exactly one tag per blocked module in the Notes column.

- `missing_spec` — `spec` file incomplete or non-validating
- `missing_dependency_map` — declared or implicit dependencies not resolved
- `missing_templates` — customer-facing templates not written/bound
- `missing_ui` — settings not exposed in product UI
- `missing_activation_flow` — preflight/postflight/activation wiring incomplete
- `missing_entitlements` — billing hooks not wired
- `missing_tests` — test coverage below minimum
- `missing_observability` — logs, KPIs, or health not emitted
- `policy_blocked` — compliance / policy sign-off pending
- `integration_blocked` — external vendor integration unavailable or failing

---

## Weekly release review

Run every Monday. Five questions, five answers:

1. **Which modules moved up one status this week?** _Write each promotion + the evidence that justified it._
2. **Which modules are blocked and why?** _Pair each blocked module with one blocker tag._
3. **Which packs are closest to launch-ready?** _Rank by count of `deployable` members._
4. **Which dependencies are most frequently blocking progress?** _If the same capability shows up 3+ times, it's the platform's problem, not the module's._
5. **Which modules should be removed from near-term launch promises?** _Anything that hasn't moved in 4+ weeks gets a blocker review._

---

## Summary dashboard targets

Surface these in any leadership view:

- Total modules by status
- Deployable module count
- Live module count
- Blocked module count by blocker tag
- Launch-ready packs count
- Average time from `spec` → `deployable`
- Activation failure rate by module
- Rollback rate by module

---

## Suggested build order

Based on capability reuse and business pull, the first five modules to push
toward `deployable` — they populate 4 of the 5 launch packs:

1. **`missed_call_textback`** — highest customer pull; phone + SMS capabilities unlock 4 other modules
2. **`webform_autoreply`** — lowest capability cost; fully instant activation; proves the end-to-end loop
3. **`appointment_reminder`** — proves the calendar capability
4. **`post_job_review_request`** — proves the reviews capability
5. **`overdue_invoice_reminder`** — proves the invoicing capability; clearest ROI story for HVAC

Once those five are `live`, the Lead Capture Pack, Scheduling Pack, Reviews
Pack, and Billing Pack each have at least one shipped module, and the platform
has exercised every capability category except payments.

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-04-15 | Scoreboard created; all 20 modules baseline at `spec` | Claude (drafted), pinohu (owner) |
| 2026-04-15 | Rewritten to full release-gate matrix + per-pack readiness + blocker vocabulary + weekly review template | Claude (rewrite), pinohu (owner) |
