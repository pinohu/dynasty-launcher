# Activation Flow Specification

**Purpose:** the literal system contract that every module activation passes
through. This is not pseudocode; this is the behavior agents must implement.

**Authority:** deviations from this spec are a deployability violation per
[AUTOMATION_DEPLOYABILITY_STANDARD.md](../architecture/AUTOMATION_DEPLOYABILITY_STANDARD.md).

**Last updated:** 2026-04-15

---

## The seven system events

Every activation produces exactly one of these outcomes, signaled by an
emitted event:

1. `module.activated` — module is now running for the tenant
2. `module.activation_failed` — rolled back; tenant state unchanged
3. `module.activation_deferred` — awaiting guided-wizard completion
4. `module.paused` — active but not executing (e.g. failed payment)
5. `module.deactivated` — customer turned off; data preserved
6. `module.revoked` — billing permanently lost; data archived per policy
7. `module.reactivated` — resumed from pause or deactivation

No other outcomes exist. Any code path that doesn't terminate in one of these
is an implementation bug.

---

## Entry point 1: Purchase → entitlement grant

**Trigger:** Stripe webhook `invoice.paid` or `checkout.session.completed` for
a line item that maps to a module, pack, suite, or edition.

**Implementation location:** `api/checkout.js` + `api/tenants/activate-module.js`

**Flow:**

```
1. Receive Stripe webhook.
2. Verify signature. If invalid, 400.
3. Resolve the line item(s) to module_code(s) via product/pricing/*.
4. For each module_code:
   a. Upsert an entitlement row (state=entitled, billing_source=…).
   b. Emit entitlement.granted(tenant_id, module_code, billing_source).
   c. Trigger activation (see Entry point 3 below).
5. Return 200 to Stripe.
```

Idempotency: webhook replays must not create duplicate entitlements.
Enforce via unique (tenant_id, module_code, stripe_subscription_item_id).

---

## Entry point 2: Staff-triggered entitlement grant

**Trigger:** admin console or migration tool grants an entitlement outside
Stripe (trial, concierge comp, build-tier bundling).

**Implementation location:** `api/admin.js` + `api/tenants/activate-module.js`

**Flow:** identical to Entry point 1 from step 4a onward. `billing_source.source_type`
is set to `trial`, `comp`, or `plan_included` as appropriate.

---

## Entry point 3: Activation

**Called by:** Entry point 1 step 4c; Entry point 2; user-initiated
"activate" click in the marketplace.

**Implementation location:** `api/tenants/activate-module.js`

### Step 1 — verify_entitlement

```
entitlement = get_entitlement(tenant_id, module_code)
if not entitlement or entitlement.state == 'revoked':
    emit module.activation_failed(reason='no_entitlement')
    return ERROR
if entitlement.state == 'active':
    return IDEMPOTENT_OK
```

### Step 2 — verify_tier_gate

```
tenant = get_tenant(tenant_id)
module = get_module(module_code)
if module.tier_availability and tenant.plan not in module.tier_availability:
    emit module.activation_failed(reason='tier_mismatch')
    return ERROR
```

### Step 3 — verify_capabilities

```
missing = [cap for cap in module.capabilities_required
           if cap not in tenant.capabilities_enabled]
if missing:
    if all(cap has setup_wizard_id for cap in missing):
        entitlement.state = 'entitled'
        emit module.activation_deferred(tenant_id, module_code, missing)
        launch_wizard(tenant_id, missing)
        return DEFERRED
    else:
        emit module.activation_failed(reason='no_wizard_for_capability')
        return ERROR
```

No step may page a human. If a capability has no wizard, the module is not
deployable and must not have reached this code path.

### Step 4 — verify_prerequisite_modules

```
for prereq_code in module.prerequisite_modules:
    prereq_entitlement = get_entitlement(tenant_id, prereq_code)
    if not prereq_entitlement or prereq_entitlement.state != 'active':
        emit module.activation_failed(reason='prereq_not_active',
                                      prereq=prereq_code)
        return ERROR
```

### Step 5 — verify_usage_and_seats

```
if tenant.seats_used > tenant.plan.max_seats:
    emit module.activation_failed(reason='seat_overage_unresolved')
    return ERROR
if module uses sms and tenant.sms_usage_30d > plan_limit:
    emit module.activation_failed(reason='sms_fair_use_exceeded')
    return ERROR
```

### Step 6 — provision_tenant_records

```
transaction:
    ensure_tenant_schema_objects(tenant_id, module.inputs)
    create_or_update_module_state_record(tenant_id, module_code)
    if transaction_failed:
        rollback()
        emit module.activation_failed(reason='provision_error')
        return ERROR
```

Idempotency: re-running step 6 for an already-provisioned module must be a no-op.

### Step 7 — clone_workflow_to_tenant

```
workflow_def = get_workflow_def(module_code)
tenant_workflow = clone_workflow(workflow_def, tenant_id)
bind_trigger(tenant_workflow, module.trigger)
```

Workflow definitions live in `templates/workflow-templates/{module_code}/`.

### Step 8 — bind_templates

```
for template_code in module.templates_used:
    resolve_template(template_code, tenant_id, blueprint_code)
    # Blueprint-level overrides resolve before tenant-level overrides
```

Missing template = abort and rollback. Templates are not created at activation
time.

### Step 9 — bind_settings

```
for setting in module.configurable_settings:
    value = user_input.get(setting.key, setting.default)
    validate_setting(setting, value)
    write_setting(tenant_id, module_code, setting.key, value)
```

### Step 10 — register_event_triggers

```
register_trigger_handler(
    event=module.trigger.event,
    conditions=module.trigger.conditions,
    tenant_id=tenant_id,
    module_code=module_code,
)
```

### Step 11 — enable_observability

```
enable_module_metrics(tenant_id, module_code, module.kpis)
enable_failure_alerting(tenant_id, module_code, threshold_pct=5)
```

### Step 12 — run_postflight_validator

```
postflight = run_postflight_validator(tenant_id, module_code)
if not postflight.passed:
    rollback_all_prior_steps()
    emit module.activation_failed(reason='postflight_failed',
                                  details=postflight.details)
    return ERROR
```

Postflight must run within SLO (≤30s). Failure triggers full rollback via
step 13's inverse.

### Step 13 — mark_module_active

```
entitlement.state = 'active'
entitlement.activated_at = now()
entitlement.prereq_check = { passed: true, checked_at: now() }
persist(entitlement)
```

### Step 14 — emit_activated

```
emit module.activated(tenant_id, module_code, timestamp=now())
```

---

## Rollback contract

Any step 6–12 failure invokes rollback in reverse order:

```
12 → unregister_triggers
11 → disable_observability
10 → (trigger registration undone above)
 9 → delete_settings
 8 → unbind_templates
 7 → delete_tenant_workflow
 6 → delete_provisioned_records
```

State ends with entitlement.state = 'entitled' (still paid, not active). The
customer can retry activation without re-purchasing.

**Rollback must itself be idempotent.** Partial rollbacks leave the system in
a consistent state.

---

## Guided-wizard contract (when step 3 defers)

**Implementation location:** `api/tenants/run-guided-setup.js`

```
1. Read missing_capabilities from activation_deferred event.
2. For each missing capability, look up setup_wizard_id in product/capabilities/.
3. Launch wizard in UI with the full list queued.
4. Each wizard step:
   a. Collects one piece of configuration.
   b. Calls verify endpoint (each capability has its own).
   c. On success, append capability to tenant.capabilities_enabled.
5. When all missing capabilities resolved, re-invoke Entry point 3 with same args.
```

Wizards must complete in ≤10 minutes of customer time. No step calls a human.

---

## Deactivation flow

**Trigger:** customer clicks "Deactivate" in the UI, or a cancellation
webhook fires.

**Implementation location:** `api/tenants/deactivate-module.js`

```
1. Verify the requester has permission.
2. entitlement = get_entitlement(tenant_id, module_code)
3. if entitlement.state not in ('active', 'paused'): return IDEMPOTENT_OK
4. unregister_event_triggers(tenant_id, module_code)
5. disable_module_metrics(tenant_id, module_code)
6. apply_downgrade_behavior(module.downgrade_behavior):
   - disable_new_runs_keep_data: keep all data, block future runs
   - disable_and_archive: move data to cold storage, set TTL
   - manual_review: flag for human review, keep data intact (exception path)
7. entitlement.state = 'deactivated'; entitlement.deactivated_at = now()
8. emit module.deactivated(tenant_id, module_code, on_cancel=...)
```

No module's deactivation may block on human action. `manual_review` flags an
out-of-band review but still completes the deactivation immediately.

---

## Pause / resume

**Trigger:** failed payment, customer-initiated temporary pause, admin pause.

```
Pause:
  entitlement.state = 'paused'
  unregister_event_triggers
  preserve config_state intact
  emit module.paused

Resume:
  if entitlement.state == 'paused':
      re-register_event_triggers (from persisted config_state)
      entitlement.state = 'active'
      emit module.reactivated
```

Resume is lossless: `config_state` is never wiped during pause.

---

## Revocation

**Trigger:** subscription permanently canceled, refunded, or churned beyond
grace period.

```
1. Apply deactivation flow.
2. entitlement.state = 'revoked'
3. entitlement.revoked_at = now()
4. Start data-retention timer from module.downgrade_behavior.data_retention_days.
5. emit module.revoked
```

Re-subscribing after revocation creates a new entitlement row and restores
`config_state` if still within retention.

---

## Error taxonomy

Every `module.activation_failed` event carries a `reason`. Allowed values:

| Reason | Meaning | Retryable? |
|---|---|---|
| `no_entitlement` | No entitlement row or revoked | After purchase |
| `tier_mismatch` | Tenant plan doesn't include this module's tier | After upgrade |
| `no_wizard_for_capability` | Deployability defect — should not reach prod | No |
| `prereq_not_active` | Required prereq module not active | After prereq activation |
| `seat_overage_unresolved` | Tenant over seat cap | After seat purchase |
| `sms_fair_use_exceeded` | SMS usage past threshold | After overage purchase |
| `provision_error` | DB transaction failed | Yes, with backoff |
| `postflight_failed` | Test-fire didn't meet SLO | Yes, with investigation |
| `workflow_clone_failed` | Workflow template error | No — fix template |
| `template_missing` | Referenced template doesn't exist | No — fix catalog |

Any reason not on this list is a bug.

---

## SLOs

| Operation | p50 | p95 | Hard timeout |
|---|---|---|---|
| `instant` activation (steps 1–14) | 3s | 10s | 30s |
| `guided` wizard completion (per step) | 30s | 2min | 10min |
| Deactivation | 2s | 5s | 15s |
| Rollback | 5s | 15s | 60s |
| Postflight test-fire | 5s | 20s | 30s |

---

## Observability requirements

Every invocation of every step emits a structured event with:

- `tenant_id`
- `module_code`
- `step_number` (1–14)
- `outcome` (`ok`, `failed`, `deferred`, `rolled_back`)
- `duration_ms`
- `error_code` (if applicable)

These events feed `api/events/` handlers, dashboards, and alerting. Without
them, the platform is not compliant with
[AUTOMATION_DEPLOYABILITY_STANDARD.md §12](../architecture/AUTOMATION_DEPLOYABILITY_STANDARD.md).

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-04-15 | Spec authored | Claude (drafted), pinohu (owner) |
