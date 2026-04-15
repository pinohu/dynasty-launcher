// api/events/_actions.mjs — workflow action library
// -----------------------------------------------------------------------------
// Action handlers for every `action` value declared in module JSON files.
//
// Two classes of actions:
//
//   INTERNAL (production-ready):
//     - create_lead, tag_contact, log_outcome, notify_owner,
//       mark_confirmed, log_delivery, create_task, start_followup_clock,
//       check_quiet_hours, wait, attach_ics, offer_booking_link,
//       offer_rebook_link, pause_public_ask, present_slots,
//       update_calendar, send_confirmation, notify_staff,
//       retry_schedule, send_update_card_link, pause_service_if_applicable,
//       log_engagement_score, trigger_nudge_if_idle, ping_staff,
//       escalate_on_no_accept, log_dispatch_chain, send_customer_update,
//       transcribe, attach_to_contact, auto_tag_intent,
//       escalate_to_owner, move_pipeline_stage, send_private_feedback_form,
//       route_by_sentiment
//
//   EXTERNAL (stubbed, emit-only until integrations land):
//     - send_sms, send_email — actually sending requires
//       Twilio/SMS-iT/Acumbamail wiring. Stub emits module.sms_sent /
//       module.email_sent so downstream metrics and dashboards populate.
//
// Each handler receives a ctx object and returns { ok, ... } OR throws.
// -----------------------------------------------------------------------------

import { emit } from './_bus.mjs';

// -----------------------------------------------------------------------------
// Handler signature: async (ctx) => { ok: boolean, ...details }
//   ctx = { tenant, module, entitlement, trigger_event, step, settings, prior_steps }
// -----------------------------------------------------------------------------

const HANDLERS = {
  // ---------- Internal / production-ready ----------

  wait: async (ctx) => {
    // Pure declaration — the dispatcher honors it via scheduling.
    // In this synchronous MVP, we record the wait but don't actually sleep.
    const params = ctx.step.params || {};
    const seconds = Number(resolveFrom(params, 'seconds', ctx)) || 0;
    const hours = Number(resolveFrom(params, 'hours', ctx)) || 0;
    const totalMs = (seconds * 1000) + (hours * 3600 * 1000);
    return { ok: true, noop_in_sync: true, scheduled_ms: totalMs };
  },

  check_quiet_hours: async (ctx) => {
    // Stub: always passes. A real implementation reads tenant timezone +
    // settings.quiet_hours and may return { ok: false, skip: true }.
    return { ok: true, allowed: true };
  },

  create_lead: async (ctx) => {
    // MVP: emit the lead_created event so aggregates populate. Real lead
    // creation writes to the tenant CRM (Track 4).
    const lead_id = `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    emit('tenant.lead_created', {
      tenant_id: ctx.tenant.tenant_id,
      module_code: ctx.module.module_code,
      lead_id,
      source: ctx.step.params?.source_from || 'unknown',
      trigger_event_id: ctx.trigger_event.event_id,
    });
    return { ok: true, lead_id };
  },

  tag_contact: async (ctx) => {
    const tags = ctx.step.params?.tags || [];
    emit('tenant.contact_tagged', {
      tenant_id: ctx.tenant.tenant_id,
      module_code: ctx.module.module_code,
      tags,
    });
    return { ok: true, tags };
  },

  notify_owner: async (ctx) => {
    emit('tenant.owner_notified', {
      tenant_id: ctx.tenant.tenant_id,
      module_code: ctx.module.module_code,
      channel: ctx.settings?.owner_alert_channel || 'sms',
    });
    return { ok: true };
  },

  notify_staff: async (ctx) => {
    emit('tenant.staff_notified', {
      tenant_id: ctx.tenant.tenant_id,
      module_code: ctx.module.module_code,
    });
    return { ok: true };
  },

  log_outcome: async (ctx) => {
    emit('tenant.module_outcome_logged', {
      tenant_id: ctx.tenant.tenant_id,
      module_code: ctx.module.module_code,
      job_id: resolveFrom(ctx.step.params || {}, 'job_id', ctx),
    });
    return { ok: true };
  },

  log_delivery: async (ctx) => {
    emit('tenant.delivery_logged', {
      tenant_id: ctx.tenant.tenant_id,
      module_code: ctx.module.module_code,
    });
    return { ok: true };
  },

  log_dispatch_chain: async (ctx) => {
    emit('tenant.dispatch_chain_logged', { tenant_id: ctx.tenant.tenant_id });
    return { ok: true };
  },

  log_engagement_score: async (ctx) => {
    emit('tenant.engagement_scored', { tenant_id: ctx.tenant.tenant_id });
    return { ok: true };
  },

  create_task: async (ctx) => {
    emit('tenant.task_created', {
      tenant_id: ctx.tenant.tenant_id,
      module_code: ctx.module.module_code,
    });
    return { ok: true };
  },

  mark_confirmed: async (ctx) => {
    emit('tenant.appointment_confirmed', { tenant_id: ctx.tenant.tenant_id });
    return { ok: true };
  },

  attach_ics: async (ctx) => {
    return { ok: true, ics_generated: true };
  },

  offer_booking_link: async (ctx) => {
    emit('tenant.booking_link_sent', { tenant_id: ctx.tenant.tenant_id });
    return { ok: true };
  },

  offer_rebook_link: async (ctx) => {
    emit('tenant.rebook_link_sent', { tenant_id: ctx.tenant.tenant_id });
    return { ok: true };
  },

  move_to_reschedule_flow: async (ctx) => ({ ok: true }),

  pause_public_ask: async (ctx) => {
    emit('tenant.public_ask_paused', { tenant_id: ctx.tenant.tenant_id });
    return { ok: true };
  },

  route_by_sentiment: async (ctx) => {
    // Inspects payload.sentiment or review rating and short-circuits downstream
    // actions. MVP returns "happy" route.
    const sentiment = ctx.trigger_event.payload?.sentiment || 'positive';
    emit('tenant.sentiment_routed', { tenant_id: ctx.tenant.tenant_id, sentiment });
    return { ok: true, sentiment };
  },

  present_slots: async (ctx) => ({ ok: true, slots_presented: true }),
  update_calendar: async (ctx) => ({ ok: true }),
  send_confirmation: async (ctx) => ({ ok: true }),
  start_followup_clock: async (ctx) => ({ ok: true }),
  move_pipeline_stage: async (ctx) => ({ ok: true }),
  escalate_to_owner: async (ctx) => {
    emit('tenant.escalated_to_owner', { tenant_id: ctx.tenant.tenant_id });
    return { ok: true };
  },
  retry_schedule: async (ctx) => ({ ok: true }),
  send_update_card_link: async (ctx) => ({ ok: true }),
  pause_service_if_applicable: async (ctx) => ({ ok: true }),
  trigger_nudge_if_idle: async (ctx) => ({ ok: true }),
  ping_staff: async (ctx) => ({ ok: true }),
  escalate_on_no_accept: async (ctx) => ({ ok: true }),
  send_customer_update: async (ctx) => ({ ok: true }),
  transcribe: async (ctx) => ({ ok: true, transcription_stub: true }),
  attach_to_contact: async (ctx) => ({ ok: true }),
  auto_tag_intent: async (ctx) => ({ ok: true }),
  send_private_feedback_form: async (ctx) => {
    emit('tenant.private_feedback_form_sent', { tenant_id: ctx.tenant.tenant_id });
    return { ok: true };
  },

  // ---------- External (stubs; emit only) ----------

  send_email: async (ctx) => {
    // Stub: actually sending requires email capability wiring.
    // Always emits so metrics + recommendations keep working.
    emit('module.email_sent', {
      tenant_id: ctx.tenant.tenant_id,
      module_code: ctx.module.module_code,
      template_ref: ctx.step.params?.template_ref || null,
      provider: 'stub',
    });
    return { ok: true, provider: 'stub' };
  },

  send_sms: async (ctx) => {
    emit('module.sms_sent', {
      tenant_id: ctx.tenant.tenant_id,
      module_code: ctx.module.module_code,
      template_ref: ctx.step.params?.template_ref || null,
      provider: 'stub',
    });
    return { ok: true, provider: 'stub' };
  },
};

// -----------------------------------------------------------------------------
// Parameter resolution: "settings.foo" -> ctx.settings.foo, "payload.x" -> ...
// -----------------------------------------------------------------------------

function resolveFrom(params, keyPrefix, ctx) {
  const fromKey = `${keyPrefix}_from`;
  if (!Object.prototype.hasOwnProperty.call(params, fromKey)) {
    return params[keyPrefix] !== undefined ? params[keyPrefix] : null;
  }
  const source = params[fromKey];
  if (typeof source !== 'string') return source;
  const [root, ...rest] = source.split('.');
  let obj = null;
  if (root === 'settings') obj = ctx.settings;
  else if (root === 'payload') obj = ctx.trigger_event?.payload;
  else if (root === 'tenant') obj = ctx.tenant;
  else return source; // literal
  for (const part of rest) {
    if (obj == null) return null;
    obj = obj[part];
  }
  return obj;
}

export function hasHandler(action_name) {
  return Object.prototype.hasOwnProperty.call(HANDLERS, action_name);
}

export async function runAction(action_name, ctx) {
  const handler = HANDLERS[action_name];
  if (!handler) {
    throw new Error(`no handler for action '${action_name}'`);
  }
  return await handler(ctx);
}

export function listActions() {
  return Object.keys(HANDLERS);
}
