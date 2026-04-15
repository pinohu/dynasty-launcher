/**
 * Interactive interview — asks the tenant 6 questions and computes a
 * persona fit + pain profile. Writes the selections to
 * `tenants/<slug>/selected-automations.yaml`.
 *
 * For non-interactive use (CI, API-driven), pass answers in via options.
 */
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { loadRegistry } from './registry.mjs';
import { selectForTenant } from './selector.mjs';
import { loadTenant, saveTenant, saveSelected } from './tenant.mjs';

const QUESTIONS = [
  { key: 'revenue_band', text: 'Revenue band?', options: ['under_100k', '100k-500k', '500k-2m', '2m-10m', '10m-50m', 'over_50m'] },
  { key: 'size', text: 'Team size?', options: ['solo', 'small_team', 'growth', 'franchise', 'agency'] },
  { key: 'primary_persona', text: 'Which persona best describes you?', options: null /* filled from registry */ },
  { key: 'top_goal', text: 'Top goal right now?', options: null },
  { key: 'top_pain', text: 'Top pain right now?', options: null },
  { key: 'budget_ceiling_usd_per_month', text: 'Monthly budget ceiling (USD)?', type: 'number' },
];

export async function runInterview(root, slug, options = {}) {
  const registry = await loadRegistry(root);
  let tenant;
  try {
    tenant = await loadTenant(root, slug);
  } catch (e) {
    throw new Error(`Run \`automation-deployer init --tenant ${slug}\` first.`);
  }

  const answers = options.answers ?? (await promptAllQuestions(registry));
  tenant = { ...tenant, ...answers };
  tenant.pains = answers.top_pain ? [answers.top_pain] : tenant.pains ?? [];
  tenant.goals = answers.top_goal ? [answers.top_goal] : tenant.goals ?? [];

  await saveTenant(root, slug, tenant);

  const { picks, runningCost } = await selectForTenant(root, tenant, { max: options.max ?? 20 });
  const selection = {
    automations: picks.map((p) => ({
      id: p.id,
      rationale: p.rationale,
    })),
    summary: {
      count: picks.length,
      estimated_monthly_usd: runningCost,
    },
  };
  await saveSelected(root, slug, selection);
  return { picks, runningCost, tenant };
}

async function promptAllQuestions(registry) {
  const rl = readline.createInterface({ input, output });
  try {
    const out = {};
    for (const q of QUESTIONS) {
      let opts = q.options;
      if (q.key === 'primary_persona') opts = registry.personas.map((p) => p.key);
      if (q.key === 'top_goal') opts = dedupe(registry.personas.flatMap((p) => p.top_goals || []));
      if (q.key === 'top_pain') opts = Object.keys(registry.selectionRules.pain_to_category || {});
      const a = await askOne(rl, q, opts);
      if (q.type === 'number') out[q.key] = Number(a);
      else out[q.key] = a;
    }
    return out;
  } finally {
    rl.close();
  }
}

async function askOne(rl, q, opts) {
  while (true) {
    let prompt = q.text;
    if (opts && opts.length) prompt += `\n  options: ${opts.slice(0, 12).join(', ')}${opts.length > 12 ? ', ...' : ''}`;
    prompt += '\n> ';
    const a = (await rl.question(prompt)).trim();
    if (!opts) return a;
    if (opts.includes(a)) return a;
    console.log('  (not a valid option; try again)');
  }
}

function dedupe(arr) {
  return Array.from(new Set(arr));
}
