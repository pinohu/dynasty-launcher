/**
 * Selector tests — ranking and filtering.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectForTenant } from '../deployer/lib/selector.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('selector returns non-empty picks for Compliance Carol', async () => {
  const tenant = {
    slug: 'test',
    primary_persona: 'compliance_carol',
    size: 'small_team',
    pains: ['audit_scrambles', 'spreadsheet_errors'],
    budget_ceiling_usd_per_month: 500,
    infra: {
      github: { owner: 'x' },
      n8n: { base_url: 'https://n8n.test' },
      email_vendor: 'emailit',
    },
  };
  const { picks } = await selectForTenant(ROOT, tenant, { max: 10 });
  assert.ok(picks.length > 0);
  // Should prioritize category 20
  assert.ok(picks.some((p) => p.category_id === 20), 'expected category 20 in top picks');
});

test('selector enforces budget ceiling', async () => {
  const tenant = {
    slug: 'test-tight',
    primary_persona: 'solo_steve',
    size: 'solo',
    budget_ceiling_usd_per_month: 30,
    infra: { github: { owner: 'x' } },
  };
  const { picks, runningCost } = await selectForTenant(ROOT, tenant, { max: 20 });
  assert.ok(runningCost <= 30, `running cost ${runningCost} must be <= 30`);
  // solo rule caps at 5 automations
  assert.ok(picks.length <= 5, `expected ≤5 for solo size, got ${picks.length}`);
});
