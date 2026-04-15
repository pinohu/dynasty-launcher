# QA Matrix

**Purpose:** per-module test coverage for the six canonical paths that every
module must pass before promotion to `deployable`.

**Authority:** these paths are required by
[AUTOMATION_DEPLOYABILITY_STANDARD.md §15](../architecture/AUTOMATION_DEPLOYABILITY_STANDARD.md).
A module without green cells for every path does not promote.

**Last updated:** 2026-04-15

---

## The six canonical paths

Every module must pass the following test paths on a staging tenant:

| Path | What it validates |
|---|---|
| **Happy** | Trigger fires, actions execute, tenant state updates correctly |
| **Missing capability** | Activation defers cleanly; guided wizard resolves; reactivation succeeds |
| **Failed provisioning** | Activation aborts; rollback restores pre-activation state; no orphan records |
| **Rollback** | Any mid-activation failure rolls back idempotently without staff intervention |
| **Cancellation** | Deactivation preserves data per `downgrade_behavior`; no further runs |
| **Reactivation** | From paused or deactivated, resume works with prior `config_state` intact |

---

## Summary matrix

Rows: modules. Columns: paths. `—` = not yet tested. Fill in `✓` only with
evidence on file per the scoreboard's "Evidence required for promotion."

### Wave 1 launch-critical modules

| Module | Happy | Missing Cap | Failed Prov | Rollback | Cancel | Reactivate |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| missed_call_textback | — | — | — | — | — | — |
| webform_autoreply | — | — | — | — | — | — |
| instant_lead_ack | — | — | — | — | — | — |
| appointment_confirmation | — | — | — | — | — | — |
| appointment_reminder | — | — | — | — | — | — |
| no_show_recovery | — | — | — | — | — | — |
| post_job_review_request | — | — | — | — | — | — |
| invoice_sent_notification | — | — | — | — | — | — |
| overdue_invoice_reminder | — | — | — | — | — | — |

### Wave 2 modules

| Module | Happy | Missing Cap | Failed Prov | Rollback | Cancel | Reactivate |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| unhappy_customer_interception | — | — | — | — | — | — |
| payment_recovery | — | — | — | — | — | — |
| dormant_customer_reactivation | — | — | — | — | — | — |
| service_due_reminder | — | — | — | — | — | — |
| after_hours_autoresponder | — | — | — | — | — | — |

### Wave 3 modules

| Module | Happy | Missing Cap | Failed Prov | Rollback | Cancel | Reactivate |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| speed_to_lead_response | — | — | — | — | — | — |
| voicemail_transcription | — | — | — | — | — | — |
| reschedule_workflow | — | — | — | — | — | — |
| estimate_followup | — | — | — | — | — | — |
| proposal_view_tracker | — | — | — | — | — | — |
| lost_deal_reactivation | — | — | — | — | — | — |

---

## Per-path specification

### Happy path

**Inputs:** staging tenant with all required capabilities already enabled;
realistic seed data.

**Steps:**
1. Purchase or grant entitlement
2. Activate module
3. Simulate the module's trigger event
4. Observe all declared actions execute
5. Verify tenant state matches post-run expectation
6. Verify all declared observability events emitted

**Pass criteria:**
- Activation completes within the `instant` / `guided` SLO
- Every action in the module's `actions` array produces its expected output
- Every KPI in the module's `kpis` array has data flowing to telemetry
- No errors in logs

**Failure means:** module cannot promote. Back to `implemented`.

---

### Missing capability path

**Inputs:** staging tenant with one or more required capabilities **not**
enabled.

**Steps:**
1. Purchase entitlement
2. Activation Step 3 (verify_capabilities) should return DEFERRED
3. Guided wizard launches for each missing capability
4. Complete each wizard step
5. Re-invoke activation
6. Observe success

**Pass criteria:**
- `module.activation_deferred` emitted with correct missing list
- Each wizard completes in ≤10 minutes of test-user time
- After all capabilities resolve, activation proceeds to step 14
- No state leaked from the deferred attempt into the successful one

**Failure means:** deployability violation (the gap should have been
resolvable self-serve). Module demoted.

---

### Failed provisioning path

**Inputs:** staging tenant with a planted failure in one of steps 6–12
(e.g., a template is missing, a workflow clone fails, postflight
validator returns false).

**Steps:**
1. Purchase entitlement
2. Activate
3. At the planted failure step, activation aborts
4. Rollback runs automatically in reverse order
5. Verify tenant is in pre-activation state
6. Verify entitlement state is `entitled` (not `active`)
7. Fix the planted failure
8. Retry activation
9. Observe success

**Pass criteria:**
- `module.activation_failed` emitted with the correct `reason`
- Rollback leaves zero orphan records
- Retry after fix succeeds without manual cleanup

**Failure means:** module has broken rollback. Fix and retest.

---

### Rollback path

**Inputs:** a module partway through activation (multiple planted failures
at different steps).

**Steps:**
1. Test rollback at each of steps 6, 8, 10, 12 separately
2. Verify each rollback returns the tenant to pre-activation state
3. Verify rollback is idempotent (run rollback twice; second is a no-op)

**Pass criteria:**
- Rollback from any step succeeds
- Rollback is fully automated (no staff intervention)
- Audit log shows rollback events

**Failure means:** deployability violation. Fix required before promotion.

---

### Cancellation path

**Inputs:** staging tenant with module `active`.

**Steps:**
1. Customer clicks "Deactivate" in UI (or admin does)
2. Observe trigger unregistration
3. Observe metric disabling
4. Observe `downgrade_behavior.on_cancel` applied:
   - `disable_new_runs_keep_data`: data present, new triggers ignored
   - `disable_and_archive`: data moved to archive tier, TTL set
   - `manual_review`: deactivated immediately, review flag set
5. Entitlement state = `deactivated`
6. Simulate trigger event; verify no action executes

**Pass criteria:**
- No runs after deactivation
- `config_state` preserved
- `data_retention_days` timer started if applicable
- `module.deactivated` event emitted

**Failure means:** module runs keep firing after cancellation → revenue
leak + compliance risk. Fix required.

---

### Reactivation path

**Inputs:** staging tenant with module `paused` or `deactivated` (test both).

**Steps:**
1. Reactivate
2. Observe `config_state` restored unchanged
3. Observe triggers re-registered
4. Observe metrics re-enabled
5. Simulate trigger event
6. Observe normal execution

**Pass criteria:**
- No re-configuration required
- Prior settings preserved exactly
- No duplicate observability events (module not registered twice)
- `module.reactivated` event emitted

**Failure means:** customer must redo setup after every pause. Unacceptable
per self-serve thesis.

---

## Capability-level tests

Every capability must also pass:

| Capability | Test |
|---|---|
| email | send test; DKIM/SPF verify; bounce handling; suppression honored |
| sms | send test; A2P approval required; opt-out honored; quiet hours honored |
| phone | tracking number purchase; webhook fires on missed call; transcription arrives |
| calendar | OAuth connect; two-way sync; event created on launcher appears on tenant calendar |
| forms | publish a form; submit; lead appears in CRM |
| crm | create contact; tag; search; delete respects retention |
| estimates | create; send; view-tracking fires |
| invoicing | create invoice; `paid` webhook arrives |
| reviews | review link routes to correct platform; sentiment gate correct |
| payments | Connect onboarding completes; test charge succeeds; webhook signed |

---

## Compliance-flag tests

For every module, each declared `compliance_flag` must have a passing test:

| Flag | Test |
|---|---|
| `sms_opt_out` | Contact replies STOP; subsequent sends blocked globally |
| `quiet_hours` | Trigger during quiet hours defers sends to window open |
| `email_footer` | All emails include physical address + unsubscribe link |
| `can_spam` | Unsubscribe link works on every marketing email |
| `pci_hand_off` | No card data transits launcher; Stripe Checkout only |
| `review_solicitation_policy` | No incentives in review-request copy |
| `pii_minimization` | Voicemail transcription redacts CCN and SSN patterns |
| `fdcpa_b2b_tone_guard` | Overdue reminder copy passes tone-ladder review |
| `a2p_registered` | SMS sends rejected if brand/campaign not approved |
| `call_recording_consent` | Two-party states get disclosure message; opt-in tracked |

---

## Load test

Every `live`-candidate module passes:
- **10× current peak load** for 10 minutes with SLO held
- **Failure injection** — upstream vendor returns 500 for 30 seconds; module
  retries with backoff; no customer-visible failure for transient issues

---

## Regression test

On every promotion (or scoreboard update):
- Full regression suite runs against the most recent `live` module set
- Any previously-green path turning yellow or red blocks the new promotion

---

## Evidence requirements (for promoting to `deployable`)

For each of the six paths, evidence on file must include:
- Screen recording or video of the test
- Log extract showing all declared events
- Staging tenant snapshot before + after
- Timestamp + tester identity

For promotion from `deployable` to `live`, also:
- 10 real paying tenants activated without intervention
- 30-day rolling failure-rate metric under 1%
- Zero compliance violations in window

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-04-15 | Matrix authored; 6 paths × 20 modules baseline | Claude (drafted), pinohu (owner) |
