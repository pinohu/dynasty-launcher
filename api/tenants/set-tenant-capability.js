// api/tenants/set-tenant-capability.js — POST /api/tenants/set-tenant-capability
// -----------------------------------------------------------------------------
// Admin/test utility: flips a capability on or off for a tenant without running
// the full setup wizard. Used by smoke tests and operator hotfixes.
//
// Production path is the guided-setup wizard, not this endpoint. This endpoint
// is admin-gated.
//
// Body: { tenant_id, capability_code, enabled }
// -----------------------------------------------------------------------------

import { corsPreflight, methodGuard, readBody, adminOnly } from './_lib.mjs';
import { setTenantCapability, getTenant } from './_store.mjs';
import { getCatalog } from '../catalog/_lib.mjs';

export const maxDuration = 10;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;
  if (!adminOnly(req, res)) return;

  let body;
  try { body = await readBody(req); } catch (e) {
    return res.status(400).json({ error: 'invalid_json' });
  }
  const { tenant_id, capability_code, enabled } = body || {};
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });
  if (!capability_code) return res.status(400).json({ error: 'capability_code required' });
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) required' });

  if (!getTenant(tenant_id)) return res.status(404).json({ error: `tenant '${tenant_id}' not found` });

  // Validate the capability_code actually exists
  const known = getCatalog().capabilities.find((c) => c.capability_code === capability_code);
  if (!known) return res.status(400).json({ error: `unknown capability '${capability_code}'` });

  const tenant = setTenantCapability(tenant_id, capability_code, enabled);
  return res.json({ tenant });
}
