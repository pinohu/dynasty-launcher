/**
 * Basic sanity tests for the registry. Run with `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRegistry } from '../deployer/lib/registry.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('registry loads without error', async () => {
  const reg = await loadRegistry(ROOT);
  assert.ok(reg.automations.length > 0, 'expected automations');
  assert.ok(reg.categories.length === 45, '45 categories');
  assert.ok(reg.personas.length === 10, '10 group-1 personas');
});

test('every automation has a category_id in [1, 45]', async () => {
  const reg = await loadRegistry(ROOT);
  for (const a of reg.automations) {
    assert.ok(a.category_id >= 1 && a.category_id <= 45, `bad category for ${a.id}: ${a.category_id}`);
  }
});

test('every automation id is unique', async () => {
  const reg = await loadRegistry(ROOT);
  const seen = new Set();
  for (const a of reg.automations) {
    assert.ok(!seen.has(a.id), `duplicate id: ${a.id}`);
    seen.add(a.id);
  }
});

test('every automation topology is T1..T5', async () => {
  const reg = await loadRegistry(ROOT);
  const valid = new Set(['T1', 'T2', 'T3', 'T4', 'T5']);
  for (const a of reg.automations) {
    assert.ok(valid.has(a.topology), `bad topology for ${a.id}: ${a.topology}`);
  }
});

test('bundles reference known automations', async () => {
  const reg = await loadRegistry(ROOT);
  const known = new Set(reg.automations.map((a) => a.id));
  for (const b of reg.bundles) {
    for (const id of b.automation_ids) {
      assert.ok(known.has(id), `bundle ${b.key} references unknown ${id}`);
    }
  }
});

test('depends_on references known automations', async () => {
  const reg = await loadRegistry(ROOT);
  const known = new Set(reg.automations.map((a) => a.id));
  for (const [a, deps] of Object.entries(reg.relationships.depends_on || {})) {
    assert.ok(known.has(a), `depends_on: unknown source ${a}`);
    for (const d of deps) assert.ok(known.has(d), `depends_on of ${a}: unknown ${d}`);
  }
});
