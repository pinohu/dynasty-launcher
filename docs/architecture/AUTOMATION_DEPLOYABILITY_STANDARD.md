# Automation Deployability Standard

**Status:** NORMATIVE — this is the production-admission gate for every module
in `product/modules/`.
**Owner:** Platform / Product
**Adopted:** 2026-04-15
**Related:** `docs/architecture/SERVICE_AUTOMATION_PRODUCT_ARCHITECTURE.md`,
`docs/architecture/ENTITLEMENT_AND_ACTIVATION_MODEL.md`,
`docs/architecture/TENANT_CAPABILITY_MODEL.md`

---

## The commitment

> **Every automation sold through the platform must be fully prebuilt,
> parameterized, dependency-checked, and deployable through a single automated
> activation path, with no manual intervention by staff.**

If a module cannot satisfy that statement, it does not appear in the
marketplace. There is no middle ground. There is no "we'll configure that for
you at activation." "Self-serve" means self-serve.

This document is the gate. No module ships past `spec` status without meeting
every requirement below.

---

## Status model

Every module in `product/modules/*.json` carries a `status` field. The allowed
values, in promotion order:

| Status | Definition | Visible in marketplace? | Sellable? |
|---|---|---|---|
| `draft` | Idea exists in `docs/SERVICE_BUSINESS_AUTOMATION_CATALOG.md`. No JSON yet. | No | No |
| `spec` | Module JSON exists in `product/modules/`. Contract is declared but implementation is incomplete. | No | No |
| `implemented` | Workflow logic, templates, settings, triggers all exist. No tests yet. | No | No |
| `validated` | Tests pass, preflight and postflight checks pass against a test tenant. | No | No |
| `deployable` | Has been activated end-to-end on a staging tenant with no human intervention. | Optional — behind a beta flag | Limited (paid beta only) |
| `live` | Activated on ≥10 paying tenants without regressions. | **Yes** | **Yes** |
| `deprecated` | Being retired. New activations blocked; existing tenants supported until sunset. | Degraded view | No new sales |

**Promotion rule:** a module can only advance one status at a time, and only
after all criteria for that status are signed off.

**Demotion rule:** a module can be demoted at any time on discovery of a
deployability violation. Demotion to `validated` or below removes it from the
marketplace immediately.

---

## Admission criteria — the long form

A module qualifies for `live` only when every item below is true and recorded.

### 1. Machine-readable definition

- [ ] File exists at `product/modules/{category}/{code}.json`
- [ ] Validates against `product/schema/module.schema.json` (no unknown fields, all `required` present)
- [ ] `module_code` is globally unique and matches `pattern: ^[a-z][a-z0-9_]*$`
- [ ] `category` is one of the enumerated categories

### 2. Business contract

- [ ] `outcome` is one sentence, buyer-readable, naming a business result (not a feature)
- [ ] `description_short` under 140 characters
- [ ] `price_monthly` set according to `product/pricing/tiers.json` pricing rules
- [ ] `tier_availability` declared (which launcher build tiers can subscribe)
- [ ] `kpis` declared — must be measurable from tenant event data

### 3. Capability contract

- [ ] `capabilities_required` lists every capability the runtime will invoke
- [ ] Every listed capability has a file in `product/capabilities/`
- [ ] No capability is implicitly assumed
- [ ] `capabilities_optional` is declared where relevant
- [ ] `prerequisite_modules` is declared where event dependencies exist

### 4. Trigger and actions

- [ ] `trigger.event` is a declared event in the platform event vocabulary
- [ ] `trigger.conditions` (if any) are machine-checkable
- [ ] `actions` are all implemented in the runtime — no placeholders
- [ ] Every action has an implementation, a failure mode, and a retry policy

### 5. Configurable settings

- [ ] Each setting has `key`, `label`, `type`, and a safe `default`
- [ ] No setting can place the workflow in an invalid state
- [ ] No setting is "customer can edit raw workflow logic" — only parameters
- [ ] Settings use `template_ref` or `user_ref` types when pointing at other objects; no free-text IDs

### 6. Templates

- [ ] Every code in `templates_used` exists in the template registry
- [ ] Every template has been rendered against at least one fictional tenant
- [ ] Templates respect the module's `compliance_flags`
- [ ] Tenant-level overrides in blueprints resolve without error

### 7. Compliance

- [ ] `compliance_flags` cover every policy gate the module touches
- [ ] Each flag is enforced at runtime (not just declared)
- [ ] SMS-related modules: `sms_opt_out` + A2P registration honored
- [ ] Email-related modules: `email_footer` + suppression list honored
- [ ] Payment-related modules: `pci_hand_off` respected (no card data touches the launcher)
- [ ] Health-adjacent modules: gated behind the HIPAA add-on where required

### 8. Activation path

- [ ] `activation_type` is `instant` or `guided`
- [ ] `instant` modules: every required capability can be auto-verified at checkout time
- [ ] `guided` modules: the wizard exists and completes in ≤10 minutes of customer time

**`assisted` is not production-self-serve and may not be marketed as
self-serve.** If a module requires staff intervention, it is not deployable
under this standard. The `assisted` value remains in the schema only so legacy
data can round-trip; no new module may ship with that activation type, and no
`assisted` module may appear in the marketplace, in a pack, in a suite, or
in an edition.

If the platform discovers that a module labeled `instant` or `guided` actually
requires staff to complete activation, the module is immediately demoted below
`deployable` and removed from the marketplace until the gap is closed on the
platform side — not by adding human steps.

### 9. Preflight checks

Before activation, the system must be able to confirm:

- [ ] Tenant has the required capabilities enabled
- [ ] Tenant has satisfied any `prerequisite_modules`
- [ ] Tenant configuration passes the module's preflight validator
- [ ] Tenant is on a tier that includes this module's `tier_availability`
- [ ] Tenant has not exceeded usage or seat limits relevant to this module

If any check fails, activation is either:
- routed into a guided wizard that resolves the gap, or
- refused with a clear, actionable message

**It is never routed to a human.**

### 10. Postflight validation

After activation, the system must be able to confirm:

- [ ] Event triggers are registered and receiving the correct events
- [ ] A test-fire (dry-run or sandboxed real run) completes within SLO
- [ ] First-run metrics are being emitted
- [ ] Module appears in the tenant dashboard as `active`
- [ ] No silent failure during onboarding

### 11. Runtime safety

- [ ] Rate limits and circuit breakers declared
- [ ] Retry policy declared per action
- [ ] Dead-letter handling declared for failed executions
- [ ] Tenant isolation enforced — no action can read or write another tenant's data
- [ ] PII handling matches the module's `compliance_flags`

### 12. Observability

- [ ] Every module execution emits a structured event with tenant ID, module code, trigger event ID, outcome, and duration
- [ ] Every KPI declared on the module is computable from those events
- [ ] Failure rates are queryable per tenant and per module
- [ ] On-call alerts fire when module failure rate exceeds threshold

### 13. Downgrade and deletion

- [ ] `downgrade_behavior.on_cancel` is one of the enumerated values
- [ ] `downgrade_behavior.data_retention_days` is set
- [ ] Pause preserves `config_state` without loss
- [ ] Resume restores exact prior behavior
- [ ] Data export exists for `disable_and_archive` and `manual_review` paths

### 14. Entitlement and billing

- [ ] Purchase of the module or any bundle containing it creates exactly one entitlement row
- [ ] No double-billing when a module sits in multiple bundles
- [ ] Cancellation transitions state to `deactivated` without data loss
- [ ] Reactivation restores prior `config_state`

### 15. Tests

- [ ] Unit tests cover every action
- [ ] Integration test activates the module on a fresh test tenant end-to-end
- [ ] Compliance test verifies each declared `compliance_flag` is enforced
- [ ] Load test verifies the module holds SLO at 10× current peak
- [ ] Test fixtures live alongside the module definition

### 16. Documentation

- [ ] Customer-facing description is accurate to what the module actually does
- [ ] Known limitations are documented
- [ ] First-run expectations are documented ("you'll see your first result within X")
- [ ] Support runbook exists for common activation failures

---

## The activation contract

When a tenant purchases a module (directly, via pack, via suite, or via edition),
the platform **must** execute this sequence with zero human steps:

```
1.  verify_entitlement(tenant, module)
2.  verify_tier_gate(tenant.plan, module.tier_availability)
3.  verify_capabilities(tenant, module.capabilities_required)
4.  verify_prerequisites(tenant, module.prerequisite_modules)
5.  resolve_missing_capabilities(tenant, module)  — launches wizards, never pages a human
6.  provision_tenant_records(tenant, module)
7.  clone_workflow_to_tenant(module, tenant.id)
8.  bind_templates(tenant, module.templates_used)
9.  bind_settings(tenant, module.configurable_settings, user_input)
10. register_event_triggers(tenant, module.trigger)
11. enable_monitoring(tenant, module)
12. run_postflight_validator(tenant, module)
13. mark_module_active(tenant, module)
14. emit(module.activated, tenant, module)
```

Any step that cannot complete automatically is a deployability defect. File
an issue and demote the module until fixed.

---

## Allowed customer input

Customer input is allowed **only** through self-serve UI fields surfaced by the
module's `configurable_settings`. The supported shapes include:

- business hours
- assignee (user reference)
- message tone
- template choice
- reminder timing
- review link preference
- quiet hours
- channel choice (email / SMS / both)
- cadence selection from a fixed list

Customers must **never** be required to:

- file a support ticket to complete activation
- wait for staff setup to finish
- request engineering help
- depend on manual credential stitching by staff
- receive a shared credential from the launcher
- copy-paste configuration from a document or email thread

If the only path to a working module runs through any of the above, the module
is not deployable and does not ship.

---

## Prohibited patterns

The following patterns **automatically disqualify** a module from `deployable`
status. If any of these is true for a module, demote it immediately.

- Hidden manual setup
- Undocumented prerequisites
- Custom one-off tenant logic
- Environment-specific hacks
- Spreadsheet-driven activation
- Support-ticket-only provisioning
- Activation that depends on developer intervention
- Templates created manually after purchase
- Manual database edits to complete activation
- Shared launcher credentials routed to the tenant's live traffic
- "Just this once" exceptions that accrete into a process

The list is not exhaustive. Any pattern that breaks the core commitment —
*no manual intervention by staff* — disqualifies the module regardless of
whether it appears above.

---

## Marketplace gating

The rendered marketplace (in `app.html` or the future `app/marketplace`) must
show only modules where:

```
module.status in ("deployable", "live")
AND module_is_available_for_tier(module, tenant.plan)
AND module.tier_availability includes tenant.plan
```

Modules in `spec` / `implemented` / `validated` may appear on an internal admin
view or a public roadmap (`maturity.html`) — never in the commercial
marketplace.

---

## How bundles, suites, and editions interact with this standard

A pack, suite, or edition **inherits the strictest status of its members**.

- A pack is `live` only when every module it contains is `live`.
- A suite is `live` only when every pack it contains is `live`.
- An edition is `live` only when every suite and pack it contains is `live`.

Any member at `deployable` → the whole container is `deployable` (beta only).
Any member below `validated` → the container does not ship.

This is why `bundle-pricing.json` today explicitly lists Sales Follow-Up,
Communication, and Operations packs under `not_launching_yet` — their
constituent modules haven't earned `live`.

---

## Admission process

To promote a module's status:

1. Author opens a promotion request referencing the module file.
2. Author checks each applicable box on the promotion checklist.
3. Reviewer verifies evidence (test logs, staging-tenant screenshots, metric queries).
4. Reviewer updates `status` in the module JSON.
5. Commit references this document.

Promotion from `validated` → `deployable` also requires:
- one successful full-cycle activation on the staging tenant, recorded.

Promotion from `deployable` → `live` also requires:
- 10 paying tenants activated without intervention,
- 30-day rolling failure rate under 1%,
- zero compliance-flag violations in the window.

Demotion is immediate on any of:
- compliance violation,
- activation requires human touch,
- silent failure in postflight,
- data leak across tenants.

---

## Scoreboard

A running scoreboard of every module's status lives at
`docs/operations/MODULE_RELEASE_SCOREBOARD.md`. It is updated every time
status changes. Marketplace rendering reads from module JSON, but the
scoreboard is the human-readable audit view.

---

## The non-negotiables

1. No module ships without machine-readable definition, capability contract, activation contract, preflight, postflight, observability, and entitlement hooks.
2. No activation path touches a human operator at the launcher.
3. No pack, suite, or edition ships that contains a non-`live` module.
4. No marketing material references a module whose status is below `deployable`.
5. No exception to these rules is granted without this document being updated.

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-04-15 | Standard adopted; applies to all existing and future modules | Claude (drafted), pinohu (owner) |
