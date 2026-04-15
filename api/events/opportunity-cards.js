// api/events/opportunity-cards.js — GET /api/events/opportunity-cards?tenant_id=...
// -----------------------------------------------------------------------------
// Evaluates product/recommendations/*.json against a tenant's event-derived
// metrics and returns the matching cards the UI should surface on the
// dashboard.
//
// Per docs/architecture/MARKETPLACE_AND_UPSELL_LOGIC.md:
//   - return max 3 cards
//   - sort by priority (descending)
//   - honor cooldown_days (UI tracks dismissals separately; MVP returns all)
//
// Rule evaluation per rule:
//   1. compute signal metric via _aggregates.mjs
//   2. apply operator vs threshold
//   3. check conditions: module_inactive, capability_present/absent, blueprint_in
//   4. if all pass, emit a card with interpolated headline
// -----------------------------------------------------------------------------

import { corsPreflight, methodGuard } from './_lib.mjs';
import { getTenant, getEntitlement } from '../tenants/_store.mjs';
import { getCatalog } from '../catalog/_lib.mjs';
import { computeMetric } from './_aggregates.mjs';

export const maxDuration = 15;

const MAX_CARDS = 3;

function compare(value, operator, threshold) {
  switch (operator) {
    case '>=': return value >= threshold;
    case '>': return value > threshold;
    case '<=': return value <= threshold;
    case '<': return value < threshold;
    case '==': return value === threshold;
    case '!=': return value !== threshold;
    default: return false;
  }
}

function interpolate(template, values) {
  if (!template) return '';
  return String(template).replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, key) => {
    const v = values[key.trim()];
    return v === undefined || v === null ? '' : String(v);
  });
}

function moduleInactive(tenant_id, module_code) {
  const ent = getEntitlement(tenant_id, module_code);
  return !ent || ent.state !== 'active';
}

function evaluateRule(rule, tenant) {
  const sig = rule.signal || {};
  const value = computeMetric(tenant.tenant_id, sig.metric, sig.window_days);
  if (value === null) {
    // Unknown metric: skip rule rather than mismatch on silent zero.
    return { matches: false, reason: 'metric_unsupported' };
  }
  if (!compare(value, sig.operator, sig.threshold)) {
    return { matches: false, reason: 'threshold_not_met', value };
  }

  const cond = rule.conditions || {};

  // Every named module_inactive must actually be inactive
  for (const code of (cond.module_inactive || [])) {
    if (!moduleInactive(tenant.tenant_id, code)) {
      return { matches: false, reason: 'module_already_active', module: code };
    }
  }

  // capability_present: tenant must have all listed capabilities
  const tenantCaps = new Set(tenant.capabilities_enabled || []);
  for (const cap of (cond.capability_present || [])) {
    if (!tenantCaps.has(cap)) return { matches: false, reason: 'capability_missing', capability: cap };
  }
  // capability_absent: tenant must not have any of the listed capabilities
  for (const cap of (cond.capability_absent || [])) {
    if (tenantCaps.has(cap)) return { matches: false, reason: 'capability_present', capability: cap };
  }

  // blueprint_in: tenant's blueprint_installed must be in the list
  if (Array.isArray(cond.blueprint_in) && cond.blueprint_in.length > 0) {
    if (!cond.blueprint_in.includes(tenant.blueprint_installed)) {
      return { matches: false, reason: 'blueprint_mismatch' };
    }
  }

  return { matches: true, value };
}

function buildCard(rule, value) {
  const values = {
    'signal.value': value,
    'signal.value_pct': typeof value === 'number' && value <= 1 ? (value * 100).toFixed(0) : value,
  };
  return {
    rule_code: rule.rule_code,
    headline: interpolate(rule.headline, values),
    body: interpolate(rule.body, values),
    cta_label: rule.cta_label || 'Activate',
    module_recommended: rule.module_recommended || null,
    bundle_recommended: rule.bundle_recommended || null,
    priority: rule.priority ?? 0,
    metric_value: value,
    cooldown_days: rule.cooldown_days ?? 14,
  };
}

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['GET'])) return;

  const tenant_id = req.query?.tenant_id || req.query?.id;
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });

  const tenant = getTenant(tenant_id);
  if (!tenant) return res.status(404).json({ error: 'tenant_not_found' });

  const { recommendations } = getCatalog();

  const matches = [];
  const misses = [];
  for (const rule of recommendations) {
    const r = evaluateRule(rule, tenant);
    if (r.matches) {
      matches.push(buildCard(rule, r.value));
    } else {
      misses.push({ rule_code: rule.rule_code, reason: r.reason, ...r });
    }
  }

  matches.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const show_all = req.query?.all === 'true' || req.query?.all === '1';
  const cards = show_all ? matches : matches.slice(0, MAX_CARDS);

  res.setHeader('Cache-Control', 'private, no-cache');
  return res.json({
    tenant_id,
    count: cards.length,
    total_matches: matches.length,
    total_rules: recommendations.length,
    cards,
    ...(show_all ? { misses } : {}),
  });
}
