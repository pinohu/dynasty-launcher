# Module Production Matrix

**Purpose:** per-module production detail. Every row is a full implementation
contract — triggers, actions, capabilities, templates, UI fields, tests,
rollback logic, observability events, current blockers.

**Authority:** if a module's row doesn't fully match this spec, it cannot
promote past `spec`.

**Last updated:** 2026-04-15

---

## How to read this matrix

Each module has a **detail block** below the summary table. The summary table
is for scanning; the detail block is what agents implement against.

Columns in the summary table:
- **Wave** — when this module ships (see [RELEASE_TRAIN.md](./RELEASE_TRAIN.md))
- **Pack** — which launch pack this module sits in
- **Activation** — `instant` or `guided` (never `assisted`)
- **Caps** — shorthand capability count
- **Status** — current scoreboard status
- **Blocker** — tag from the blocker vocabulary

---

## Summary table

| Module | Wave | Pack | Activation | Caps | Status | Blocker |
|---|---|---|---|---|---|---|
| missed_call_textback | W1 | lead_capture | guided | 3 | `spec` | `missing_activation_flow` |
| webform_autoreply | W1 | lead_capture | instant | 3 | `spec` | `missing_ui` |
| instant_lead_ack | W1 | lead_capture | guided | 3 | `spec` | `missing_activation_flow` |
| appointment_confirmation | W1 | scheduling | instant | 4 | `spec` | `missing_activation_flow` |
| appointment_reminder | W1 | scheduling | instant | 3 | `spec` | `missing_activation_flow` |
| no_show_recovery | W1 | scheduling | instant | 4 | `spec` | `missing_activation_flow` |
| post_job_review_request | W1 | reviews | guided | 3 | `spec` | `missing_activation_flow` |
| unhappy_customer_interception | W2 | reviews | instant | 3 | `spec` | `missing_dependency_map` |
| invoice_sent_notification | W1 | billing | instant | 4 | `spec` | `missing_activation_flow` |
| overdue_invoice_reminder | W1 | billing | guided | 3 | `spec` | `missing_activation_flow` |
| payment_recovery | W2 | billing | guided | 4 | `spec` | `integration_blocked` |
| dormant_customer_reactivation | W2 | retention | guided | 3 | `spec` | `missing_activation_flow` |
| service_due_reminder | W2 | retention | guided | 3 | `spec` | `missing_activation_flow` |
| after_hours_autoresponder | W2 | — | instant | 3 | `spec` | `missing_activation_flow` |
| speed_to_lead_response | W3 | — | guided | 3 | `spec` | `missing_activation_flow` |
| voicemail_transcription | W3 | — | instant | 2 | `spec` | `integration_blocked` |
| reschedule_workflow | W3 | — | instant | 4 | `spec` | `missing_activation_flow` |
| estimate_followup | W3 | — | guided | 3 | `spec` | `missing_activation_flow` |
| proposal_view_tracker | W3 | — | instant | 2 | `spec` | `integration_blocked` |
| lost_deal_reactivation | W3 | — | guided | 3 | `spec` | `missing_activation_flow` |

---

## Detail blocks — Wave 1 (5 launch packs)

These are the modules that unlock 4 of the 5 launch packs. Build these first.

---

### missed_call_textback

**File:** `product/modules/lead-capture/missed-call-textback.json`
**Pack:** `lead_capture_pack`
**Wave:** W1
**Activation:** `guided`

**Trigger:**
- event: `call.missed`
- conditions: `caller_is_new_or_unknown: true`

**Actions:**
- `send_sms` — outbound SMS to the caller via `sms` capability
- `create_lead` — write a lead record on the tenant CRM
- `tag_contact` — tag contact with `source:missed_call`
- `notify_owner` — alert module-configured owner channel

**Capabilities required:**
- `phone` — inbound tracking number receives `call.missed` event
- `sms` — outbound SMS
- `crm` — lead record creation

**Compliance flags:** `sms_opt_out`, `quiet_hours`, `a2p_registered`

**Templates:**
- `tmpl_missed_call_default` — default SMS body
- `tmpl_after_hours_callback` — off-hours variant

**UI fields:**
- `reply_delay_seconds` (int, default 30)
- `quiet_hours` (schedule)
- `template_id` (template_ref)
- `assigned_owner` (user_ref)
- `only_business_hours` (bool, default false)

**Tests required:**
- happy path: missed call → SMS sent within delay + lead created
- quiet hours: SMS deferred until window opens
- opt-out: contact previously opted out → no SMS, lead still created
- A2P gate: tenant without A2P registration → activation fails with clear message
- rate limit: 1000 SMS / tenant / month → overage billing triggered
- deactivation: module off → no SMS on next missed call

**Rollback logic:**
- on activation failure: unregister call webhook, delete default template binding, drop tenant workflow
- on deactivation: unregister call webhook, preserve lead records, preserve config_state (per `disable_new_runs_keep_data`)

**Observability events:**
- `module.activated` on step 14 success
- `module.sms_sent` on each successful send
- `module.sms_failed` with reason on send failure
- `module.lead_created` when CRM write succeeds
- `module.skipped_quiet_hours` when suppressed by quiet hours
- `module.skipped_opt_out` when suppressed by opt-out

**Current blocker:** `missing_activation_flow` — inbound webhook handler not yet wired; A2P verification step in guided wizard not built.

**Promotion gate to `implemented`:** webhook handler receives events from `api/phone/` provider; guided wizard has at least the A2P step working against a test tenant.

---

### webform_autoreply

**File:** `product/modules/lead-capture/webform-autoreply.json`
**Pack:** `lead_capture_pack`
**Wave:** W1
**Activation:** `instant`

**Trigger:**
- event: `form.submitted`

**Actions:**
- `send_email` — acknowledgment email
- `send_sms` — acknowledgment SMS (optional by setting)
- `create_lead` — write lead record
- `tag_contact` — tag source

**Capabilities required:** `forms`, `crm`, `email`

**Compliance flags:** `email_footer`, `sms_opt_out`

**Templates:** `tmpl_webform_ack_email`, `tmpl_webform_ack_sms`

**UI fields:**
- `ack_channel` (enum: email / sms / both, default both)
- `email_template_id` (template_ref)
- `sms_template_id` (template_ref)
- `include_booking_link` (bool, default true)

**Tests required:**
- happy path: form submission → email within 60s + lead created
- both-channel: SMS also fires when `ack_channel=both` and contact has phone
- email-only: SMS skipped when contact has no phone
- missing template: activation fails with `template_missing`
- DKIM/SPF unverified: activation fails with clear message
- deactivation: form submission after off → no email, lead still created by form capability itself

**Rollback logic:**
- on activation failure: unregister form webhook, drop tenant workflow
- on deactivation: unregister form webhook, preserve leads and config

**Observability events:**
- `module.activated`, `module.email_sent`, `module.email_bounced`, `module.lead_created`, `module.sms_sent`

**Current blocker:** `missing_ui` — configurable-settings form is not yet rendered in `app.html`; every other piece can be stubbed quickly.

**Promotion gate to `implemented`:** UI form renders settings, writes to the tenant config, and invokes `activate-module.js`; email sends via the bound capability against a test tenant.

---

### instant_lead_ack

**File:** `product/modules/lead-response/instant-lead-ack.json`
**Pack:** `lead_capture_pack`
**Wave:** W1
**Activation:** `guided`

**Trigger:**
- event: `lead.created`
- conditions: `lead.first_touch_ack_sent: false`

**Actions:**
- `send_email`, `send_sms`, `tag_contact`, `start_followup_clock`

**Capabilities required:** `crm`, `email`, `sms`

**Compliance flags:** `email_footer`, `sms_opt_out`, `quiet_hours`

**Templates:** `tmpl_instant_ack_sms`, `tmpl_instant_ack_email`, `tmpl_instant_ack_paid`

**UI fields:**
- `primary_channel` (enum: sms / email, default sms)
- `fallback_channel` (enum: sms / email / none, default email)
- `per_source_templates` (bool, default true)

**Tests required:**
- primary-sms happy path
- fallback triggers when primary unavailable (no phone on contact)
- paid-source variant fires when source=paid_ad
- quiet hours suppression
- deactivation: new lead → no touch, no clock started

**Rollback logic:** standard (unregister trigger, preserve data).

**Observability:** `module.first_touch_sent`, `module.first_touch_failed`, `module.fallback_used`.

**Current blocker:** `missing_activation_flow` — cross-source router logic not implemented.

---

### appointment_confirmation

**File:** `product/modules/scheduling/appointment-confirmation.json`
**Pack:** `scheduling_pack`
**Wave:** W1
**Activation:** `instant`

**Trigger:** event `appointment.created`

**Actions:** `send_email`, `send_sms`, `attach_ics`

**Capabilities required:** `calendar`, `crm`, `email`, `sms`

**Compliance flags:** `sms_opt_out`

**Templates:** `tmpl_appt_confirm_sms`, `tmpl_appt_confirm_email`

**UI fields:**
- `channel` (enum: email / sms / both, default both)
- `include_prep_instructions` (bool, default true)
- `reschedule_link_ttl_hours` (int, default 48)

**Tests required:** happy path; ICS attaches correctly; both-channel fan-out; reschedule link expires on schedule; deactivation.

**Rollback:** standard.

**Observability:** `module.confirmation_sent`, `module.ics_generated`, `module.reschedule_link_expired`.

**Current blocker:** `missing_activation_flow` — ICS generator not built.

---

### appointment_reminder

**File:** `product/modules/scheduling/appointment-reminder.json`
**Pack:** `scheduling_pack`
**Wave:** W1
**Activation:** `instant`

**Trigger:** event `appointment.upcoming`, offset windows `24h`, `1h`

**Actions:** `send_sms`, `send_email`, `mark_confirmed`, `move_to_reschedule_flow`

**Capabilities required:** `calendar`, `crm`, `sms`

**Compliance flags:** `sms_opt_out`, `quiet_hours`

**Templates:** `tmpl_appt_reminder_24h`, `tmpl_appt_reminder_1h`

**UI fields:**
- `reminder_offsets` (enum: 24h / 4h / 1h / 24h+1h / 24h+4h+1h, default 24h+1h)
- `channel` (enum: sms / email / both, default sms)
- `enable_confirm_link` (bool, default true)

**Tests required:** each offset window fires exactly once; confirm-link updates appointment state; quiet hours suppression; deactivation.

**Rollback:** standard.

**Observability:** `module.reminder_sent`, `module.reminder_confirmed`, `module.reschedule_triggered`.

**Current blocker:** `missing_activation_flow` — offset scheduler not built.

---

### no_show_recovery

**File:** `product/modules/scheduling/no-show-recovery.json`
**Pack:** `scheduling_pack`
**Wave:** W1
**Activation:** `instant`

**Trigger:** event `appointment.no_show`

**Actions:** `send_sms`, `send_email`, `offer_rebook_link`, `create_task`

**Capabilities required:** `calendar`, `crm`, `sms`, `email`

**Compliance flags:** `sms_opt_out`, `quiet_hours`

**Templates:** `tmpl_no_show_first`, `tmpl_no_show_followup`

**UI fields:**
- `initial_delay_minutes` (int, default 30)
- `follow_up_days` (string, default "1,3,7")
- `include_incentive` (bool, default false)

**Tests:** no-show detection fires at correct time; follow-up cadence honors days list; rebook link creates appointment; deactivation.

**Rollback:** standard.

**Observability:** `module.no_show_detected`, `module.rebook_offered`, `module.rebook_succeeded`.

**Current blocker:** `missing_activation_flow` — no-show detection logic.

---

### post_job_review_request

**File:** `product/modules/reviews/post-job-review-request.json`
**Pack:** `reviews_pack`
**Wave:** W1
**Activation:** `guided`

**Trigger:** event `job.completed`

**Actions:** `send_sms`, `send_email`, `route_by_sentiment`, `log_outcome`

**Capabilities required:** `crm`, `reviews`, `sms`

**Compliance flags:** `sms_opt_out`, `review_solicitation_policy`

**Templates:** `tmpl_review_request_sms`, `tmpl_review_request_email`

**UI fields:**
- `delay_hours` (int, default 3)
- `primary_platform` (enum: google / facebook / yelp / industry_directory, default google)
- `channel` (enum: sms / email / both, default sms)
- `rotate_platforms` (bool, default false)

**Tests:** job-complete event fires exactly one review ask; platform routing correct; sentiment gate triggers unhappy intercept (W2); opt-out suppresses; deactivation.

**Rollback:** standard.

**Observability:** `module.review_requested`, `module.review_clicked`, `module.review_submitted`, `module.sentiment_negative`.

**Current blocker:** `missing_activation_flow` — review-link router and sentiment gate.

---

### invoice_sent_notification

**File:** `product/modules/billing/invoice-sent-notification.json`
**Pack:** `billing_pack`
**Wave:** W1
**Activation:** `instant`

**Trigger:** event `invoice.sent`

**Actions:** `send_email`, `send_sms`, `log_delivery`

**Capabilities required:** `invoicing`, `crm`, `email`, `sms`

**Compliance flags:** `email_footer`

**Templates:** `tmpl_invoice_sent_email`, `tmpl_invoice_sent_sms`

**UI fields:**
- `channel` (enum: email / sms / both, default both)
- `include_payment_link` (bool, default true)

**Tests:** invoice-sent event triggers notification; pay-link resolves to a real checkout; deactivation.

**Rollback:** standard.

**Observability:** `module.invoice_notified`, `module.pay_link_clicked`.

**Current blocker:** `missing_activation_flow` — pay-link generator.

---

### overdue_invoice_reminder

**File:** `product/modules/billing/overdue-invoice-reminder.json`
**Pack:** `billing_pack`
**Wave:** W1
**Activation:** `guided`

**Trigger:** event `invoice.overdue`, days `3, 7, 14, 21`

**Actions:** `send_email`, `send_sms`, `create_task`, `escalate_to_owner`

**Capabilities required:** `invoicing`, `crm`, `email`

**Compliance flags:** `email_footer`, `fdcpa_b2b_tone_guard`

**Templates:** `tmpl_overdue_3`, `tmpl_overdue_7`, `tmpl_overdue_14`, `tmpl_overdue_21`

**UI fields:**
- `cadence_days` (string, default "3,7,14,21")
- `tone_ladder` (bool, default true)
- `owner_escalation_day` (int, default 21)
- `stop_on_payment` (bool, default true)

**Tests:** cadence fires at each day; tone escalates as configured; payment during cadence halts sends; deactivation.

**Rollback:** standard.

**Observability:** `module.overdue_reminded`, `module.escalation_triggered`, `module.payment_received_after_reminder`.

**Current blocker:** `missing_activation_flow` — cadence engine + tone ladder.

---

## Detail blocks — Wave 2 (completes packs)

### unhappy_customer_interception

**File:** `product/modules/reviews/unhappy-customer-interception.json`
**Pack:** `reviews_pack`
**Wave:** W2
**Activation:** `instant`

**Trigger:** event `review_request.reply`, condition `sentiment: negative_or_neutral`

**Actions:** `send_private_feedback_form`, `notify_owner`, `create_task`, `pause_public_ask`

**Capabilities required:** `crm`, `reviews`, `email`

**Prerequisite modules:** `post_job_review_request` (hard — this module's trigger only fires when W1 review-request is active)

**Compliance flags:** `review_solicitation_policy`, `pii_minimization`

**Templates:** `tmpl_private_feedback_form`, `tmpl_owner_negative_alert`

**UI fields:**
- `negative_threshold` (int, default 3)
- `owner_alert_channel` (enum: sms / email / slack, default sms)

**Tests:** negative sentiment routes to private form; owner alert fires on chosen channel; public ask paused so detractor doesn't get a second public-review prompt; deactivation.

**Rollback:** `manual_review` on cancel (per module JSON) — preserve all detractor feedback for audit.

**Observability:** `module.negative_intercepted`, `module.owner_alerted`, `module.public_ask_paused`.

**Current blocker:** `missing_dependency_map` until W1 `post_job_review_request` is `live`. Build in parallel; activate after.

---

### dormant_customer_reactivation (W2 — retention_pack)
### service_due_reminder (W2 — retention_pack)
### payment_recovery (W2 — billing_pack)

Identical structure to the above. See the module JSON files for exact fields;
each needs the same six categories of rows (trigger, actions, caps, templates,
UI, tests, rollback, observability). Wave 2 agents produce full detail blocks
following the template above.

**Specific notes:**
- `payment_recovery` is `integration_blocked` on Stripe Connect wiring. Must
  land after Track 7 (billing system) is at least partially live.
- `service_due_reminder` is the HVAC killer module — prioritize among W2.

---

## Detail blocks — Wave 3 (atomic-only modules, not in launch packs)

- `after_hours_autoresponder`, `speed_to_lead_response`, `voicemail_transcription`,
  `reschedule_workflow`, `estimate_followup`, `proposal_view_tracker`,
  `lost_deal_reactivation`.

These ship as atomic $19/mo modules after the launch packs are live. Each
still needs the full detail block; Wave 3 agents produce them on the same
schedule they're promoted through the scoreboard.

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-04-15 | Matrix authored with W1 full detail, W2 summary, W3 stub | Claude (drafted), pinohu (owner) |
