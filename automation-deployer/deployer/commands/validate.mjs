/**
 * `automation-deployer validate` — cross-check registry, schemas, manifests.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import { loadRegistry } from '../lib/registry.mjs';
import { validateManifest } from '../lib/manifest.mjs';

export default async function ({ root }) {
  const reg = await loadRegistry(root);
  const knownIds = new Set(reg.automations.map((a) => a.id));
  const errors = [];

  // bundles reference real automations
  for (const b of reg.bundles) {
    for (const id of b.automation_ids) {
      if (!knownIds.has(id)) errors.push(`bundle ${b.key}: unknown automation ${id}`);
    }
  }
  // relationships reference real automations
  for (const [a, deps] of Object.entries(reg.relationships.depends_on || {})) {
    if (!knownIds.has(a)) errors.push(`depends_on: unknown ${a}`);
    for (const d of deps) if (!knownIds.has(d)) errors.push(`depends_on of ${a}: unknown ${d}`);
  }
  // manifests, if any, parse and validate
  const manifestDir = join(root, 'manifests');
  let manifestFiles = [];
  try {
    manifestFiles = (await readdir(manifestDir)).filter((f) => f.endsWith('.yaml'));
  } catch {}
  for (const f of manifestFiles) {
    if (f.startsWith('_')) continue;
    const raw = await readFile(join(manifestDir, f), 'utf8');
    try {
      const m = YAML.parse(raw);
      const errs = validateManifest(m);
      for (const e of errs) errors.push(`${f}: ${e}`);
      if (m.id && !knownIds.has(m.id)) errors.push(`${f}: id ${m.id} not in automations.json`);
    } catch (e) {
      errors.push(`${f}: parse error ${e.message}`);
    }
  }

  if (errors.length > 0) {
    console.error(`FAIL (${errors.length})`);
    for (const e of errors) console.error('  - ' + e);
    return 1;
  }
  console.log(`OK — ${reg.automations.length} automations, ${reg.categories.length} categories, ${reg.bundles.length} bundles, ${manifestFiles.filter((f) => !f.startsWith('_')).length} manifests validated.`);
  return 0;
}
