# Pricing & Billing Implementation Spec

**Purpose:** the exact enforcement logic for annual discount, trial, seat
overage, location overage, SMS overage, HIPAA add-on, and enterprise handling.
Pricing values live in `product/pricing/tiers.json` and
`product/pricing/bundle-pricing.json`; this spec defines what the system
actually does with them.

**Authority:** the source of truth for pricing values is the JSON. This
document is the source of truth for enforcement.

**Last updated:** 2026-04-15

---

## The billing data model

Three primary tables own billing state. Agents must not introduce a fourth
without amending this spec.

### `tenant`
- `tenant_id`
- `plan` (`core` | edition code | `enterprise`)
- `billing_cycle` (`monthly` | `annual`)
- `trial_ends_at` (nullable)
- `stripe_customer_id`

### `entitlement`
Per-tenant per-module. Schema: `product/schema/entitlement.schema.json`.
- `state` (`entitled` | `active` | `paused` | `deactivated` | `revoked`)
- `billing_source.source_type` (`module` | `bundle` | `plan_included` | `trial` | `comp`)
- `billing_source.stripe_subscription_item_id` (nullable for `plan_included` / `comp`)

### `usage_meter`
- `tenant_id`
- `meter_type` (`sms_outbound` | `voice_inbound_minutes`)
- `period_start` (month floor)
- `included_qty` (from plan)
- `used_qty` (running)
- `overage_qty` (spilt: used_qty − included_qty)
- `overage_unit_price_cents`

---

## Enforcement scenario 1: Annual billing

### Rule
- Annual billing = 20% off monthly sum (= "two months free")
- Applies to: Core, every module, every pack, every suite, every edition
- HIPAA add-on also discounted 20% on annual
- Overage (SMS/voice/seat/location) always billed monthly, never prepaid

### Implementation

When a customer selects annual at checkout:
```
for each line_item in cart:
    annual_amount_cents = line_item.price_monthly * 12 * 0.80
    create stripe_price(
        unit_amount=annual_amount_cents,
        recurring={'interval': 'year'},
    )
```

Line items retain their `module_code` / `bundle_code` / `edition_code`
metadata so entitlement resolution still works.

Entitlements created under annual billing don't auto-cancel on the 13th month —
Stripe renews, entitlement persists.

### Downgrade from annual
- Customer may downgrade from annual to monthly only at annual renewal.
- Mid-term downgrades are ignored (customer keeps annual plan until period end).
- No pro-rated refunds for mid-term cancellation (standard SaaS terms).

---

## Enforcement scenario 2: Free trial

### Rule
- 14 days
- No credit card required
- Applies to: Core + the first one module of the customer's choice
- Does **not** apply to: packs, suites, editions, HIPAA add-on, concierge

### Implementation

When a customer signs up and selects trial:
```
tenant = create_tenant(plan='core', trial_ends_at=now() + 14d)
entitlement = create_entitlement(
    tenant_id=tenant.id,
    module_code=chosen_module,
    state='entitled',
    billing_source={'source_type': 'trial'},
)
activate_module(tenant, chosen_module)
```

Trial terminates on day 14:
```
if now() >= tenant.trial_ends_at:
    if tenant.stripe_customer_id has no active subscription:
        for each entitlement where billing_source.source_type = 'trial':
            deactivate_module(tenant, entitlement.module_code)
            entitlement.state = 'revoked'
        # Tenant workspace and data preserved per normal retention
```

Trial customers see a banner from day 7 onward and a "convert now" CTA in the
marketplace. No surprise charge.

### Money-back guarantee
- 30 days from first paid charge
- Refunds processed via Stripe refund API
- Entitlements `revoked` on refund; data retained per module `downgrade_behavior`

---

## Enforcement scenario 3: SMS / voice fair use

### Rule (from `tiers.json.commercial_essentials.sms_fair_use`)
- 1,000 outbound SMS / month / tenant included
- $0.02 per SMS overage
- 500 inbound voice minutes / month / tenant included
- $0.04 per minute overage

### Implementation

On every SMS send:
```
meter = usage_meter(tenant_id, 'sms_outbound', current_month)
meter.used_qty += 1
if meter.used_qty > meter.included_qty:
    meter.overage_qty += 1
    record_usage_charge(
        stripe_customer_id=tenant.stripe_customer_id,
        unit_amount_cents=2,
        quantity=1,
        description='SMS overage'
    )
```

### Overage billing cycle
- Metered usage posted to Stripe daily
- Invoiced at end of each billing cycle
- Customer can see current month's usage in their dashboard in real time

### Hard cap (abuse protection)
- If a single tenant exceeds 50,000 outbound SMS in a 24h window, freeze sending and alert ops. Not normal behavior.

### What happens if a module fires while tenant is past fair use
- SMS-dependent modules continue firing; usage continues metering; no service interruption.
- Only the hard cap above stops a tenant.

---

## Enforcement scenario 4: Multi-location add-on

### Rule
- $29/month per additional location beyond the first
- Each location = independent workspace partition (own business hours, staff, automations)
- First location always included

### Implementation

Location count is derived, not stored:
```
num_locations = count(tenant.locations)
billable_locations = max(0, num_locations - 1)
monthly_addon_cents = billable_locations * 2900
```

When a customer adds a location:
1. UI prompts: "This adds $29/month to your next invoice. Confirm."
2. On confirm, create a location record + a Stripe subscription item with
   `unit_amount=2900, quantity=1`.
3. Usage meters (SMS, voice) are **per tenant**, not per location — multi-location
   tenants share the SMS pool unless explicitly upgraded.

When a location is removed:
- Data preserved per tenant-level retention policy
- Stripe subscription item quantity decremented at next cycle

---

## Enforcement scenario 5: Seat overage

### Rule (from `tiers.json.commercial_essentials.seats`)
- Core includes 2 seats
- Solo Edition includes 2 seats
- Small Team Edition includes 5 seats
- Field Service Edition includes 7 seats
- Additional seats: +$12/month each

### Implementation

Seat count derived:
```
included = tenant.plan.included_seats
used = count(tenant.users where role != 'suspended')
billable_extra_seats = max(0, used - included)
monthly_seat_addon_cents = billable_extra_seats * 1200
```

When a user is added:
```
if used >= included:
    prompt("This adds $12/month to your next invoice. Confirm.")
    on confirm:
        create user record
        update Stripe subscription item quantity
```

When a user is removed:
```
user.role = 'suspended'
# Data retained per admin setting; user can be restored without re-paying
# Stripe quantity decremented at next cycle
```

---

## Enforcement scenario 6: HIPAA / regulated add-on

### Rule
- $49/month
- Required for `regulated-operator` persona
- Gates blueprints that require PHI handling (currently `med-spa` doing injectables)
- Activates: BAA-covered sub-processors, audit-log retention extension, consent capture, claim-policy guardrails

### Implementation

HIPAA add-on enables:
- `tenant.compliance_mode = 'hipaa'`
- All capability wizards route to BAA-covered providers:
  - email: Postmark w/ BAA (not Acumbamail)
  - sms: Twilio w/ BAA (not SMS-iT)
  - Stripe: BAA addendum required
- Audit log retention: 6 years (HIPAA standard) instead of 365 days
- Messaging templates sanitized for PHI leakage (no treatment details in subject lines)
- Consent capture required before any communication module activates

### Gate at activation
```
if module.compliance_flags includes 'phi_adjacent':
    if not tenant.has_entitlement('hipaa_addon'):
        emit module.activation_failed(reason='hipaa_addon_required')
        return ERROR
```

### Gate at signup
```
if chosen_blueprint == 'med-spa' and injectables_selected:
    prompt('Med-spa injectables require the HIPAA add-on ($49/mo).')
    if not accepted:
        block signup into med-spa blueprint
```

No med-spa injectables tenant activates without HIPAA.

---

## Enforcement scenario 7: Enterprise / custom

### Rule
- Price: `null` (displayed as "Talk to sales")
- Includes: Core + all suites + all packs + unlimited seats
- Multi-location: unlimited
- HIPAA: included
- Concierge onboarding: included

### Implementation

Enterprise contracts are provisioned manually by ops and materialized in
Stripe as a custom subscription:
```
stripe_subscription = create_subscription(
    items=[
        {price: custom_enterprise_price_id, quantity: 1},
    ],
    metadata={
        'plan': 'enterprise',
        'hipaa_included': true,
        'seats_unlimited': true,
        'locations_unlimited': true,
    }
)
```

Entitlement table gets one row per module with `source_type: 'plan_included'`.
No per-module Stripe subscription item.

Usage meters still apply; overage is billed at the Enterprise contract's
agreed rate (often $0.015/SMS vs. $0.02 retail).

### Enterprise portal
- Custom dashboard with multi-tenant view
- SLA monitoring
- Dedicated support channel

---

## Enforcement scenario 8: Concierge setup (one-time)

### Rule (from `tiers.json.concierge_setup`)
- Starter Kit: $199 (async — templates, video, 1 hour chat)
- Guided Setup: $699 (1 call + up to 5 modules activated + light migration)
- Premium Setup: $1,999+ (multi-location + customization + full migration)

### Implementation

Concierge is a one-time Stripe charge, not a subscription:
```
create_payment_intent(
    amount=item.price_onetime * 100,
    currency='usd',
    metadata={
        'concierge_tier': 'starter' | 'guided' | 'premium',
        'tenant_id': tenant.id,
    }
)
```

On successful payment:
- Ticket opened in ops queue
- Agent assigned by tier
- Progress tracked against a concierge checklist (separate from activation)

Concierge does **not** bypass the deployability standard. Agents doing
concierge setup use the same one-click activation paths customers use;
concierge pays for the agent's time, not for exceptions to the standard.

---

## Launcher-build handoff (PROVISIONAL, see COMMERCIAL_DECISIONS.md)

**Status:** unresolved. Placeholder mapping in `tiers.json.launcher_build_handoff`:

| Launcher build | Post-build subscription state |
|---|---|
| Foundation build | Core at $59/mo from day 1, no included months |
| Professional build ($4,997) | Small Team Edition, 12 months included, then $179/mo from month 13 |
| Enterprise build ($9,997) | Field Service Edition, 24 months included, then $229/mo from month 25 |

### Provisional implementation

On build completion:
```
tenant = provision_from_build(build_customer_id)
if build.tier == 'professional':
    create_subscription(
        plan='small_team',
        start=build.completion_date,
        bundled_months=12,  # no invoice until month 13
    )
elif build.tier == 'enterprise':
    create_subscription(
        plan='field_service',
        start=build.completion_date,
        bundled_months=24,
    )
```

Do **not** ship this without the commercial decision locked.

---

## Billing state machine (per tenant)

```
[signup]
   │
   ▼
[trialing] ──14d──▶ [trial_expired_no_card] ──▶ [read_only]
   │
   │(convert)
   ▼
[active] ◀───────┐
   │              │
   ├──(payment_failed)──▶ [past_due] ──3d──▶ [paused]
   │                                           │
   │                                           │(retry succeeds)
   │                                           └───────────────┐
   │                                                           │
   ├──(customer cancels)──▶ [canceled] ──retention_days──▶ [purged]
   │                            │
   │                            └──(resubscribe within retention)──┘
   │
   └──(refund)──▶ [revoked]
```

---

## Idempotency rules

- Stripe webhook replays never double-charge
- Adding a seat twice in 5 seconds doesn't create two subscription items
- Modifying a subscription item over a concurrent webhook uses Stripe's
  versioning to resolve conflicts

---

## Dashboards

Commercial Ops maintains two dashboards that read from this spec:

**Revenue dashboard:**
- MRR by plan
- ARR on annual
- Module attach rate
- Overage revenue (SMS, voice, seats, locations, HIPAA)
- Concierge revenue

**Billing-hygiene dashboard:**
- Dunning queue (past_due count)
- Trial → paid conversion rate
- Refund rate
- Failed-payment recovery rate (feeds `payment_recovery` module performance)

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-04-15 | Spec authored with 8 enforcement scenarios + handoff placeholder | Claude (drafted), pinohu (owner) |
