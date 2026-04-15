/**
 * POST /api/provision
 *
 * Body:
 *   { "tenant": "acme-plumbing", "mode": "plan" | "deploy", "continueOnError": false }
 *
 * Runs a plan or deploy for the named tenant. Returns the plan (or deploy result)
 * as JSON. Intended for dashboard-driven orchestration.
 */
import { loadTenant, loadSelected } from '../deployer/lib/tenant.mjs';
import { buildPlan } from '../deployer/lib/planner.mjs';
import { executePlan } from '../deployer/lib/provisioner.mjs';
import { requireAuth } from './_auth.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  if (!requireAuth(req, res)) return;
  const { tenant: slug, mode = 'plan', continueOnError = false } = req.body || {};
  if (!slug) {
    res.status(400).json({ error: 'tenant slug required' });
    return;
  }
  const root = process.cwd();
  try {
    const tenant = await loadTenant(root, slug);
    const selection = await loadSelected(root, slug);
    const plan = await buildPlan(root, tenant, selection, { mode });
    if (mode === 'plan') {
      res.status(200).json({ plan });
      return;
    }
    if (mode === 'deploy') {
      const result = await executePlan(root, tenant, plan, { continueOnError });
      res.status(200).json({ plan, result });
      return;
    }
    res.status(400).json({ error: `unknown mode ${mode}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
