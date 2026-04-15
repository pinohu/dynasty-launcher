/**
 * Planner tests — dependency resolution, wave ordering.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../deployer/lib/planner.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const EXAMPLE_TENANT = {
  slug: 'test-tenant',
  business_name: 'Test',
  infra: {
    github: { owner: 'test', default_repo: 'test' },
  },
  secrets: {},
  max_parallel_deploys: 4,
};

test('plan resolves transitive depends_on', async () => {
  const selection = { automations: [{ id: '3.01' }] };
  const plan = await buildPlan(ROOT, EXAMPLE_TENANT, selection);
  // 3.01 depends on 2.01 — should include both
  const allIds = plan.waves.flatMap((w) => w.automations.map((a) => a.id));
  assert.ok(allIds.includes('3.01'));
  assert.ok(allIds.includes('2.01'));
});

test('plan orders dependencies before dependents', async () => {
  const selection = { automations: [{ id: '8.01' }, { id: '15.01' }] };
  const plan = await buildPlan(ROOT, EXAMPLE_TENANT, selection);
  const waveIndex = {};
  for (const w of plan.waves) {
    for (const a of w.automations) waveIndex[a.id] = w.wave_index;
  }
  // 8.01 depends on 2.01 + 15.01
  assert.ok(waveIndex['2.01'] < waveIndex['8.01'], '2.01 before 8.01');
  assert.ok(waveIndex['15.01'] < waveIndex['8.01'], '15.01 before 8.01');
});

test('plan detects conflicts', async () => {
  // 1.06 conflicts with 1.07 per registry/relationships.json
  const selection = { automations: [{ id: '1.06' }, { id: '1.07' }] };
  await assert.rejects(() => buildPlan(ROOT, EXAMPLE_TENANT, selection), /Conflicts/);
});
