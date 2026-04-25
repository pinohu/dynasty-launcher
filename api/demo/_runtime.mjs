import { emit, getEvents } from '../events/_bus.mjs';
import { dispatchEvent } from '../events/_dispatcher.mjs';
import { getCatalog, indexModules } from '../catalog/_lib.mjs';
import { activateModule, grantEntitlement } from '../tenants/_activation.mjs';
import { createTenant, getTenant, setTenantCapability } from '../tenants/_store.mjs';
import { provisionAllAutomations } from '../tenants/_provision.mjs';

const sessions = new Map();
const traces = new Map();

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCode(code) {
  return String(code || '').trim().replace(/-/g, '_');
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function samplePayloadFor(module) {
  const event = module?.trigger?.event || 'demo.requested';
  const base = {
    demo: true,
    name: 'Demo Customer',
    first_name: 'Demo',
    last_name: 'Customer',
    email: 'demo.customer@example.com',
    contact_email: 'demo.customer@example.com',
    customer_email: 'demo.customer@example.com',
    phone: '+15550101010',
    caller_phone: '+15550101010',
    contact_phone: '+15550101010',
    customer_phone: '+15550101010',
    job_id: 'job_demo_001',
    invoice_id: 'inv_demo_001',
    proposal_id: 'prop_demo_001',
    amount_due: 420,
    rating: 5,
    sentiment: 'positive',
    source: 'demo_sandbox',
  };
  if (event.includes('invoice')) base.days_overdue = 7;
  if (event.includes('call')) base.call_status = 'missed';
  if (event.includes('appointment')) base.appointment_at = new Date(Date.now() + 86400000).toISOString();
  if (event.includes('form') || event.includes('lead')) base.form_name = 'Estimate Request';
  if (event.includes('review')) base.review_url = 'https://example.com/review/demo';
  if (event.includes('report')) base.report_type = 'owner_digest';
  return base;
}

function collectUnitModules({ unit_type = 'module', unit_code }) {
  const catalog = getCatalog();
  const modulesByCode = indexModules(catalog.modules || []);
  const bundlesByCode = Object.fromEntries((catalog.bundles || []).map((b) => [normalizeCode(b.bundle_code), b]));
  const blueprintsByCode = Object.fromEntries((catalog.blueprints || []).map((b) => [normalizeCode(b.blueprint_code), b]));
  const suitesByCode = Object.fromEntries(((catalog.tiers?.suites) || []).map((s) => [normalizeCode(s.suite_code), s]));
  const editionsByCode = Object.fromEntries(((catalog.tiers?.editions) || []).map((e) => [normalizeCode(e.edition_code), e]));
  const tiersByCode = Object.fromEntries(((catalog.tiers?.tiers) || []).map((t) => [normalizeCode(t.tier_code), t]));
  const code = normalizeCode(unit_code);
  const out = new Set();
  const skipped = [];

  const addModule = (moduleCode, via) => {
    const normalized = normalizeCode(moduleCode);
    if (modulesByCode[normalized]) out.add(normalized);
    else skipped.push({ code: moduleCode, via, reason: 'module_not_found' });
  };
  const addBundle = (bundleCode, via = 'bundle') => {
    const bundle = bundlesByCode[normalizeCode(bundleCode)];
    if (!bundle) return skipped.push({ code: bundleCode, via, reason: 'bundle_not_found' });
    for (const moduleCode of bundle.modules || []) addModule(moduleCode, bundle.bundle_code);
  };
  const addSuite = (suiteCode, via = 'suite') => {
    const suite = suitesByCode[normalizeCode(suiteCode)];
    if (!suite) return skipped.push({ code: suiteCode, via, reason: 'suite_not_found' });
    for (const bundleCode of suite.packs || []) addBundle(bundleCode, suite.suite_code);
    for (const moduleCode of suite.extras || []) addModule(moduleCode, suite.suite_code);
  };

  if (unit_type === 'module') addModule(code, 'module');
  else if (unit_type === 'category') {
    for (const module of catalog.modules || []) {
      if (slug(module.category || 'uncategorized') === slug(unit_code) || normalizeCode(module.category) === code) {
        addModule(module.module_code, 'category');
      }
    }
  } else if (unit_type === 'pack' || unit_type === 'bundle') addBundle(code);
  else if (unit_type === 'blueprint') {
    const blueprint = blueprintsByCode[code];
    if (!blueprint) skipped.push({ code, via: 'blueprint', reason: 'blueprint_not_found' });
    else {
      for (const moduleCode of blueprint.recommended_modules || []) addModule(moduleCode, blueprint.blueprint_code);
      for (const bundleCode of blueprint.recommended_bundles || []) addBundle(bundleCode, blueprint.blueprint_code);
    }
  } else if (unit_type === 'suite') addSuite(code);
  else if (unit_type === 'edition') {
    const edition = editionsByCode[code];
    if (!edition) skipped.push({ code, via: 'edition', reason: 'edition_not_found' });
    else {
      const includes = edition.includes || {};
      if (includes.suites === 'all') Object.values(suitesByCode).forEach((suite) => addSuite(suite.suite_code, edition.edition_code));
      else for (const suiteCode of includes.suites || []) addSuite(suiteCode, edition.edition_code);
      if (includes.packs === 'all') Object.values(bundlesByCode).forEach((bundle) => addBundle(bundle.bundle_code, edition.edition_code));
      else for (const bundleCode of includes.packs || []) addBundle(bundleCode, edition.edition_code);
      const baseTier = tiersByCode[normalizeCode(includes.tier)];
      for (const moduleCode of baseTier?.included_modules || []) addModule(moduleCode, includes.tier);
    }
  } else if (unit_type === 'plan' || unit_type === 'tier') {
    const tier = tiersByCode[code];
    if (!tier) skipped.push({ code, via: 'tier', reason: 'tier_not_found' });
    else for (const moduleCode of tier.included_modules || []) addModule(moduleCode, tier.tier_code);
  } else {
    skipped.push({ code, via: unit_type, reason: 'unknown_unit_type' });
  }

  return {
    module_codes: [...out],
    modules: [...out].map((moduleCode) => modulesByCode[moduleCode]).filter(Boolean),
    skipped,
  };
}

export function resolveDemoUnit(input) {
  return collectUnitModules(input);
}

export async function createDemoSession({ unit_type = 'module', unit_code = null, blueprint_code = 'hvac' } = {}) {
  const tenant = await createTenant({
    business_name: 'Your Deputy Demo Sandbox',
    business_type: blueprint_code,
    blueprint_code,
    plan: 'enterprise',
    subscription_status: 'demo',
    onboarding_status: 'demo_ready',
    profile: { demo: true, unit_type, unit_code },
    capabilities_enabled: [],
  });
  const provisioning = await provisionAllAutomations({ tenant_id: tenant.tenant_id, blueprint_code });
  const session = {
    session_id: id('demo'),
    tenant_id: tenant.tenant_id,
    unit_type,
    unit_code,
    blueprint_code,
    created_at: new Date().toISOString(),
    provisioning,
  };
  sessions.set(session.session_id, session);
  emit('demo.session_created', { tenant_id: tenant.tenant_id, session_id: session.session_id, unit_type, unit_code });
  return session;
}

async function ensureSession(session_id, unit_type, unit_code) {
  if (session_id && sessions.has(session_id)) return sessions.get(session_id);
  return await createDemoSession({ unit_type, unit_code });
}

async function activateForDemo(tenant_id, module, modulesByCode = null, seen = new Set()) {
  if (seen.has(module.module_code)) return { activation: { status: 'idempotent_ok' }, capabilities_enabled: [] };
  seen.add(module.module_code);
  const catalog = getCatalog();
  const byCode = modulesByCode || indexModules(catalog.modules || []);
  for (const prereq of module.prerequisite_modules || []) {
    const prereqModule = byCode[prereq];
    if (prereqModule) await activateForDemo(tenant_id, prereqModule, byCode, seen);
  }
  await grantEntitlement({
    tenant_id,
    module_code: module.module_code,
    billing_source: { source_type: 'demo_sandbox', source_code: module.module_code },
  });
  const enabled = [];
  for (const capability of module.capabilities_required || []) {
    await setTenantCapability(tenant_id, capability, true);
    enabled.push(capability);
  }
  const activation = await activateModule({ tenant_id, module_code: module.module_code, user_input: { demo: true } });
  return { activation, capabilities_enabled: enabled };
}

function outputPreviewFor(module, dispatchResult, event) {
  const actions = (dispatchResult.steps || []).map((s) => s.action);
  const previews = [];
  if (actions.includes('send_sms')) {
    previews.push({ type: 'sms', title: 'Sandbox SMS', body: `Hi Demo Customer, ${module.name} handled your request. Reply HELP for support.` });
  }
  if (actions.includes('send_email')) {
    previews.push({ type: 'email', title: 'Sandbox Email', body: `Subject: Your Deputy: ${module.name}\n\nThis is the email preview generated by the demo workflow.` });
  }
  if (actions.includes('notify_owner')) {
    previews.push({ type: 'owner_alert', title: 'Owner Alert', body: `${module.name} completed for ${event.payload.email || event.payload.phone}.` });
  }
  if (actions.includes('log_outcome') || previews.length === 0) {
    previews.push({ type: 'activity_log', title: 'Activity Timeline', body: `${module.name} recorded a completed workflow run with ${dispatchResult.steps?.length || 0} step(s).` });
  }
  return previews;
}

export async function runDemoUnit({
  session_id = null,
  unit_type = 'module',
  unit_code,
  payload = null,
  limit = 12,
} = {}) {
  if (!unit_code) throw new Error('unit_code required');
  const session = await ensureSession(session_id, unit_type, unit_code);
  const tenant = await getTenant(session.tenant_id);
  const resolved = collectUnitModules({ unit_type, unit_code });
  const selected = resolved.modules.slice(0, Math.max(1, Number(limit) || 12));
  const runs = [];
  const since = new Date().toISOString();

  for (const module of selected) {
    const activation = await activateForDemo(session.tenant_id, module);
    const eventPayload = { ...samplePayloadFor(module), ...(payload || {}) };
    const event = emit(module.trigger?.event || 'demo.requested', {
      tenant_id: session.tenant_id,
      module_code: module.module_code,
      ...eventPayload,
    });
    const dispatch = await dispatchEvent(event);
    const result = dispatch.results.find((r) => r.module_code === module.module_code) || dispatch.results[0] || null;
    runs.push({
      module_code: module.module_code,
      module_name: module.name,
      trigger_event: event,
      activation,
      dispatch,
      workflow_result: result,
      output_preview: outputPreviewFor(module, result || { steps: [] }, event),
      trace_steps: [
        { label: 'demo.session', status: 'ok', detail: session.session_id },
        { label: 'tenant.loaded', status: tenant ? 'ok' : 'missing', detail: session.tenant_id },
        { label: 'entitlement.granted', status: activation.activation?.status ? 'ok' : 'unknown', detail: module.module_code },
        { label: 'capabilities.enabled', status: 'ok', detail: activation.capabilities_enabled },
        { label: 'module.activated', status: activation.activation?.status || 'unknown', detail: activation.activation?.reason || null },
        { label: 'event.emitted', status: 'ok', detail: event.event_type },
        { label: 'workflow.dispatched', status: result?.status || 'no_match', detail: result?.run_id || null },
        { label: 'output.previewed', status: 'ok', detail: `${outputPreviewFor(module, result || { steps: [] }, event).length} preview(s)` },
      ],
    });
  }

  const trace = {
    run_id: id('demorun'),
    session,
    unit_type,
    unit_code,
    resolved_module_count: resolved.module_codes.length,
    executed_module_count: runs.length,
    skipped: resolved.skipped,
    runs,
    bus_events: getEvents({ tenant_id: session.tenant_id, since, limit: 100 }),
    completed_at: new Date().toISOString(),
  };
  traces.set(trace.run_id, trace);
  emit('demo.unit_ran', {
    tenant_id: session.tenant_id,
    run_id: trace.run_id,
    unit_type,
    unit_code,
    executed_module_count: runs.length,
  });
  return trace;
}

export function getDemoSession(session_id) {
  return sessions.get(session_id) || null;
}

export function getDemoTrace(run_id) {
  return traces.get(run_id) || null;
}
