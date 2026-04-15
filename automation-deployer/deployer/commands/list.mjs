/**
 * `automation-deployer list [automations|categories|bundles|personas]`
 */
import { loadRegistry } from '../lib/registry.mjs';

export default async function ({ args, root }) {
  const what = args._[0] || 'automations';
  const reg = await loadRegistry(root);
  const filters = {
    category: args.category ? Number(args.category) : null,
    persona: args.persona || null,
    topology: args.topology || null,
  };

  if (what === 'automations') {
    let items = reg.automations;
    if (filters.category) items = items.filter((a) => a.category_id === filters.category);
    if (filters.topology) items = items.filter((a) => a.topology === filters.topology);
    if (filters.persona) items = items.filter((a) => (a.persona_fit || {})[filters.persona] > 0);
    console.log(`${items.length} automations`);
    for (const a of items) {
      console.log(`  ${a.id}  [${a.topology}]  ${a.title}`);
    }
  } else if (what === 'categories') {
    for (const c of reg.categories) {
      console.log(`  ${String(c.id).padStart(2)}. ${c.name}  (${c.automations.length})`);
    }
  } else if (what === 'bundles') {
    for (const b of reg.bundles) {
      console.log(`  ${b.key}  ${b.name}  (${b.automation_ids.length} automations)`);
    }
  } else if (what === 'personas') {
    for (const p of reg.personas) {
      console.log(`  ${p.key}  ${p.name}  ($${p.budget_usd_month.min}-${p.budget_usd_month.max}/mo)`);
    }
  } else {
    console.error(`Unknown: ${what}`);
    return 1;
  }
  return 0;
}
