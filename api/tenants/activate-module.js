// api/tenants/activate-module.js — POST /api/tenants/activate-module
// -----------------------------------------------------------------------------
// Runs the 14-step activation contract from _activation.mjs.
//
// Body: { tenant_id, module_code, user_input? }
//
// Responses:
//   200 { status: 'ok' | 'idempotent_ok', entitlement }
//   200 { status: 'deferred', missing_capabilities, wizards }  (guided setup needed)
//   400 { error, reason }                                       (activation refused)
//   404 { error }                                               (tenant or module not found)
// -----------------------------------------------------------------------------

import { corsPreflight, methodGuard, readBody } from './_lib.mjs';
import { activateModule } from './_activation.mjs';
import { getTenant } from './_store.mjs';
import { requireTenantAccess } from './_auth.mjs';

export const maxDuration = 30;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;

  let body;
  try { body = await readBody(req); } catch (e) {
    return res.status(400).json({ error: 'invalid_json' });
  }

  const { tenant_id, module_code, user_input } = body || {};
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });
  if (!module_code) return res.status(400).json({ error: 'module_code required' });

  const tenant = await getTenant(tenant_id);
  if (tenant && !requireTenantAccess(req, res, tenant)) return;

  const result = await activateModule({ tenant_id, module_code, user_input });

  // Translate internal outcomes → HTTP
  if (result.status === 'error') {
    const code = result.reason === 'tenant_not_found' || result.reason === 'module_not_found' ? 404 : 400;
    return res.status(code).json({ error: result.reason, ...result });
  }
  // ok, idempotent_ok, deferred — all 200
  return res.status(200).json(result);
}
