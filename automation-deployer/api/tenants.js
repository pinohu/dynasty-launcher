/**
 * GET  /api/tenants             → list tenants
 * GET  /api/tenants?slug=<slug> → tenant details + deployed automations
 */
import { listTenants, loadTenant, loadDeployed } from '../deployer/lib/tenant.mjs';
import { requireAuth } from './_auth.mjs';

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  const root = process.cwd();
  try {
    if (req.query?.slug) {
      const tenant = await loadTenant(root, req.query.slug);
      const deployed = await loadDeployed(root, req.query.slug);
      res.status(200).json({ tenant, deployed });
      return;
    }
    const slugs = await listTenants(root);
    res.status(200).json({ tenants: slugs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
