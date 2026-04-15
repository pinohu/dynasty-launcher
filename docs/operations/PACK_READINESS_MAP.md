# Pack Readiness Map

**Purpose:** per-pack dependency chain showing exactly what blocks launch and
what unlocks commercial sale. Complements
[MODULE_RELEASE_SCOREBOARD.md](./MODULE_RELEASE_SCOREBOARD.md) with the
decision rules.

**Launch rule (from `AUTOMATION_DEPLOYABILITY_STANDARD.md`):** a pack is
launch-ready only when **every required module is `deployable` or `live`**,
billing resolves, templates exist, dependencies resolve, pack pricing is
active, and support notes exist.

**Last updated:** 2026-04-15

---

## Current state at a glance

| Pack | Required modules | Capabilities needed | Status | Can launch? |
|---|---|---|---|---|
| Lead Capture Pack | 3 | phone, sms, email, forms, crm | 0/3 deployable | No |
| Scheduling Pack | 3 | calendar, sms, email, crm | 0/3 deployable | No |
| Reviews Pack | 2 | reviews, sms, email, crm | 0/2 deployable | No |
| Billing Pack | 3 | invoicing, payments, email, sms, crm | 0/3 deployable | No |
| Retention Pack | 2 | crm, email, sms | 0/2 deployable | No |

**0 of 5 packs launch-ready today.** Fastest path to first commercial sale:
get all 3 modules in any one pack to `deployable`, ideally Lead Capture.

---

## Lead Capture Pack — $49/mo

### Dependency chain

```
Commercial launch
  └── Pack marketplace-eligible
       └── All 3 modules deployable
            ├── missed_call_textback  (phone + sms + crm)
            │    └── sms capability deployable (A2P brand approved)
            │    └── phone capability deployable (tracking number + webhook)
            │    └── crm capability deployable (native CRM init)
            ├── webform_autoreply     (forms + crm + email)
            │    └── email capability deployable (verified sending domain)
            │    └── forms capability deployable (native forms)
            │    └── crm capability deployable
            └── instant_lead_ack      (crm + email + sms)
                 └── (capabilities already needed above)
```

### What blocks launch

- **missed_call_textback blockers:**
  - Inbound webhook handler for `call.missed` not yet wired
  - A2P registration step in guided wizard not built
  - Tracking-number purchase flow not built
- **webform_autoreply blockers:**
  - Configurable-settings UI not rendered
  - Email template binding not implemented
  - DKIM/SPF verification not wired into preflight
- **instant_lead_ack blockers:**
  - Cross-source router not built
  - Channel-fallback logic not implemented
- **Billing blockers:**
  - No Stripe subscription item for `lead_capture_pack` yet
  - Overage metering for SMS not live
- **Template blockers:**
  - Default SMS/email templates per module not written
- **Documentation blockers:**
  - Support runbook doesn't exist
  - First-run expectation doc doesn't exist

### What unlocks launch

All of the following must be true:

- [ ] missed_call_textback status = `deployable` (scoreboard evidence on file)
- [ ] webform_autoreply status = `deployable`
- [ ] instant_lead_ack status = `deployable`
- [ ] email, sms, phone, forms, crm capabilities all deployable
- [ ] Stripe subscription item `lead_capture_pack_monthly` + `_annual` created
- [ ] All 6 launch-required templates written and approved
- [ ] Support runbook committed in `templates/` or ops runbooks
- [ ] SMS fair-use metering live and reporting
- [ ] QA matrix (happy + missing-cap + failed-provisioning + rollback + cancellation + reactivation paths) passing on staging
- [ ] Pricing file `bundle-pricing.json` status flipped from current placeholder to `live`

---

## Scheduling Pack — $49/mo

### Dependency chain

```
Commercial launch
  └── All 3 modules deployable
       ├── appointment_confirmation  (calendar + crm + email + sms)
       ├── appointment_reminder      (calendar + crm + sms)
       └── no_show_recovery          (calendar + crm + sms + email)
```

### What blocks launch

- calendar capability deployable requires OAuth integrations (Google + Trafft as first two)
- Offset scheduler service not built (needed by `appointment_reminder`)
- No-show detection not built (`no_show_recovery`)
- ICS generator not built (`appointment_confirmation`)
- Reschedule-link TTL enforcement not built

### What unlocks launch

- [ ] All 3 modules `deployable`
- [ ] Calendar OAuth (Google + Trafft) working in production
- [ ] Offset scheduler in production
- [ ] Stripe subscription item `scheduling_pack_monthly/annual`
- [ ] 4 launch templates written (confirm SMS/email, reminder SMS 24h/1h)
- [ ] Support runbook + first-run doc
- [ ] Overage metering on SMS (shared with Lead Capture)
- [ ] QA matrix passing

---

## Reviews Pack — $35/mo

### Dependency chain

```
Commercial launch
  └── All 2 modules deployable
       ├── post_job_review_request        (reviews + sms + crm)
       └── unhappy_customer_interception  (reviews + email + crm)
            └── prerequisite_modules: [post_job_review_request]  ← hard gate
```

### What blocks launch

- `unhappy_customer_interception` cannot promote until `post_job_review_request` is `live`, not just `deployable` (hard prereq per its module JSON)
- Review-link router not built
- Sentiment gate logic not built
- Private feedback form template not created
- reviews capability: tenant-owned review destinations must be verifiable

### What unlocks launch

- [ ] post_job_review_request `live` (not just deployable — because of prereq gate)
- [ ] unhappy_customer_interception `deployable`
- [ ] Sentiment classifier reliable (or simple rating-based gate acceptable at MVP)
- [ ] Private feedback form template works + submits to CRM
- [ ] Stripe subscription item
- [ ] Templates, runbook, first-run doc
- [ ] QA matrix passing — especially negative-routing + public-ask-paused

**Note:** because of the prereq gate, Reviews Pack launches **after** its
component `post_job_review_request` has accumulated 30 days of `live` runtime
and 10 paying tenants. Reviews Pack is therefore **Wave 2**, not Wave 1,
even though both modules can be built in Wave 1.

---

## Billing Pack — $49/mo

### Dependency chain

```
Commercial launch
  └── All 3 modules deployable
       ├── invoice_sent_notification   (invoicing + crm + email + sms)
       ├── overdue_invoice_reminder    (invoicing + crm + email)
       │    └── upsell_from: [invoice_sent_notification]
       └── payment_recovery            (payments + invoicing + crm + email)
            └── upsell_from: [overdue_invoice_reminder]
            └── downgrade_behavior: manual_review  ← special handling
```

### What blocks launch

- payments capability deployable requires Stripe Connect onboarding flow
- invoicing capability deployable requires at least one provider (Stripe Invoices via Connect) wired
- Cadence engine not built (shared with Scheduling Pack reminder sequences)
- Tone-ladder renderer not built
- Failed-payment retry scheduler not built
- Pay-link generator not built
- FDCPA B2B tone guard not encoded in templates
- `manual_review` deactivation path for `payment_recovery` not wired

### What unlocks launch

- [ ] All 3 modules `deployable`
- [ ] Stripe Connect onboarding in production
- [ ] Cadence engine in production
- [ ] Pay-link generator working
- [ ] `manual_review` deactivation tracker in place
- [ ] Stripe subscription item
- [ ] 6 launch templates (invoice-sent email+SMS, overdue day 3/7/14/21, card-failed)
- [ ] FDCPA/B2B tone reviewed by someone capable of legal sign-off
- [ ] Runbook + first-run doc
- [ ] QA matrix passing — especially manual-review deactivation path

**Wave assignment:** `invoice_sent_notification` + `overdue_invoice_reminder`
can be W1. `payment_recovery` requires Stripe Connect which is a heavier lift,
so **Billing Pack ships in Wave 2** unless Stripe Connect lands earlier.

---

## Retention Pack — $35/mo

### Dependency chain

```
Commercial launch
  └── All 2 modules deployable
       ├── dormant_customer_reactivation  (crm + email + sms)
       │    └── upsell_from: [post_job_review_request]
       │    └── upsell_to:   [service_due_reminder]
       └── service_due_reminder           (crm + email + sms)
            └── upsell_to: [dormant_customer_reactivation]
```

### What blocks launch

- Cohort detector (by months-since-last-job) not built
- Per-contact service cadence engine not built
- Reactivation offer templates not written
- Needs meaningful contact history (tenants brand-new to launcher will see nothing for 6 months) — mitigate with CSV import at onboarding

### What unlocks launch

- [ ] Both modules `deployable`
- [ ] Cohort detector in production
- [ ] Per-contact cadence engine in production
- [ ] CSV import at onboarding working (so new tenants can populate their "dormant" cohort)
- [ ] Stripe subscription item
- [ ] 5+ templates (dormant 6/9/12mo, service-due 30/14/7 day)
- [ ] QA matrix passing

**Wave assignment:** Wave 2 (depends on capabilities and cadence engine
shared with Billing Pack).

---

## Deferred packs (not shipping)

These are in `product/pricing/bundle-pricing.json` under `not_launching_yet`.
They do **not** appear on the pricing page and cannot be purchased.

### Sales Follow-Up Pack (deferred)

**Why:** only `estimate_followup` exists of the promised 3 modules. Needs a
second sales-focused module (e.g. lead_assignment) and ideally a third
(pipeline_nudges) before it earns pack status per the promotion rule.

**Unblocks when:**
- 2 more sales modules reach `deployable`
- Promotion rule from `AUTOMATION_DEPLOYABILITY_STANDARD.md` satisfied

### Communication Pack (deferred)

**Why:** No dedicated modules. "SMS updates," "email follow-up," "internal
notifications" are concepts that sit inside other modules, not standalone
units.

**Unblocks when:** 3+ communication-specific modules exist.

### Operations Pack (deferred)

**Why:** No modules built. Task alerts, job-status triggers, internal handoff
alerts are all implementable but none are in `product/modules/` yet.

**Unblocks when:** 3+ ops modules exist at `deployable`.

---

## Cross-pack dependencies

Certain capabilities unlock multiple packs at once. Prioritize these in
engineering:

| Capability | Packs unlocked | Priority |
|---|---|---|
| sms | Lead Capture, Scheduling, Reviews, Billing, Retention | **P0** |
| email | every pack | **P0** |
| crm | every pack | **P0** |
| calendar | Scheduling | P1 |
| forms | Lead Capture | P1 |
| reviews | Reviews | P2 |
| invoicing | Billing | P2 |
| phone | Lead Capture (1 module only) | P2 |
| payments | Billing (1 module only) | P3 |
| estimates | (none in launch packs) | P4 |

**Implication:** getting SMS, email, and CRM to `deployable` unlocks at least
one module in every launch pack. This is the capability critical path.

---

## Commercial launch decision rule

A pack advances from "coming soon" roadmap to public pricing page only when
**every one** of the following is true:

1. All required modules at `deployable` or `live`
2. Capability dependencies all satisfy "capability deployable" definition in [CAPABILITY_IMPLEMENTATION_MAP.md](./CAPABILITY_IMPLEMENTATION_MAP.md)
3. Stripe subscription items created for monthly and annual pricing
4. Templates for all required modules written
5. Support runbook and first-run expectation doc committed
6. QA matrix paths for every required module passing on staging
7. SMS overage metering live (if any required module uses SMS)
8. Pack tested end-to-end: buy → activate → run → deactivate → reactivate, zero staff touches

If any item is missing, the pack does not appear on the pricing page.

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-04-15 | Map authored with launch + deferred dependency chains | Claude (drafted), pinohu (owner) |
