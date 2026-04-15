/**
 * `automation-deployer deploy --tenant <slug>` — execute the plan.
 */
import { readFile } from 'node:fs/promises';
import { loadTenant, tenantPath } from '../lib/tenant.mjs';
import { executePlan } from '../lib/provisioner.mjs';

export default async function ({ args, root }) {
  const slug = args.tenant;
  if (!slug) {
    console.error('--tenant <slug> is required');
    return 1;
  }
  const tenant = await loadTenant(root, slug);
  const planPath = tenantPath(root, slug, 'plan.json');
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  const options = {
    continueOnError: Boolean(args['continue-on-error']),
    dryRun: Boolean(args['dry-run']),
  };
  console.log(`Deploying ${plan.total_automations} automations across ${plan.waves.length} waves...`);
  const result = await executePlan(root, tenant, plan, options);
  console.log(`Deploy complete: ${result.deployed_count} automations active.`);
  console.log(`Next: automation-deployer verify --tenant ${slug}`);
  return 0;
}
