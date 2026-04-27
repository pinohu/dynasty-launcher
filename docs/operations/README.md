# `docs/operations/` — Production execution

These documents are how the platform gets built. They translate the
architecture in `docs/architecture/`, strategy in `docs/strategy/`, and
companion narrative files under `docs/` (catalog, personas, JTBD)
into concrete work agents can execute without needing to ask questions.

## Read order by role

### I'm a founder / program owner
Start with [PRODUCT_PROMISE_MATRIX.md](./PRODUCT_PROMISE_MATRIX.md) before
shipping public copy, pricing, marketplace modules, or self-running claims.

1. [PRODUCTION_PROGRAM_BOARD.md](./PRODUCTION_PROGRAM_BOARD.md) — the 12
   tracks, dependencies, current status
2. [RELEASE_TRAIN.md](./RELEASE_TRAIN.md) — what ships in each wave
3. [MODULE_RELEASE_SCOREBOARD.md](./MODULE_RELEASE_SCOREBOARD.md) — what's
   actually ready today
4. [SALES_VALIDATION_PLAN.md](./SALES_VALIDATION_PLAN.md) — the 10 HVAC
   calls and the decision rules they drive

### I'm an architecture agent
1. [ACTIVATION_FLOW_SPEC.md](./ACTIVATION_FLOW_SPEC.md) — the 14-step
   activation contract (implement this before any module ships)
2. [CAPABILITY_IMPLEMENTATION_MAP.md](./CAPABILITY_IMPLEMENTATION_MAP.md) —
   per-capability provider, binding, and fair-use detail
3. [../architecture/AUTOMATION_DEPLOYABILITY_STANDARD.md](../architecture/AUTOMATION_DEPLOYABILITY_STANDARD.md)
   — the gate every module passes through

### I'm a module build agent
1. [MODULE_PRODUCTION_MATRIX.md](./MODULE_PRODUCTION_MATRIX.md) — per-module
   triggers, actions, capabilities, templates, UI, tests, rollback, observability
2. [PACK_READINESS_MAP.md](./PACK_READINESS_MAP.md) — which pack your module
   unblocks
3. [QA_MATRIX.md](./QA_MATRIX.md) — the six paths your module must pass

### I'm a commercial ops agent
1. [PRICING_BILLING_IMPLEMENTATION_SPEC.md](./PRICING_BILLING_IMPLEMENTATION_SPEC.md)
   — the enforcement logic for annual, trial, overages, HIPAA, enterprise
2. [SALES_VALIDATION_PLAN.md](./SALES_VALIDATION_PLAN.md) — customer calls
3. [../strategy/COMMERCIAL_DECISIONS.md](../strategy/COMMERCIAL_DECISIONS.md)
   — three open decisions

### I'm any agent
1. [AGENT_WORK_ALLOCATION.md](./AGENT_WORK_ALLOCATION.md) — find your team,
   your ownership boundaries, your handoff rules, your DoD

## File index

| File | Purpose |
|---|---|
| [PRODUCT_PROMISE_MATRIX.md](./PRODUCT_PROMISE_MATRIX.md) | Public promises, evidence state, conflicts, and release gates |
| [PRODUCTION_PROGRAM_BOARD.md](./PRODUCTION_PROGRAM_BOARD.md) | 12 tracks, dependencies, exit criteria |
| [ACTIVATION_FLOW_SPEC.md](./ACTIVATION_FLOW_SPEC.md) | 14-step activation contract |
| [MODULE_PRODUCTION_MATRIX.md](./MODULE_PRODUCTION_MATRIX.md) | Per-module production detail |
| [CAPABILITY_IMPLEMENTATION_MAP.md](./CAPABILITY_IMPLEMENTATION_MAP.md) | Per-capability provider / binding / fair-use |
| [PACK_READINESS_MAP.md](./PACK_READINESS_MAP.md) | Per-pack dependency chain + launch decision rule |
| [BLUEPRINT_MAP.md](./BLUEPRINT_MAP.md) | Per-vertical onboarding defaults |
| [PRICING_BILLING_IMPLEMENTATION_SPEC.md](./PRICING_BILLING_IMPLEMENTATION_SPEC.md) | Enforcement logic for every pricing mechanism |
| [AGENT_WORK_ALLOCATION.md](./AGENT_WORK_ALLOCATION.md) | 8 teams, non-overlap, handoff, DoD, escalation |
| [RELEASE_TRAIN.md](./RELEASE_TRAIN.md) | Wave schedule + pull/push rules |
| [QA_MATRIX.md](./QA_MATRIX.md) | 6 canonical test paths per module |
| [SALES_VALIDATION_PLAN.md](./SALES_VALIDATION_PLAN.md) | HVAC call script + objection log + 7 decision rules |
| [MODULE_RELEASE_SCOREBOARD.md](./MODULE_RELEASE_SCOREBOARD.md) | Running status of every module / pack / suite / edition |
| [MARKETPLACE_CARD_LANDING_PAGE_ROLLOUT.md](./MARKETPLACE_CARD_LANDING_PAGE_ROLLOUT.md) | Rollout plan for per-card marketplace landing pages |

## The single rule

If a document in this folder disagrees with
[../architecture/AUTOMATION_DEPLOYABILITY_STANDARD.md](../architecture/AUTOMATION_DEPLOYABILITY_STANDARD.md),
the standard wins. Fix the document.
