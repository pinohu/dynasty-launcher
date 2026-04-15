// api/tenants/deactivate-module.js — POST /api/tenants/deactivate-module
// -----------------------------------------------------------------------------
// Deactivates a module for a tenant. Applies downgrade_behavior from the
// module definition. Preserves config_state for future reactivation.
//
// Body: { tenant_id, module_code }
// -----------------------------------------------------------------------------

import { corsPreflight, methodGuard, readBody } from './_lib.mjs';
import { deactivateModule } from './_activation.mjs';

export const maxDuration = 15;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;

  let body;
  try { body = await readBody(req); } catch (e) {
    return res.status(400).json({ error: 'invalid_json' });
  }

  const { tenant_id, module_code } = body || {};
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });
  if (!module_code) return res.status(400).json({ error: 'module_code required' });

  const result = await deactivateModule({ tenant_id, module_code });

  if (result.status === 'error') {
    const code = result.reason === 'module_not_found' ? 404 : 400;
    return res.status(code).json({ error: result.reason, ...result });
  }
  return res.status(200).json(result);
}
