/**
 * Registry loader. Reads automations, categories, personas, stacks, bundles,
 * relationships, selection rules from registry/*.json.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

let cache = null;

export async function loadRegistry(root) {
  if (cache) return cache;
  const dir = join(root, 'registry');
  const [automations, categories, personas, stacks, bundles, relationships, selectionRules] =
    await Promise.all([
      readJson(join(dir, 'automations.json')),
      readJson(join(dir, 'categories.json')),
      readJson(join(dir, 'personas.json')),
      readJson(join(dir, 'stacks.json')),
      readJson(join(dir, 'bundles.json')),
      readJson(join(dir, 'relationships.json')),
      readJson(join(dir, 'selection-rules.json')),
    ]);
  const byId = new Map(automations.map((a) => [a.id, a]));
  cache = { automations, categories, personas, stacks, bundles, relationships, selectionRules, byId };
  return cache;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function findAutomation(registry, id) {
  return registry.byId.get(id);
}

export function automationsByCategory(registry, categoryId) {
  return registry.automations.filter((a) => a.category_id === categoryId);
}
