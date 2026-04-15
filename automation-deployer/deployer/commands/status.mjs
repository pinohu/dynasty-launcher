/**
 * `automation-deployer status --tenant <slug>` — show deployed automations.
 */
import { loadDeployed, loadTenant } from '../lib/tenant.mjs';

export default async function ({ args, root }) {
  const slug = args.tenant;
  if (!slug) {
    console.error('--tenant <slug> is required');
    return 1;
  }
  const tenant = await loadTenant(root, slug);
  const deployed = await loadDeployed(root, slug);
  console.log(`Tenant: ${tenant.business_name} (${slug})`);
  console.log(`Deployed automations: ${deployed.automations.length}`);
  for (const a of deployed.automations) {
    console.log(`  ${a.id}  v${a.manifest_version}  drivers=${(a.drivers || []).join('+')}  deployed_at=${a.deployed_at}`);
  }
  return 0;
}
