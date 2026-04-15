/**
 * `automation-deployer init --tenant <slug>` — scaffold a new tenant.
 */
import { cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export default async function ({ args, root }) {
  const slug = args.tenant;
  if (!slug) {
    console.error('--tenant <slug> is required');
    return 1;
  }
  const dest = join(root, 'tenants', slug);
  if (existsSync(dest)) {
    console.error(`Tenant ${slug} already exists at ${dest}`);
    return 2;
  }
  const template = join(root, 'tenants', '_template');
  await cp(template, dest, { recursive: true });

  // Patch the tenant.yaml with the slug
  const { readFile, writeFile } = await import('node:fs/promises');
  const tenantFile = join(dest, 'tenant.yaml');
  const raw = await readFile(tenantFile, 'utf8');
  await writeFile(tenantFile, raw.replace(/slug:\s*<slug>/, `slug: ${slug}`));

  console.log(`Created tenant ${slug} at ${dest}`);
  console.log(`Next: edit ${tenantFile} then run:`);
  console.log(`  automation-deployer interview --tenant ${slug}`);
  return 0;
}
