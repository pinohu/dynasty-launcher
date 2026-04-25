// api/tenants/_activation.mjs — the 14-step activation contract
// -----------------------------------------------------------------------------
// Implements the literal activation contract from
// docs/operations/ACTIVATION_FLOW_SPEC.md.
//
// This file is pure logic — no HTTP, no I/O beyond the store and event bus.
// activate-module.js and deactivate-module.js wrap it in HTTP handlers.
//
// Module-specific workflow provisioning (steps 6–11 real implementation) is
// the responsibility of each Module Build squad and lands per-module under
// templates/workflow-templates/{module_code}/. This engine orchestrates the
// contract; per-module hooks are stubbed as no-ops until squads wire them up.
//
// Error reasons MUST be from the taxonomy in ACTIVATION_FLOW_SPEC.md §"Error
// taxonomy". Unknown reasons are a bug.
// -----------------------------------------------------------------------------

import { getCatalog, indexModules } from '../catalog/_lib.mjs';
import {
  getTenant,
  getEntitlement,
  upsertEntitlement,
  listTenantEntitlements,
} from './_store.mjs';
import { emit } from '../events/_bus.mjs';

// -----------------------------------------------------------------------------
// Outcome shapes
// -----------------------------------------------------------------------------
// Every activation produces exactly one of:
//   { status: 'ok', entitlement }                — module is active
//   { status: 'idempotent_ok', entitlement }     — already active, no-op
//   { status: 'deferred', missing_capabilities, wizards }  — guided setup pending
//   { status: 'error', reason, details? }        — activation failed and rolled back
// -----------------------------------------------------------------------------

const VALID_REASONS = new Set([
  'no_entitlement',
  'tier_mismatch',
  'no_wizard_for_capability',
  'prereq_not_active',
  'seat_overage_unresolved',
  'sms_fair_use_exceeded',
  'provision_error',
  'postflight_failed',
  'workflow_clone_failed',
  'template_missing',
  'not_purchased',
  // Extensions required by practical need:
  'tenant_not_found',
  'module_not_found',
  'revoked',
  'assisted_disallowed',
  'hipaa_addon_required',
]);

// Modules that touch PHI and therefore require the HIPAA add-on when the
// tenant's blueprint is HIPAA-adjacent. The list is conservative; expand
// as new PHI-touching modules land.
// Source: docs/operations/PRICING_BILLING_IMPLEMENTATION_SPEC.md §3f HIPAA.
const HIPAA_ADJACENT_BLUEPRINTS = new Set(['med-spa']);
function requiresHipaaAddon(module, tenant) {
  if (!tenant) return false;
  const flags = new Set(module.compliance_flags || []);
  const phiAdjacent = flags.has('pii_minimization') || flags.has('review_solicitation_policy');
  // A tenant using a HIPAA-adjacent blueprint with a PHI-touching module
  // must opt into the HIPAA add-on (via compliance_mode = 'hipaa').
  return phiAdjacent
    && HIPAA_ADJACENT_BLUEPRINTS.has(tenant.blueprint_installed)
    && tenant.compliance_mode !== 'hipaa';
}

function failure(tenant_id, module_code, reason, details = {}) {
  if (!VALID_REASONS.has(reason)) {
    throw new Error(`activation reason '${reason}' not in taxonomy`);
  }
  emit('module.activation_failed', { tenant_id, module_code, reason, ...details });
  return { status: 'error', reason, ...details };
}

// -----------------------------------------------------------------------------
// Per-module provisioning hooks (steps 6–12 real work)
// -----------------------------------------------------------------------------
// Each function is a no-op in this engine. Module Build squads override these
// by adding real workflow wiring in templates/workflow-templates/{module_code}/
// and pointing this engine at them as promotions happen.
// -----------------------------------------------------------------------------

async function provisionTenantRecords(tenant, module, input) {
  // Step 6. Idempotent by contract: re-running must be safe.
  return { ok: true };
}

async function cloneWorkflowToTenant(tenant, module) {
  // Step 7. Would copy a workflow template into tenant context.
  return { ok: true };
}

async function bindTemplates(tenant, module) {
  // Step 8. Would resolve blueprint + tenant-level template overrides.
  return { ok: true };
}

async function bindSettings(tenant, module, input, priorConfig) {
  // Step 9. Validate and persist user_input against module.configurable_settings.
  // Precedence (per QA_MATRIX.md reactivation path "no re-configuration required"):
  //   1. explicit user_input
  //   2. prior config_state (reactivation preserves settings)
  //   3. module.configurable_settings[*].default
  //   4. null
  const settings = {};
  const prior = priorConfig || {};
  const inp = input || {};
  for (const s of (module.configurable_settings || [])) {
    if (Object.prototype.hasOwnProperty.call(inp, s.key)) {
      settings[s.key] = inp[s.key];
    } else if (Object.prototype.hasOwnProperty.call(prior, s.key)) {
      settings[s.key] = prior[s.key];
    } else if (s.default !== undefined) {
      settings[s.key] = s.default;
    } else {
      settings[s.key] = null;
    }
  }
  return { ok: true, settings };
}

async function registerEventTriggers(tenant, module) {
  // Step 10. Would subscribe to module.trigger.event on the bus.
  return { ok: true };
}

async function enableObservability(tenant, module) {
  // Step 11. Would enable module-level metric emitters.
  return { ok: true };
}

async function runPostflightValidator(tenant, module) {
  // Step 12. Stub returns pass. Module Build squads replace with real test-fire.
  return { passed: true };
}

async function rollback(tenant_id, module_code) {
  // Inverse of steps 7-11 in reverse order. All no-ops in the stub.
  // When squads wire real provisioning, they add their own rollback here.
  return { ok: true };
}

// -----------------------------------------------------------------------------
// The main entry point: activate
// -----------------------------------------------------------------------------

export async function activateModule({ tenant_id, module_code, user_input = {} }) {
  const { modules, capabilities } = getCatalog();
  const modsByCode = indexModules(modules);
  const capsByCode = {};
  for (const c of capabilities) capsByCode[c.capability_code] = c;

  // Step 1: verify_entitlement
  const ent = await getEntitlement(tenant_id, module_code);
  if (!ent) return failure(tenant_id, module_code, 'no_entitlement');
  if (ent.state === 'revoked') return failure(tenant_id, module_code, 'revoked');
  if (ent.state === 'dormant') {
    return failure(tenant_id, module_code, 'not_purchased');
  }
  if (ent.state === 'active') {
    return { status: 'idempotent_ok', entitlement: ent };
  }

  const tenant = await getTenant(tenant_id);
  if (!tenant) return failure(tenant_id, module_code, 'tenant_not_found');

  // Step 2: verify_tier_gate
  const module = modsByCode[module_code];
  if (!module) return failure(tenant_id, module_code, 'module_not_found');

  // Assisted modules are not production-self-serve per the deployability standard.
  if (module.activation_type === 'assisted') {
    return failure(tenant_id, module_code, 'assisted_disallowed');
  }

  if (module.tier_availability && module.tier_availability.length > 0
      && !module.tier_availability.includes(tenant.plan)
      && tenant.plan !== 'enterprise') {
    return failure(tenant_id, module_code, 'tier_mismatch',
      { plan: tenant.plan, required: module.tier_availability });
  }

  // HIPAA gate: block PHI-touching modules on HIPAA-adjacent blueprints unless
  // the tenant has the HIPAA add-on (compliance_mode='hipaa').
  if (requiresHipaaAddon(module, tenant)) {
    return failure(tenant_id, module_code, 'hipaa_addon_required',
      { blueprint: tenant.blueprint_installed, monthly_usd: 49 });
  }

  // Step 3: verify_capabilities
  const enabled = new Set(tenant.capabilities_enabled || []);
  const missing = (module.capabilities_required || []).filter((c) => !enabled.has(c));
  if (missing.length > 0) {
    // Every missing capability must have a setup wizard (else it's a deployability defect)
    const withoutWizard = missing.filter((c) => !capsByCode[c]?.setup_wizard_id);
    if (withoutWizard.length > 0) {
      return failure(tenant_id, module_code, 'no_wizard_for_capability',
        { missing_without_wizard: withoutWizard });
    }
    // Defer. Entitlement stays in 'entitled' state, awaiting wizard completion.
    const wizards = missing.map((c) => ({
      capability: c,
      wizard_id: capsByCode[c].setup_wizard_id,
    }));
    const checked = {
      passed: false,
      missing_capabilities: missing,
      checked_at: new Date().toISOString(),
    };
    await upsertEntitlement(tenant_id, module_code, { state: 'entitled', prereq_check: checked });
    emit('module.activation_deferred', {
      tenant_id,
      module_code,
      missing_capabilities: missing,
      wizards,
    });
    return { status: 'deferred', missing_capabilities: missing, wizards };
  }

  // Step 4: verify_prerequisite_modules
  for (const prereq of (module.prerequisite_modules || [])) {
    const pe = await getEntitlement(tenant_id, prereq);
    if (!pe || pe.state !== 'active') {
      return failure(tenant_id, module_code, 'prereq_not_active', { prereq });
    }
  }

  // Step 5: verify_usage_and_seats — deferred to Track 7 (billing).
  //   Current stub accepts all activations; Track 7 will plug in real fair-use.

  // --- Begin transactional steps 6-12 (with rollback on failure) ---
  try {
    const p6 = await provisionTenantRecords(tenant, module, user_input);
    if (!p6.ok) { await rollback(tenant_id, module_code); return failure(tenant_id, module_code, 'provision_error'); }

    const p7 = await cloneWorkflowToTenant(tenant, module);
    if (!p7.ok) { await rollback(tenant_id, module_code); return failure(tenant_id, module_code, 'workflow_clone_failed'); }

    const p8 = await bindTemplates(tenant, module);
    if (!p8.ok) { await rollback(tenant_id, module_code); return failure(tenant_id, module_code, 'template_missing'); }

    const p9 = await bindSettings(tenant, module, user_input, ent.config_state);
    if (!p9.ok) { await rollback(tenant_id, module_code); return failure(tenant_id, module_code, 'provision_error'); }

    const p10 = await registerEventTriggers(tenant, module);
    if (!p10.ok) { await rollback(tenant_id, module_code); return failure(tenant_id, module_code, 'provision_error'); }

    const p11 = await enableObservability(tenant, module);
    if (!p11.ok) { await rollback(tenant_id, module_code); return failure(tenant_id, module_code, 'provision_error'); }

    const p12 = await runPostflightValidator(tenant, module);
    if (!p12.passed) { await rollback(tenant_id, module_code); return failure(tenant_id, module_code, 'postflight_failed', { details: p12.details || null }); }

    // Step 13: mark_module_active
    const activated = await upsertEntitlement(tenant_id, module_code, {
      state: 'active',
      activated_at: new Date().toISOString(),
      config_state: p9.settings,
      prereq_check: { passed: true, missing_capabilities: [], checked_at: new Date().toISOString() },
    });

    // Step 14: emit_activated
    emit('module.activated', { tenant_id, module_code, at: activated.activated_at });
    return { status: 'ok', entitlement: activated };
  } catch (err) {
    await rollback(tenant_id, module_code);
    return failure(tenant_id, module_code, 'provision_error', { thrown: String(err.message || err) });
  }
}

// -----------------------------------------------------------------------------
// Deactivation
// -----------------------------------------------------------------------------

export async function deactivateModule({ tenant_id, module_code }) {
  const { modules } = getCatalog();
  const module = modules.find((m) => m.module_code === module_code);
  if (!module) return { status: 'error', reason: 'module_not_found' };

  const ent = await getEntitlement(tenant_id, module_code);
  if (!ent) return { status: 'idempotent_ok' };
  if (ent.state === 'deactivated' || ent.state === 'revoked') {
    return { status: 'idempotent_ok', entitlement: ent };
  }

  // Apply downgrade_behavior (stub: just record it)
  const onCancel = module.downgrade_behavior?.on_cancel || 'disable_new_runs_keep_data';

  const updated = await upsertEntitlement(tenant_id, module_code, {
    state: 'deactivated',
    deactivated_at: new Date().toISOString(),
  });
  emit('module.deactivated', { tenant_id, module_code, on_cancel: onCancel });
  return { status: 'ok', entitlement: updated, on_cancel: onCancel };
}

// -----------------------------------------------------------------------------
// Pause / resume (for failed-payment or customer-initiated pause)
// -----------------------------------------------------------------------------

export async function pauseModule({ tenant_id, module_code, reason = 'customer_requested' }) {
  const ent = await getEntitlement(tenant_id, module_code);
  if (!ent) return { status: 'error', reason: 'no_entitlement' };
  if (ent.state !== 'active') return { status: 'idempotent_ok', entitlement: ent };

  const paused = await upsertEntitlement(tenant_id, module_code, { state: 'paused' });
  emit('module.paused', { tenant_id, module_code, reason });
  return { status: 'ok', entitlement: paused };
}

export async function resumeModule({ tenant_id, module_code }) {
  const ent = await getEntitlement(tenant_id, module_code);
  if (!ent) return { status: 'error', reason: 'no_entitlement' };
  if (ent.state !== 'paused') return { status: 'idempotent_ok', entitlement: ent };

  const resumed = await upsertEntitlement(tenant_id, module_code, {
    state: 'active',
    // config_state preserved; activated_at intentionally not bumped (resume != reactivate)
  });
  emit('module.reactivated', { tenant_id, module_code });
  return { status: 'ok', entitlement: resumed };
}

// -----------------------------------------------------------------------------
// Entitlement grant (for Stripe webhook or admin)
// -----------------------------------------------------------------------------

export async function grantEntitlement({ tenant_id, module_code, billing_source }) {
  const ent = await upsertEntitlement(tenant_id, module_code, {
    state: 'entitled',
    billing_source: billing_source || { source_type: 'module' },
  });
  emit('entitlement.granted', { tenant_id, module_code, billing_source });
  return ent;
}

// Expose store listing for endpoint convenience
export { listTenantEntitlements };
