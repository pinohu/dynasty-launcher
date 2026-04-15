// api/tenants/grant-entitlement.js — POST /api/tenants/grant-entitlement
// -----------------------------------------------------------------------------
// Admin-gated entitlement grant. Used by:
//   - Stripe webhook (Track 7 will wire this)
//   - Admin comps and trials
//   - Smoke tests
//
// In production, the Stripe webhook calls this with a signed source. Direct
// HTTP access requires the admin key.
//
// Body:
//   {
//     tenant_id: string,
//     module_code: string,
//     billing_source?: {
//       source_type: "module" | "bundle" | "plan_included" | "trial" | "comp",
//       source_code?: string,
//       stripe_subscription_id?: string,
//       stripe_subscription_item_id?: string
//     }
//   }
// -----------------------------------------------------------------------------

import { corsPreflight, methodGuard, readBody, adminOnly } from './_lib.mjs';
import { grantEntitlement } from './_activation.mjs';
import { getTenant } from './_store.mjs';
import { getCatalog } from '../catalog/_lib.mjs';

export const maxDuration = 15;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;
  if (!adminOnly(req, res)) return;

  let body;
  try { body = await readBody(req); } catch (e) {
    return res.status(400).json({ error: 'invalid_json' });
  }
  const { tenant_id, module_code, billing_source } = body || {};
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });
  if (!module_code) return res.status(400).json({ error: 'module_code required' });

  if (!getTenant(tenant_id)) return res.status(404).json({ error: 'tenant_not_found' });
  const knownModule = getCatalog().modules.find((m) => m.module_code === module_code);
  if (!knownModule) return res.status(404).json({ error: 'module_not_found' });

  const entitlement = grantEntitlement({ tenant_id, module_code, billing_source });
  return res.status(200).json({ entitlement });
}
