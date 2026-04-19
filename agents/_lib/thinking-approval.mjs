// agents/_lib/thinking-approval.mjs
// Phase 4: intercepts <Thinking> blocks emitted by subagents (primarily
// code-generator) as an approval seam. When approval is required, the
// orchestrator halts the run pending human sign-off; when not, execution
// proceeds unchanged.
//
// Approval policy is configured per-tenant and per-subagent:
//   approvalPolicy = {
//     'code-generator': 'always' | 'on_first_write' | 'never',
//     'provisioner':    'never' | 'on_stripe_live' | 'always',
//   }
//
// 'on_first_write' — approve the first code-generator Thinking per run.
// 'on_stripe_live' — approve only if the provisioner touches live Stripe.
// 'never' — the default, same behavior as today.
//
// Enterprise / managed-launch tier sets this to 'always' for the key
// subagents. That's the human-in-the-loop premium product.
// -----------------------------------------------------------------------------

import { appendEvent, completeRun } from './event-stream.mjs';

const DEFAULT_POLICY = {
  'code-generator': 'never',
  'provisioner':    'never',
  'integrator':     'never',
  'deployer':       'never',
  'auditor':        'never',
};

// Called by the orchestrator or subagent when a Thinking block is emitted.
// Returns { requires_approval, approval_id?, reason? }.
// When requires_approval is true, the caller must pause and wait for
// resolveApproval() or the run is halted.
export async function onThinkingEmitted({ run_id, subagent, thinking, policy = {}, run_context = {} }) {
  const merged = { ...DEFAULT_POLICY, ...policy };
  const rule = merged[subagent] || 'never';

  const need = needsApproval(rule, subagent, thinking, run_context);
  if (!need) return { requires_approval: false };

  const approval_id = `appr_${run_id}_${Date.now()}`;

  appendEvent({
    run_id,
    iteration: run_context.iteration || 0,
    subagent,
    event_type: 'thinking_block',
    payload: { approval_id, rule, thinking },
    status: 'pending_approval',
  });

  return {
    requires_approval: true,
    approval_id,
    reason: `policy rule '${rule}' requires human sign-off before this subagent proceeds`,
  };
}

function needsApproval(rule, subagent, thinking, ctx) {
  if (rule === 'never')  return false;
  if (rule === 'always') return true;
  if (rule === 'on_first_write' && subagent === 'code-generator') {
    return !(ctx.code_generator_thinking_count && ctx.code_generator_thinking_count > 0);
  }
  if (rule === 'on_stripe_live' && subagent === 'provisioner') {
    return /stripe/i.test(thinking?.integration_plan || '') && !/test\s*mode/i.test(thinking?.integration_plan || '');
  }
  return false;
}

// Called by the admin UI / human operator when they approve or reject.
export async function resolveApproval({ run_id, approval_id, decision, reviewer, note }) {
  if (decision !== 'approve' && decision !== 'reject') {
    throw new Error("decision must be 'approve' or 'reject'");
  }
  appendEvent({
    run_id,
    iteration: 0,
    subagent: 'orchestrator',
    event_type: 'approval_resolution',
    payload: { approval_id, decision, reviewer, note },
    status: decision === 'approve' ? 'ok' : 'rejected',
  });
  if (decision === 'reject') {
    await completeRun({
      run_id,
      status: 'halted',
      halt_reason: 'approval_rejected',
      halt_context: { approval_id, reviewer, note },
    });
  }
  return { ok: true, decision };
}
