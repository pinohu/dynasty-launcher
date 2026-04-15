/**
 * `automation-deployer rollback --tenant <slug> [--automation <id> | --all]`
 */
import { loadTenant } from '../lib/tenant.mjs';
import { rollbackAutomation, rollbackTenant } from '../lib/rollback.mjs';

export default async function ({ args, root }) {
  const slug = args.tenant;
  if (!slug) {
    console.error('--tenant <slug> is required');
    return 1;
  }
  const tenant = await loadTenant(root, slug);
  if (args.all) {
    const result = await rollbackTenant(root, tenant);
    for (const r of result.results) {
      console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.id}${r.error ? ' ' + r.error : ''}`);
    }
    return result.ok ? 0 : 4;
  }
  if (!args.automation) {
    console.error('--automation <id> or --all is required');
    return 2;
  }
  await rollbackAutomation(root, tenant, args.automation);
  console.log(`Rolled back ${args.automation} on ${slug}`);
  return 0;
}
