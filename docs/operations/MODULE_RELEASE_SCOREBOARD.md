# Module Release Scoreboard

**Purpose:** running audit of every module's status against
`docs/architecture/AUTOMATION_DEPLOYABILITY_STANDARD.md`. This is the
human-readable source of truth for "what can we sell today?"

**Last updated:** 2026-04-15

---

## Status summary

| Status | Count | Sellable? | Visible in marketplace? |
|---|---|---|---|
| `draft` | 0 | No | No |
| `spec` | **20** | No | No |
| `implemented` | 0 | No | No |
| `validated` | 0 | No | No |
| `deployable` | 0 | Beta only | Optional |
| `live` | 0 | **Yes** | **Yes** |
| `deprecated` | 0 | No new sales | Degraded |

**Total modules in repo:** 20
**Total modules sellable today:** 0
**Total bundles sellable today:** 0 (every bundle contains at least one `spec` module)
**Total suites sellable today:** 0
**Total editions sellable today:** 0

This is intentional. No module has yet met the deployability contract.
Customer calls come before engineering; engineering comes before marketplace.

---

## Module status table

| Category | Module | Activation | Status | Prereqs | Caps | Blockers to next step |
|---|---|---|---|---|---|---|
| lead-capture | missed_call_textback | guided | `spec` | — | phone, sms, crm | implement wizard, A2P verification, inbound webhook handler |
| lead-capture | webform_autoreply | instant | `spec` | — | forms, crm, email | implement template render, DKIM/SPF verification preflight |
| lead-response | instant_lead_ack | guided | `spec` | — | crm, email, sms | channel-selection wizard, suppression-list integration |
| lead-response | after_hours_autoresponder | instant | `spec` | — | crm, sms, email | hours evaluator, dual-channel send |
| lead-response | speed_to_lead_response | guided | `spec` | — | crm, sms, phone | dispatch chain runtime, escalation policy engine |
| lead-response | voicemail_transcription | instant | `spec` | — | phone, crm | transcription provider integration, PII redaction |
| scheduling | appointment_confirmation | instant | `spec` | — | calendar, crm, email, sms | ICS generator, reschedule-link TTL enforcement |
| scheduling | appointment_reminder | instant | `spec` | — | calendar, crm, sms | offset scheduler, one-tap confirm receiver |
| scheduling | no_show_recovery | instant | `spec` | — | calendar, crm, sms, email | no-show detection, rebook-link generator |
| scheduling | reschedule_workflow | instant | `spec` | — | calendar, crm, sms, email | slot presenter, calendar write-back |
| sales | estimate_followup | guided | `spec` | — | estimates, crm, email | cadence scheduler, view-tracking hook |
| sales | proposal_view_tracker | instant | `spec` | — | estimates, crm | view-beacon integration, nudge dispatcher |
| sales | lost_deal_reactivation | guided | `spec` | — | estimates, crm, email | cohort evaluator, offer-type picker |
| reviews | post_job_review_request | guided | `spec` | — | crm, reviews, sms | review-link router, sentiment gate |
| reviews | unhappy_customer_interception | instant | `spec` | post_job_review_request | crm, reviews, email | private-form generator, owner-alert routing |
| billing | invoice_sent_notification | instant | `spec` | — | invoicing, crm, email, sms | invoice-event ingest, pay-link generator |
| billing | overdue_invoice_reminder | guided | `spec` | — | invoicing, crm, email | cadence scheduler, tone-ladder renderer |
| billing | payment_recovery | guided | `spec` | — | payments, invoicing, crm, email | retry scheduler, update-card flow, service-pause hook |
| retention | dormant_customer_reactivation | guided | `spec` | — | crm, email, sms | cohort detector, offer engine, suppression list |
| retention | service_due_reminder | guided | `spec` | — | crm, email, sms | cadence engine per contact, lead-time scheduler |

---

## Bundle admission status

A bundle is `live` only when every module it contains is `live`
(see `AUTOMATION_DEPLOYABILITY_STANDARD.md` §How bundles, suites, and editions
interact).

| Bundle | Modules | Member statuses | Bundle status |
|---|---|---|---|
| lead_capture_pack | 3 | 3× `spec` | `spec` |
| scheduling_pack | 3 | 3× `spec` | `spec` |
| reviews_pack | 2 | 2× `spec` | `spec` |
| billing_pack | 3 | 3× `spec` | `spec` |
| retention_pack | 2 | 2× `spec` | `spec` |

**Deferred (listed in `product/pricing/bundle-pricing.json` `not_launching_yet`):**

| Bundle | Reason |
|---|---|
| sales_followup_pack | Only 1 live module (estimate_followup); needs 2 more |
| communication_pack | No dedicated modules yet |
| operations_pack | No live modules yet |

---

## Suite and edition admission

| Tier | Depends on | Status |
|---|---|---|
| `growth_suite` | lead_capture_pack + reviews_pack | `spec` |
| `service_operations_suite` | scheduling_pack + retention_pack | `spec` |
| `revenue_suite` | billing_pack | `spec` |
| `solo` edition | growth_suite | `spec` |
| `small_team` edition | growth_suite + service_operations_suite | `spec` |
| `field_service` edition | growth_suite + service_operations_suite + billing_pack | `spec` |
| `enterprise` edition | all of the above | `spec` |

**Nothing above `spec` ships.** Until modules climb the ladder, this scoreboard
is our commitment to not over-promise.

---

## Promotion requirements — the recap

Authored once; link to the authoritative definition in
`docs/architecture/AUTOMATION_DEPLOYABILITY_STANDARD.md`.

| From | To | Gate |
|---|---|---|
| `draft` | `spec` | Module JSON exists and validates against `product/schema/module.schema.json` |
| `spec` | `implemented` | Workflow logic, templates, settings, triggers, actions all coded |
| `implemented` | `validated` | Unit + integration + compliance + load tests pass |
| `validated` | `deployable` | One end-to-end activation on staging tenant with zero human steps, recorded |
| `deployable` | `live` | 10 paying tenants activated with no intervention; ≥30-day rolling failure rate <1%; zero compliance violations |

---

## What goes live first

The practical build order, based on capability-reuse and business pull:

1. **missed_call_textback** — highest-pull, capability (phone + sms) unlocks 4 other modules
2. **webform_autoreply** — lowest capability cost, fully instant activation
3. **appointment_reminder** — proves the calendar capability, widely applicable
4. **post_job_review_request** — proves the reviews capability, high buyer intent
5. **overdue_invoice_reminder** — proves the invoicing capability, clear ROI story

Those five alone populate 4 of the 5 launch packs. Getting them to `live`
unlocks the first real marketplace.

---

## How this scoreboard is used

- **Marketing:** Only `live` modules/bundles/suites/editions may appear on the
  public pricing page. `deployable` may appear behind a "Beta" flag.
- **Sales:** Discovery calls must not promise non-`live` capability as
  included. Commit only to what's on this board.
- **Engineering:** Weekly check-in. Any module where status is unchanged for
  >4 weeks needs a blocker review.
- **Support:** Runbooks exist only for `live` modules. Anything else routes to
  engineering.

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-04-15 | Scoreboard created; all 20 modules baseline at `spec` | Claude (drafted), pinohu (owner) |
