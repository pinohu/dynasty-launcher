# `docs/architecture/` — Bridge between strategy and execution

These documents translate the business doctrine in `docs/strategy/` into the
machine-readable product model in `product/` and the execution logic in `api/`.

## Read order

1. **[SERVICE_AUTOMATION_PRODUCT_ARCHITECTURE.md](./SERVICE_AUTOMATION_PRODUCT_ARCHITECTURE.md)**
   — The five-layer architecture: tenant → capabilities → modules → bundles →
   commerce. Start here.
2. **[TENANT_CAPABILITY_MODEL.md](./TENANT_CAPABILITY_MODEL.md)**
   — The shared workspace schema and capability registry that make self-serve
   expansion possible.
3. **[ENTITLEMENT_AND_ACTIVATION_MODEL.md](./ENTITLEMENT_AND_ACTIVATION_MODEL.md)**
   — How paying unlocks activation, the three activation types
   (`instant`, `guided`, `assisted`), and the entitlement lifecycle.
4. **[MARKETPLACE_AND_UPSELL_LOGIC.md](./MARKETPLACE_AND_UPSELL_LOGIC.md)**
   — How the product itself becomes the best sales channel through
   opportunity cards, contextual prompts, and bundle recommendations.
5. **[AUTOMATION_DEPLOYABILITY_STANDARD.md](./AUTOMATION_DEPLOYABILITY_STANDARD.md)**
   — The normative gate. No module ships without meeting every requirement in
   this document. Read this before promoting any module above `spec`.

## Operational audit

- **[docs/operations/MODULE_RELEASE_SCOREBOARD.md](../operations/MODULE_RELEASE_SCOREBOARD.md)**
  — Running status of every module, bundle, suite, and edition against the
  deployability standard. This is the single source of truth for "what can we
  sell today?"

## Source documents this builds on

- `docs/strategy/SERVICE_BUSINESS_AUTOMATION_CATALOG.md` — the raw universe of
  ~347 automatable micro-tasks.
- `docs/strategy/PERSONA_GROUPS_MASTER.md` — the buyer segmentation that drives
  messaging and recommendations.
- `docs/strategy/JTBD_JOURNEYS_AND_SERVICE_BLUEPRINTS.md` — the service-design
  doctrine behind onboarding, activation, and handoff.
- `docs/strategy/COMMERCIAL_DECISIONS.md` — three open commercial decisions
  that must be resolved before launch (FSM positioning, launcher-build
  handoff, commercial essentials).
- `docs/operations/MARCH_2026_AUTOMATIONS_INVENTORY.md` — the shipped-state
  ledger.

## Output this produces

- `product/` — machine-readable product objects consumed by `api/` and the UI.
- `api/catalog/`, `api/tenants/`, `api/events/` — the runtime handlers that
  read `product/` and act on tenant state.
