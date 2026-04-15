// api/events/_dispatcher.mjs — workflow dispatcher
// -----------------------------------------------------------------------------
// When an event is ingested, find every active module on the event's tenant
// whose trigger matches, load the workflow definition for that module, and
// execute its actions in order.
//
// This is the "module actually does something" layer. Per
// docs/architecture/AUTOMATION_DEPLOYABILITY_STANDARD.md §8: activations must
// be entirely automated, with per-step observability.
//
// Design notes:
//   - Dispatch is synchronous in MVP (action handlers are fast / stubbed).
//     When real integrations land, wrap the dispatch in a queue to survive
//     vendor latency.
//   - Every dispatch emits module.run.started, module.run.completed, and
//     (on failure) module.run.failed. These feed the observability layer and
//     populate the module's declared kpis.
//   - Workflows live at templates/workflow-templates/{module_code}/workflow.json.
//     A module without a workflow file is treated as a no-op (no error; the
//     module stub ships before the workflow does).
//   - Trigger matching: module.trigger.event must match event.event_type.
//     module.trigger.conditions (if any) must match event.payload.
//
// -----------------------------------------------------------------------------

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { emit } from './_bus.mjs';
import { hasHandler, runAction } from './_actions.mjs';
import { getTenant, getEntitlement, listTenantEntitlements } from '../tenants/_store.mjs';
import { getCatalog, indexModules } from '../catalog/_lib.mjs';

// -----------------------------------------------------------------------------
// Workflow template loading
// -----------------------------------------------------------------------------

function resolveTemplatesRoot() {
  const selfDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), 'templates', 'workflow-templates'),
    join(selfDir, '..', '..', 'templates', 'workflow-templates'),
    join(selfDir, 'templates', 'workflow-templates'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

const TEMPLATES_ROOT = resolveTemplatesRoot();
const _workflowCache = {};

function loadWorkflow(module_code) {
  if (Object.prototype.hasOwnProperty.call(_workflowCache, module_code)) {
    return _workflowCache[module_code];
  }
  if (!TEMPLATES_ROOT) {
    _workflowCache[module_code] = null;
    return null;
  }
  const path = join(TEMPLATES_ROOT, module_code, 'workflow.json');
  if (!existsSync(path)) {
    _workflowCache[module_code] = null;
    return null;
  }
  try {
    const workflow = JSON.parse(readFileSync(path, 'utf-8'));
    _workflowCache[module_code] = workflow;
    return workflow;
  } catch (e) {
    console.error(`[dispatcher] failed to parse workflow for ${module_code}: ${e.message}`);
    _workflowCache[module_code] = null;
    return null;
  }
}

export function _resetWorkflowCache() {
  for (const k of Object.keys(_workflowCache)) delete _workflowCache[k];
}

// -----------------------------------------------------------------------------
// Trigger matching
// -----------------------------------------------------------------------------

function conditionsMatch(conditions, payload) {
  if (!conditions || Object.keys(conditions).length === 0) return true;
  for (const [k, required] of Object.entries(conditions)) {
    const actual = payload ? payload[k] : undefined;
    if (Array.isArray(required)) {
      // "actual must be in required" semantics
      if (!required.includes(actual)) return false;
    } else if (typeof required === 'object' && required !== null) {
      // nested match — not used today, skipped
      return false;
    } else {
      if (actual !== required) return false;
    }
  }
  return true;
}

// Very small if-expression evaluator for workflow step guards of the form:
//   "settings.ack_channel in ['email', 'both']"
//   "settings.ack_channel in ['sms', 'both'] and payload.phone"
// Keep it narrow and safe. Anything unrecognized returns true (run the step)
// so workflow authors can't silently skip steps via typos.
function evalGuard(expr, ctx) {
  if (!expr) return true;
  try {
    const parts = String(expr).split(/\s+and\s+/i);
    for (const part of parts) {
      const trimmed = part.trim();
      const inMatch = trimmed.match(/^([\w.]+)\s+in\s+\[([^\]]+)\]$/);
      if (inMatch) {
        const value = resolveDottedPath(inMatch[1], ctx);
        const list = inMatch[2].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
        if (!list.includes(String(value))) return false;
        continue;
      }
      // bare path -> truthy check
      const value = resolveDottedPath(trimmed, ctx);
      if (!value) return false;
    }
    return true;
  } catch {
    return true;
  }
}

function resolveDottedPath(path, ctx) {
  const [root, ...rest] = path.split('.');
  let obj;
  if (root === 'settings') obj = ctx.settings;
  else if (root === 'payload') obj = ctx.trigger_event?.payload;
  else if (root === 'tenant') obj = ctx.tenant;
  else return undefined;
  for (const part of rest) {
    if (obj == null) return undefined;
    obj = obj[part];
  }
  return obj;
}

// -----------------------------------------------------------------------------
// Main dispatch function
// -----------------------------------------------------------------------------

export async function dispatchEvent(event) {
  const { tenant_id, event_type } = event;
  if (!tenant_id || !event_type) {
    return { dispatched: 0, results: [] };
  }

  const tenant = getTenant(tenant_id);
  if (!tenant) return { dispatched: 0, results: [] };

  const { modules } = getCatalog();
  const byCode = indexModules(modules);

  const entitlements = listTenantEntitlements(tenant_id);
  const active = entitlements.filter((e) => e.state === 'active');

  const results = [];
  for (const ent of active) {
    const module = byCode[ent.module_code];
    if (!module) continue;

    const trig = module.trigger || {};
    if (trig.event !== event_type) continue;
    if (!conditionsMatch(trig.conditions, event.payload)) continue;

    // Found a match — execute the workflow.
    const result = await executeWorkflow({ tenant, module, entitlement: ent, trigger_event: event });
    results.push(result);
  }

  return { dispatched: results.length, results };
}

// -----------------------------------------------------------------------------
// Workflow execution
// -----------------------------------------------------------------------------

async function executeWorkflow({ tenant, module, entitlement, trigger_event }) {
  const workflow = loadWorkflow(module.module_code);
  const run_id = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // If no workflow template exists, emit a no-op run so observability sees
  // the trigger fired. This is the "spec-only module" case.
  if (!workflow) {
    emit('module.run.skipped_no_workflow', {
      tenant_id: tenant.tenant_id,
      module_code: module.module_code,
      trigger_event_id: trigger_event.event_id,
      run_id,
    });
    return { run_id, module_code: module.module_code, status: 'skipped_no_workflow' };
  }

  emit(workflow.observability?.emit_on_start || 'module.run.started', {
    tenant_id: tenant.tenant_id,
    module_code: module.module_code,
    trigger_event_id: trigger_event.event_id,
    run_id,
  });

  const settings = entitlement.config_state || {};
  const ctx = { tenant, module, entitlement, trigger_event, settings, prior_steps: [] };

  try {
    for (const step of (workflow.actions || [])) {
      // Step-level guard
      if (step.if && !evalGuard(step.if, ctx)) {
        ctx.prior_steps.push({ step: step.step, action: step.action, status: 'skipped_guard' });
        continue;
      }

      if (!hasHandler(step.action)) {
        emit(workflow.observability?.emit_on_fail || 'module.run.failed', {
          tenant_id: tenant.tenant_id,
          module_code: module.module_code,
          run_id,
          reason: 'unknown_action',
          action: step.action,
        });
        return { run_id, module_code: module.module_code, status: 'failed', reason: 'unknown_action', action: step.action };
      }

      const stepCtx = { ...ctx, step };
      const outcome = await runAction(step.action, stepCtx);
      ctx.prior_steps.push({ step: step.step, action: step.action, outcome });

      if (outcome && outcome.skip) {
        // Skip rest of workflow (abort semantic via `on_skip: "abort"`)
        if (step.on_skip === 'abort') {
          emit('module.run.aborted', {
            tenant_id: tenant.tenant_id,
            module_code: module.module_code,
            run_id,
            at_step: step.step,
          });
          return { run_id, module_code: module.module_code, status: 'aborted', at_step: step.step };
        }
      }
    }

    emit(workflow.observability?.emit_on_complete || 'module.run.completed', {
      tenant_id: tenant.tenant_id,
      module_code: module.module_code,
      run_id,
      step_count: ctx.prior_steps.length,
    });
    return { run_id, module_code: module.module_code, status: 'completed', steps: ctx.prior_steps };
  } catch (err) {
    emit(workflow.observability?.emit_on_fail || 'module.run.failed', {
      tenant_id: tenant.tenant_id,
      module_code: module.module_code,
      run_id,
      reason: 'handler_threw',
      details: String(err.message || err),
    });
    return { run_id, module_code: module.module_code, status: 'failed', reason: 'handler_threw' };
  }
}

// -----------------------------------------------------------------------------
// Convenience for smoke tests + admin debug
// -----------------------------------------------------------------------------

export function _listWorkflows() {
  return Object.keys(_workflowCache);
}
