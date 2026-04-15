# Service Automation Product Architecture

> The bridge document between business doctrine in `docs/strategy/` and execution
> logic in `api/`.

## Why this document exists

Dynasty Launcher already has:

- a raw opportunity catalog of ~347 automatable micro-tasks (see
  `docs/strategy/SERVICE_BUSINESS_AUTOMATION_CATALOG.md`),
- persona and buyer framing (`docs/strategy/PERSONA_GROUPS_MASTER.md`),
- jobs-to-be-done and service-blueprint logic
  (`docs/strategy/JTBD_JOURNEYS_AND_SERVICE_BLUEPRINTS.md`),
- a shipped-state ledger (`docs/operations/MARCH_2026_AUTOMATIONS_INVENTORY.md`),
- a runtime in `api/provision.js` / `api/ai.js` / `app.html`.

What it has **not** had is a formal product-model layer between strategy and
execution. That gap forced every new automation to be a custom implementation
project. This document defines the model; `product/` contains the data; `api/`
executes against it.

## The five layers

```
┌──────────────────────────────────────────────┐
│ 5. Commerce & in-product expansion            │  app.html / app/
│    (marketplace, upsells, activation UI)      │
├──────────────────────────────────────────────┤
│ 4. Outcome bundles                             │  product/bundles/
│    (Lead Conversion Pack, Scheduling Pack…)    │
├──────────────────────────────────────────────┤
│ 3. Modules (sellable micro-SaaS units)         │  product/modules/
│    (~20 starter; grow toward 40–80)            │
├──────────────────────────────────────────────┤
│ 2. Capability layer                            │  product/capabilities/
│    (email, SMS, calendar, forms, invoicing…)   │
├──────────────────────────────────────────────┤
│ 1. Core platform (shared tenant objects)       │  product/schema/tenant
│    CRM, contacts, jobs, invoices, templates    │  api/tenants/
└──────────────────────────────────────────────┘
```

## Commercial structure

| Offer           | Source                            | Purpose                          |
|-----------------|-----------------------------------|----------------------------------|
| Core tier       | `product/pricing/tiers.json`      | Base subscription, included modules |
| Individual modules | `product/modules/*.json`       | $19/month à la carte activation  |
| Outcome bundles | `product/bundles/*.json`          | Discounted packs of modules      |
| Vertical blueprints | `product/blueprints/*.json`   | Niche starter stacks             |
| Concierge setup | `product/pricing/tiers.json`      | Optional one-time assisted setup |

## Design rules

1. **Shared schema first.** Every module reads and writes to the shared tenant
   objects defined in `product/schema/tenant.schema.json`. No module invents its
   own data model.
2. **Capabilities declare integrations, modules declare capabilities.** Modules
   never reach directly into vendor APIs. They declare the capabilities they
   need; the capability layer owns the integration.
3. **Activation is one of three types** — `instant`, `guided`, `assisted`. The
   goal is that 80%+ of modules are `instant` or `guided`.
4. **Customers configure, they do not redesign.** Modules expose safe
   `configurable_settings`. Raw workflow logic is fixed.
5. **Billing drives entitlement, entitlement drives activation.** Paying unlocks
   an entitlement row; the prereq check either flips the module to active or
   routes the customer into a guided setup wizard.
6. **No custom per-customer provisioning for new modules.** If a new module
   requires human intervention beyond a one-time capability setup, it is
   classified `assisted` and surfaced with a concierge offer.
7. **`app.html` should eventually load configuration from `product/`, not
   hard-code it.** Tier definitions, module lists, bundle definitions, and
   recommendation logic should live in data, not in the monolith.

## Relationship to existing Dynasty Launcher runtime

| Existing                             | Role under this model                        |
|--------------------------------------|----------------------------------------------|
| `api/provision.js` + `mod_*`         | Capability activation layer; implements the integrations declared by `product/capabilities/*`. |
| `api/ai.js`                          | AI utility consumed by modules that need generation (e.g. templates). |
| `api/checkout.js`                    | Creates entitlements from Stripe subscription items. |
| `api/orchestrate.js`                 | Runs event → rule → action pipelines defined by modules. |
| `api/flags.js`                       | Feature-flag implementation; used as fallback for per-tenant entitlement state. |
| `app.html`                           | Current UI surface. Over time, marketplace/onboarding/dashboard should read from `product/`. |
| `docs/strategy/*`                    | Authoritative narrative. Must stay in sync when modules/bundles/blueprints change. |
| `docs/operations/*`                  | Shipped-state ledger. Updated when a module's `status` flips to `live`. |

## Handing out customer workspaces

Consistent with the "third-party credential boundary" rule in the root
`CLAUDE.md`: capabilities must be implemented in a way that hands ownership to
the customer whenever possible. A customer's workspace should run on *their*
vendor accounts — their Stripe Connect, their domain, their Google Business
Profile — not on the launcher's shared key pool.

- `product/capabilities/payments.json` explicitly favors Stripe Connect.
- `product/capabilities/reviews.json` expects customer-owned review destinations.
- `product/capabilities/email.json` expects verified tenant-owned sending domains.

## Next steps

- Normalize the highest-value additional modules from
  `docs/strategy/SERVICE_BUSINESS_AUTOMATION_CATALOG.md` into `product/modules/`.
- Wire `api/catalog/*.js` handlers that serve `product/` objects to the UI.
- Move tier/module/bundle definitions out of `app.html` and load from
  `product/` at runtime.
- Add vertical blueprints for the next 5 niches (electrical, landscaping, roofing,
  home remodeling, auto detail).
- Build `api/events/opportunity-cards.js` to evaluate
  `product/recommendations/*` against tenant activity.

## See also

- `product/README.md` — folder map
- `docs/architecture/TENANT_CAPABILITY_MODEL.md` — tenant + capability spec
- `docs/architecture/ENTITLEMENT_AND_ACTIVATION_MODEL.md` — billing ↔ activation
- `docs/architecture/MARKETPLACE_AND_UPSELL_LOGIC.md` — commerce and expansion
