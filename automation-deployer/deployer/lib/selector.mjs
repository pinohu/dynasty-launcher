/**
 * Autonomous selector — ranks automations by fit against a tenant's persona,
 * pains, stack, and budget. Produces a candidate list for confirmation.
 *
 * Inputs: tenant + registry.
 * Output: ordered array of { id, score, rationale, estimated_cost_monthly_usd }.
 */
import { loadRegistry } from './registry.mjs';

export async function selectForTenant(root, tenant, options = {}) {
  const registry = await loadRegistry(root);
  const rules = registry.selectionRules;

  const personas = [
    { key: tenant.primary_persona, weight: 1.0 },
    ...(tenant.secondary_personas || []).map((p) => ({ key: p, weight: 0.4 })),
  ].filter((p) => p.key);

  const personaSet = new Set(personas.map((p) => p.key));
  const pains = new Set(tenant.pains || []);
  const tenantStack = collectTenantStack(tenant);

  const includeCats = new Set();
  const preferCats = new Set();
  let maxAutomations = options.max ?? 60;

  for (const rule of rules.hard_rules || []) {
    if (ruleMatches(rule.if, tenant, personaSet)) {
      (rule.then.include_categories || []).forEach((c) => includeCats.add(c));
      (rule.then.prefer_categories || []).forEach((c) => preferCats.add(c));
      if (rule.then.max_automations) maxAutomations = Math.min(maxAutomations, rule.then.max_automations);
    }
  }

  const painCategories = new Set();
  for (const p of pains) {
    (rules.pain_to_category?.[p] || []).forEach((c) => painCategories.add(c));
  }

  const scored = [];
  for (const a of registry.automations) {
    const personaMatch = scorePersonaFit(a, personas, registry.personas);
    const painMatch = painCategories.has(a.category_id) ? 1 : 0;
    const stackCompat = scoreStackCompat(a, tenantStack);
    const includeBoost = includeCats.has(a.category_id) ? 0.3 : preferCats.has(a.category_id) ? 0.15 : 0;
    const score =
      (rules.persona_category_weight ?? 0.5) * personaMatch +
      (rules.pain_match_weight ?? 0.3) * painMatch +
      (rules.stack_compat_weight ?? 0.2) * stackCompat +
      includeBoost;
    if (stackCompat < (rules.minimum_stack_compat ?? 0.5) && includeBoost === 0) continue;
    scored.push({
      id: a.id,
      title: a.title,
      category_id: a.category_id,
      category: a.category,
      score: Number(score.toFixed(3)),
      rationale: buildRationale({ a, personaMatch, painMatch, stackCompat, includeBoost }),
      estimated_cost_monthly_usd: estimateMonthlyCost(a),
    });
  }

  scored.sort((x, y) => y.score - x.score);
  const picked = [];
  const budgetCeiling = tenant.budget_ceiling_usd_per_month ?? Infinity;
  let runningCost = 0;

  for (const entry of scored) {
    if (picked.length >= maxAutomations) break;
    if (runningCost + entry.estimated_cost_monthly_usd > budgetCeiling) continue;
    picked.push(entry);
    runningCost += entry.estimated_cost_monthly_usd;
  }
  return { picks: picked, runningCost, considered: scored.length };
}

function ruleMatches(condition, tenant, personaSet) {
  if (condition.persona && !personaSet.has(condition.persona)) return false;
  if (condition.size && tenant.size !== condition.size) return false;
  if (condition.industry && tenant.industry !== condition.industry) return false;
  return true;
}

function scorePersonaFit(automation, personas, personaDefs) {
  let score = 0;
  let totalWeight = 0;
  for (const p of personas) {
    totalWeight += p.weight;
    const fit = automation.persona_fit?.[p.key] ?? 0;
    score += p.weight * fit;
  }
  return totalWeight > 0 ? score / totalWeight : 0;
}

function scoreStackCompat(automation, tenantStack) {
  if (!automation.stack || automation.stack.length === 0) return 1;
  const essentials = automation.stack.filter((s) => !['scraper', 'slack', 'telegram'].includes(s));
  if (essentials.length === 0) return 1;
  const have = essentials.filter((s) => tenantStack.has(s) || isAlwaysAvailable(s)).length;
  return have / essentials.length;
}

function isAlwaysAvailable(stackId) {
  return ['n8n', 'vercel', 'github', 'google_api'].includes(stackId);
}

function collectTenantStack(tenant) {
  const set = new Set();
  const infra = tenant.infra || {};
  if (infra.crm_vendor && infra.crm_vendor !== 'none') set.add(infra.crm_vendor);
  if (infra.payment_vendor && infra.payment_vendor !== 'none') set.add(infra.payment_vendor);
  if (infra.email_vendor && infra.email_vendor !== 'none') set.add(infra.email_vendor);
  if (infra.sms_vendor && infra.sms_vendor !== 'none') set.add(infra.sms_vendor);
  if (infra.voice_vendor && infra.voice_vendor !== 'none') set.add(infra.voice_vendor);
  if (infra.n8n?.base_url) set.add('n8n');
  if (infra.vercel?.team_id) set.add('vercel');
  if (infra.github?.owner) set.add('github');
  (infra.llm_vendors || []).forEach((v) => set.add(v));
  return set;
}

function estimateMonthlyCost(automation) {
  let cost = 9; // base service fee
  if (automation.estimated_monthly_tokens > 0) {
    // Conservative LLM cost: $0.001 per 1K tokens mixed
    cost += (automation.estimated_monthly_tokens / 1000) * 0.001 * 1000; // just tokens*.001
  }
  if (automation.topology === 'T5') cost += 5; // worker runtime
  if (automation.topology === 'T3') cost += 3; // hybrid premium
  return Math.round(cost * 100) / 100;
}

function buildRationale({ a, personaMatch, painMatch, stackCompat, includeBoost }) {
  const parts = [];
  if (personaMatch > 0.5) parts.push(`strong persona fit (${personaMatch.toFixed(2)})`);
  if (painMatch > 0) parts.push('addresses declared pain');
  if (stackCompat >= 0.8) parts.push('stack-ready');
  else if (stackCompat >= 0.5) parts.push('partial stack');
  if (includeBoost > 0) parts.push('hard-rule include');
  if (parts.length === 0) parts.push('weak match');
  return `${a.category} — ${parts.join(', ')}`;
}
