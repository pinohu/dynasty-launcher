// api/tenants/get-tenant-capabilities.js — GET /api/tenants/get-tenant-capabilities
// -----------------------------------------------------------------------------
// Returns the tenant's enabled capabilities plus, for each one, whether it
// satisfies what any of the 20 modules need. This is the endpoint the UI calls
// to decide "can this module activate right now?"
//
// Query: ?tenant_id=<id>
// Response:
//   {
//     tenant_id,
//     capabilities_enabled: [...],
//     all_capabilities: [
//       { capability_code, enabled, required_by: [module_codes], ... }
//     ]
//   }
// -----------------------------------------------------------------------------

import { corsPreflight, methodGuard, adminOnly } from './_lib.mjs';
import { getTenant } from './_store.mjs';
import { getCatalog } from '../catalog/_lib.mjs';

export const maxDuration = 10;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['GET'])) return;
  if (!adminOnly(req, res)) return;

  const tenant_id = req.query?.tenant_id || req.query?.id;
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });

  const tenant = await getTenant(tenant_id);
  if (!tenant) return res.status(404).json({ error: `tenant '${tenant_id}' not found` });

  const { capabilities, modules } = getCatalog();
  const enabled = new Set(tenant.capabilities_enabled || []);

  // Build reverse index: capability_code -> [module_code, ...]
  const requiredBy = {};
  for (const m of modules) {
    for (const cap of (m.capabilities_required || [])) {
      if (!requiredBy[cap]) requiredBy[cap] = [];
      requiredBy[cap].push(m.module_code);
    }
  }

  const all = capabilities.map((c) => ({
    capability_code: c.capability_code,
    name: c.name,
    category: c.category,
    requires_integration: c.requires_integration,
    setup_wizard_id: c.setup_wizard_id || null,
    enabled: enabled.has(c.capability_code),
    required_by: requiredBy[c.capability_code] || [],
  }));

  return res.json({
    tenant_id,
    capabilities_enabled: [...enabled],
    all_capabilities: all,
  });
}
