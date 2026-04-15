/**
 * `automation-deployer plan --tenant <slug>` — build & write a deployment plan.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadTenant, loadSelected, tenantPath } from '../lib/tenant.mjs';
import { buildPlan } from '../lib/planner.mjs';

export default async function ({ args, root }) {
  const slug = args.tenant;
  if (!slug) {
    console.error('--tenant <slug> is required');
    return 1;
  }
  const tenant = await loadTenant(root, slug);
  const selection = await loadSelected(root, slug);
  if (!selection.automations || selection.automations.length === 0) {
    console.error(`No selected automations. Run: automation-deployer interview --tenant ${slug}`);
    return 2;
  }
  const mode = args.mode || 'deploy';
  const plan = await buildPlan(root, tenant, selection, { mode });

  const out = tenantPath(root, slug, 'plan.json');
  await writeFile(out, JSON.stringify(plan, null, 2));
  console.log(`\nPlan: ${plan.summary}`);
  for (const w of plan.waves) {
    console.log(`\n  Wave ${w.wave_index} (${w.automations.length}):`);
    for (const a of w.automations) {
      console.log(`    ${a.id}  status=${a.status}  drivers=${a.drivers.join('+')}  ~$${a.estimated_cost_monthly_usd}/mo`);
      if (a.blocked_reason) console.log(`      ! ${a.blocked_reason}`);
    }
  }
  if (plan.credential_gap.length > 0) {
    console.log('\n  Missing credentials:');
    for (const c of plan.credential_gap) console.log(`    - ${c.key} (needed by ${c.required_by.join(', ')})`);
  }
  console.log(`\nPlan written to ${out}`);
  if (mode === 'deploy' && plan.waves.every((w) => w.automations.every((a) => a.status === 'ready'))) {
    console.log(`Next: automation-deployer deploy --tenant ${slug}`);
  }
  return 0;
}
