// api/tenants/issue-token.js - POST /api/tenants/issue-token
// -----------------------------------------------------------------------------
// Exchanges an admin session/key, an existing tenant token, or a paid access
// token bound to the tenant owner for a short-lived tenant action token.
//
// Body: { tenant_id, subject?, ttl_ms? }
// Response: { ok, tenant_id, subject, token, expires_at, expires_in_ms }
// -----------------------------------------------------------------------------

import { authorizeTenantTokenIssue, signTenantActionToken, tenantOwnerSubject } from './_auth.mjs';
import { corsPreflight, methodGuard, readBody } from './_lib.mjs';
import { getTenant } from './_store.mjs';

export const maxDuration = 10;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;

  let body;
  try {
    body = await readBody(req);
  } catch (_e) {
    return res.status(400).json({ error: 'invalid_json' });
  }

  const { tenant_id, subject: requestedSubject, ttl_ms } = body || {};
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });

  const tenant = await getTenant(tenant_id);
  if (!tenant) return res.status(404).json({ error: 'tenant_not_found' });

  const subject = requestedSubject || tenantOwnerSubject(tenant);
  if (!subject) return res.status(400).json({ error: 'subject required' });

  const auth = authorizeTenantTokenIssue(req, tenant, subject);
  if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

  const signed = signTenantActionToken({ tenant_id, subject, ttl_ms });
  if (!signed) return res.status(503).json({ error: 'tenant_auth_secret_missing' });

  return res.status(200).json({
    ok: true,
    tenant_id,
    subject,
    auth_type: auth.auth_type,
    ...signed,
  });
}
