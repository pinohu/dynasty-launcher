# Marketplace & Upsell Logic

> How the product surfaces new modules and bundles to existing customers so
> that the **best sales channel is the product itself.**

## The key principle

Once a tenant is onboarded, the platform has more context about their business
than any salesperson would. It sees their missed calls, overdue invoices,
completed jobs, and review volume. Every additional module should be offered
in context, triggered by real usage data — not pushed through generic email
blasts.

## Five surfaces

### 1. Dashboard opportunity cards

Triggered by rules in `product/recommendations/*`. Each rule:

- watches a specific metric (missed calls, overdue invoices, no-show rate…)
- checks for prerequisite capabilities
- confirms the target module is inactive
- emits a card with `headline`, `body`, and `cta_label`

Example cards:

- "You missed 14 calls in the last 30 days."  → `missed_call_textback`
- "41 completed jobs with no review ask."      → `post_job_review_request`
- "9 invoices are overdue."                    → `overdue_invoice_reminder`
- "50+ dormant customers are hiding in your CRM." → `dormant_customer_reactivation`

### 2. Marketplace browse

`product/modules/*` and `product/bundles/*` rendered as a filterable catalog:

- by outcome ("get more reviews", "book more jobs")
- by persona (owner-operator, scheduler, office manager)
- by vertical blueprint
- by price

### 3. Contextual in-flow prompts

When a specific event fires and the relevant module is inactive, surface a
one-click activation prompt:

- Missed call lands in CRM → "Activate Missed Call Text-Back?"
- Estimate sent with no follow-up sequence → "Activate Estimate Follow-Up?"
- Payment fails → "Activate Failed Payment Recovery?"

These are the highest-converting upsells because the value is obvious.

### 4. Blueprint suggested-next

Each blueprint in `product/blueprints/*` has a `suggested_bundle_order`. Once
the tenant finishes bundle N, the UI highlights bundle N+1 with a brief "what
it unlocks" preview.

### 5. Retention-stage interventions

When `product/journeys/retention.json` detects KPI regression or unused
capacity, intervene with a targeted recommendation rather than generic
re-engagement.

## The recommendation rule engine

### Evaluation flow

```
tenant events (missed_calls, jobs_completed, invoices_overdue, …)
    ↓
rolled up into signal metrics per tenant per window
    ↓
product/recommendations/*.json evaluated
    ↓
matching rules: check conditions (module_inactive, capability_present, blueprint_in)
    ↓
deduplicate via cooldown_days
    ↓
emit to api/events/opportunity-cards.js → dashboard
```

### Rule priority

Higher `priority` values win ties. Defaults:

| Range  | Used for                                 |
|--------|------------------------------------------|
| 90–100 | Critical gaps (incomplete profile, major leak) |
| 70–89  | Strong signals with clear $ value         |
| 50–69  | Softer opportunities                       |
| <50    | Experiments / A-tests                      |

### Cooldown

Every rule has a `cooldown_days` to avoid nagging. A dismissed card should not
re-surface until the cooldown expires unless the underlying metric worsens
significantly.

## Bundle vs individual module upsell

Both are valid. Rough defaults:

- If a card triggers off a **single-KPI problem**, recommend the **individual
  module**. Conversion is higher.
- If the same tenant has triggered **three or more rules within the same
  bundle**, recommend the **bundle** instead — it's cheaper for the customer
  and stickier for the business.

## Anti-patterns

- **Do not show more than 3 opportunity cards at once.** It looks like spam
  and each card's weight drops.
- **Do not recommend a module whose prerequisites are missing without
  surfacing what will be asked in the wizard.** Customers who buy and then
  discover a 20-minute setup is required will churn.
- **Do not replace the value dashboard with a marketplace dashboard.** The
  dashboard's primary job is to show business outcomes; opportunity cards
  ride alongside outcomes, not over them.
- **Do not sell "automation."** Sell the business result
  (see `GTM_FUNNEL_STRATEGY.md` at repo root). Automation is the mechanism,
  not the headline.

## Implementation surface

| Concern                         | File(s)                                        |
|---------------------------------|------------------------------------------------|
| Event ingest                    | `api/events/ingest-event.js`                   |
| Module trigger dispatch         | `api/events/_dispatcher.mjs`                   |
| Dashboard opportunity cards   | `api/events/opportunity-cards.js`, `api/events/_aggregates.mjs` |
| Marketplace rendering           | `api/catalog/modules.js`, `api/catalog/bundles.js` |
| Blueprint next-best             | `api/catalog/blueprints.js`                    |
| Activation                      | `api/tenants/activate-module.js`               |

## Minimum viable marketplace

The first implementation can be thin. It needs to:

1. List modules and bundles filtered by blueprint and price.
2. Show whether each is `active`, `entitled`, or `available`.
3. Let the customer subscribe via Stripe.
4. Auto-activate or route to the guided wizard.
5. Show dashboard opportunity cards from at most 5 rules.

Everything else (rich filters, A/B tests, niche-specific landing pages)
can come later.
