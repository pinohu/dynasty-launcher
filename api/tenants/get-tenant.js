// api/tenants/get-tenant.js — GET /api/tenants/get-tenant?tenant_id=...
// -----------------------------------------------------------------------------
// Returns a single tenant record plus their active entitlements.
// -----------------------------------------------------------------------------

import { corsPreflight, methodGuard } from './_lib.mjs';
import { getTenant, listTenantEntitlements } from './_store.mjs';
import { requireTenantAccess } from './_auth.mjs';

export const maxDuration = 10;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['GET'])) return;

  const tenant_id = req.query?.tenant_id || req.query?.id;
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });

  const tenant = await getTenant(tenant_id);
  if (!tenant) return res.status(404).json({ error: `tenant '${tenant_id}' not found` });
  if (!requireTenantAccess(req, res, tenant)) return;

  return res.json({
    tenant,
    entitlements: await listTenantEntitlements(tenant_id),
  });
}
