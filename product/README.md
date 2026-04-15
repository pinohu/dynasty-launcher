# `product/` — Machine-Readable Product Model

This folder is the **missing bridge** between the strategic narrative docs in
`docs/` and the execution logic in `api/`. It converts business and service
doctrine into normalized objects the launcher, marketplace, and provisioning
engine can consume at runtime.

## Why this exists

`docs/` explains the business. `api/` executes the business. Until now, the
objects in between — modules, bundles, vertical blueprints, personas,
capabilities, entitlements, and recommendation rules — lived inside `app.html`
as hard-coded arrays or existed only as prose inside strategy docs. That made
every new automation a custom implementation project.

This folder replaces that pattern with a single source of truth. Every file is
structured JSON that can be:

- read by `api/catalog/*` handlers to render the marketplace,
- read by `api/tenants/*` handlers to check prerequisites and activate modules,
- read by `api/events/*` handlers to evaluate recommendation rules,
- read by the builder UI to render pricing, bundles, and vertical starter stacks,
- validated against `product/schema/*.schema.json` so the shape stays consistent.

## Layout

```
product/
├── README.md
├── schema/                 # JSON Schemas for every object type
├── capabilities/           # platform capabilities a module can require
├── modules/                # sellable micro-SaaS units (grouped by category)
├── bundles/                # outcome-based packs of modules
├── blueprints/             # vertical starter stacks (HVAC, plumbing, etc.)
├── personas/               # normalized persona records for recommendations
├── journeys/               # onboarding/expansion/retention journey definitions
├── recommendations/        # rules that surface next-best modules
└── pricing/                # tiers, module pricing, bundle pricing
```

## Relationship to other folders

| Folder              | Role                                          |
|---------------------|-----------------------------------------------|
| `docs/strategy/`    | Narrative source documents (catalog, personas, JTBD) |
| `docs/architecture/`| Bridge docs explaining the product model      |
| `docs/operations/`  | Shipped-state ledger and sprint records       |
| `product/`          | **Normalized objects** used at runtime        |
| `api/`              | Execution plane — reads `product/` to act     |
| `app.html` / `app/` | UI — renders marketplace, onboarding, upsells |
| `templates/`        | Reusable generator templates                  |
| `deliverables/`     | Generated customer outputs                    |

## Design rules

1. **Everything is additive.** Adding a new module must not require changes to
   `api/` unless a new capability is introduced.
2. **Modules declare prerequisites, they do not implement them.** The capability
   registry answers the question "can this tenant activate this module right
   now?"
3. **Activation has three types:** `instant`, `guided`, `assisted`. Most modules
   should be `instant` or `guided`. Too many `assisted` modules is a signal that
   the shared schema and capability layer are too thin.
4. **No workflow redesign by customers.** Modules expose a fixed set of
   `configurable_settings`. Raw workflow logic is locked.
5. **Pricing is centralized** in `product/pricing/`. UI, checkout, and admin
   surfaces read from the same source.

## Starter scope

This folder ships as a starter set — not the full 347-automation catalog. It
contains enough structured objects to drive onboarding, activation, and upsells
end-to-end:

- 10 capabilities
- 20 modules across 7 categories (lead-capture, lead-response, sales, scheduling, reviews, billing, retention)
- 5 locked launch packs (lead-capture, scheduling, reviews, billing, retention) — see `product/pricing/bundle-pricing.json` for the mechanical pricing formula
- 3 suites + 4 editions defined in `product/pricing/tiers.json`
- 8 vertical blueprints
- 6 personas (owner-operator, office-manager, scheduler, field-team-lead, regulated-operator, sales-coordinator)
- 10 recommendation rules
- 4 journeys
- 3 pricing files (tiers, modules, bundles)

**Open commercial decisions** before launch are tracked in
`docs/strategy/COMMERCIAL_DECISIONS.md`.

Additional modules should be added incrementally as they prove out in market,
always driven back to the raw inventory in
`docs/strategy/SERVICE_BUSINESS_AUTOMATION_CATALOG.md`.

## Schema versioning

Every object file declares a `schema_version`. Breaking changes require a
version bump and a migration note in `docs/architecture/`.
