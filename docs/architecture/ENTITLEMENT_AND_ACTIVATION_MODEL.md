# Entitlement & Activation Model

> How paying unlocks a module, how the system decides whether the module can
> run, and how it hands off to a guided setup when it can't.

## The three objects

1. **Module** — what could be activated (spec in `product/modules/`).
2. **Entitlement** — whether *this* tenant is allowed to activate it
   (`product/schema/entitlement.schema.json`).
3. **Capability state** — whether the tenant has the prerequisites satisfied
   (`tenant.capabilities_enabled`).

Activation is always the intersection: *entitlement × capability state*.

## Lifecycle

```
[Customer buys]
     │
     ▼
Stripe subscription item created
     │
     ▼
api/checkout.js writes entitlement (state="entitled")
     │
     ▼
api/tenants/activate-module.js runs prereq_check
     │
     ├── all capabilities present  ──► state="active"   (instant)
     │
     ├── 1–3 capabilities missing  ──► run guided wizard
     │                                └── on success   ──► state="active"
     │
     └── complex missing            ──► offer concierge (assisted)
                                       └── on completion ─► state="active"
```

## Entitlement states

| State         | Meaning                                               |
|---------------|-------------------------------------------------------|
| `entitled`    | Paid, not yet activated. Prereqs not met or not confirmed. |
| `active`      | Running — receiving events, executing actions.        |
| `paused`      | Temporarily off (e.g. failed payment, customer request). |
| `deactivated` | Turned off by the customer. Data preserved.           |
| `revoked`     | Billing permanently lost (canceled / refunded).       |

## Activation types

Defined on each module as `activation_type`:

- `instant` — prereqs always met for any reasonable tenant. Module flips to
  active on entitlement. Most tenant-value lift should come from these.
- `guided` — 1–3 short setup steps needed. Wizard is referenced by the
  capability's `setup_wizard_id`.
- `assisted` — exception path. Not self-serve; routed through
  `product/journeys/assisted-activation.json`.

A healthy portfolio is majority `instant` and `guided`. If more than ~20% of
modules are `assisted`, the platform — not the module — is under-invested.

## Re-entry guarantee

**Once a tenant is set up, new modules that share capabilities activate
instantly.** That is the entire purpose of the shared tenant + capability
layer. The second, third, and tenth module the customer adds after onboarding
should not require human configuration work from anyone.

## Pause and resume

Paused entitlements must preserve `config_state` and allow resume with no
reconfiguration. This is critical for:

- failed-payment recovery (see `product/modules/billing/payment-recovery.json`)
- customer-initiated temporary pause
- seasonal pause patterns (landscaping, pool service, etc.)

## Downgrade and cancellation

- Canceling a bundle revokes entitlement for bundled modules **unless the
  customer separately holds them as individual modules**.
- Downgrading a plan may remove tier-included modules; those should enter
  `deactivated` state with a clear upsell back to the previous tier or to the
  individual module price.
- Revoking never deletes data. Re-subscribing restores activation with prior
  `config_state`.

## Audit log

Every entitlement transition is logged:

- `entitled_at`, `activated_at`, `paused_at`, `deactivated_at`, `revoked_at`
- reason code (payment_failure, user_requested, prereq_missing, concierge_complete)
- actor (system, user_id, stripe_webhook)

Regulated operators (see `product/personas/regulated-operator.json`) rely on
this log for compliance posture.

## Implementation surface

| Concern                        | File(s)                                   |
|--------------------------------|-------------------------------------------|
| Read modules/bundles           | `api/catalog/modules.js`, `api/catalog/bundles.js` |
| Write entitlements on purchase | `api/checkout.js`                         |
| Activate / prereq check        | `api/tenants/activate-module.js`          |
| Guided setup                   | `api/tenants/run-guided-setup.js`         |
| Capability provisioning        | `api/provision.js` `mod_*` functions       |
| Feature-flag fallback          | `api/flags.js`                            |
