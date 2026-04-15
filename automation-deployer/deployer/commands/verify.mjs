/**
 * `automation-deployer verify --tenant <slug>` — run health checks.
 */
import { writeFile } from 'node:fs/promises';
import { loadTenant, tenantPath } from '../lib/tenant.mjs';
import { verifyTenant } from '../lib/verifier.mjs';

export default async function ({ args, root }) {
  const slug = args.tenant;
  if (!slug) {
    console.error('--tenant <slug> is required');
    return 1;
  }
  const tenant = await loadTenant(root, slug);
  const result = await verifyTenant(root, tenant);
  const out = tenantPath(root, slug, 'status.json');
  await writeFile(out, JSON.stringify(result, null, 2));
  for (const r of result.results) {
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.id}`);
    if (!r.ok && r.signals) console.log(`     ${JSON.stringify(r.signals)}`);
  }
  console.log(`\nStatus: ${result.ok ? 'ALL_OK' : 'SOME_FAILED'} — written to ${out}`);
  return result.ok ? 0 : 3;
}
