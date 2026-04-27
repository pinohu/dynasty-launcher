// api/tenants/_auth.mjs
// -----------------------------------------------------------------------------
// Shared tenant/admin authorization helpers.
//
// Tenant IDs identify workspaces; they are not credentials. Tenant-scoped
// endpoints should require one of:
//   - signed tenant action token: tenant:<tenant_id>:<subject>:<exp>:<hmac>
//   - signed admin session token from /api/auth?action=verify_admin
//   - x-admin-key header for server-side/admin smoke paths
//   - signed paid access token when it matches the tenant owner
// -----------------------------------------------------------------------------

import crypto from 'node:crypto';

const DEFAULT_TENANT_TOKEN_TTL_MS = 60 * 60 * 1000;
const MAX_TENANT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function realSecret(value) {
  const v = String(value || '').trim();
  return v && !v.startsWith('STUB') && !v.startsWith('EXPIRED') ? v : '';
}

function tenantActionSecret() {
  return (
    realSecret(process.env.TENANT_ACTION_SECRET) ||
    realSecret(process.env.PAYMENT_ACCESS_SECRET) ||
    realSecret(process.env.ADMIN_KEY) ||
    realSecret(process.env.TEST_ADMIN_KEY) ||
    realSecret(process.env.STRIPE_SECRET_KEY)
  );
}

function paymentAccessSecret() {
  return realSecret(process.env.PAYMENT_ACCESS_SECRET) || realSecret(process.env.STRIPE_SECRET_KEY);
}

export function hmacHex(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function bearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const [scheme, token] = String(header).split(/\s+/, 2);
  return scheme?.toLowerCase() === 'bearer' && token ? token : '';
}

export function tenantOwnerSubject(tenant) {
  return (
    tenant?.owner_user_id ||
    tenant?.user_id ||
    tenant?.created_by ||
    tenant?.profile?.owner_user_id ||
    tenant?.profile?.user_id ||
    tenant?.profile?.clerk_user_id ||
    tenant?.profile?.email ||
    ''
  );
}

export function signTenantActionToken({ tenant_id, subject, ttl_ms } = {}) {
  const secret = tenantActionSecret();
  if (!secret) return null;
  const safeTtl = Math.min(
    Math.max(Number(ttl_ms) || DEFAULT_TENANT_TOKEN_TTL_MS, 60_000),
    MAX_TENANT_TOKEN_TTL_MS,
  );
  const exp = Date.now() + safeTtl;
  const payload = `tenant:${tenant_id}:${subject}:${exp}`;
  const sig = hmacHex(secret, payload);
  return {
    token: `${payload}:${sig}`,
    expires_at: new Date(exp).toISOString(),
    expires_in_ms: safeTtl,
  };
}

export function verifyAdminSessionToken(token) {
  const parts = String(token || '').split(':');
  if (parts.length !== 3) return false;
  const [prefix, expiry, supplied] = parts;
  const secret =
    prefix === 'admin'
      ? realSecret(process.env.ADMIN_KEY)
      : prefix === 'admin_test'
        ? realSecret(process.env.TEST_ADMIN_KEY)
        : '';
  if (!secret || !/^\d+$/.test(expiry) || Date.now() > Number(expiry)) return false;
  return timingSafeEqualString(hmacHex(secret, `${prefix}:${expiry}`), supplied);
}

export function verifyRawAdminHeader(req) {
  const supplied = req.headers?.['x-admin-key'] || req.headers?.['X-Admin-Key'];
  const primary = realSecret(process.env.ADMIN_KEY);
  const test = realSecret(process.env.TEST_ADMIN_KEY);
  return (
    !!supplied &&
    ((primary && timingSafeEqualString(supplied, primary)) ||
      (test && timingSafeEqualString(supplied, test)))
  );
}

export function verifyAdminCredential(req) {
  if (verifyRawAdminHeader(req)) return { ok: true, auth_type: 'admin_key' };
  const token =
    bearerToken(req) ||
    req.headers?.['x-dynasty-admin-token'] ||
    req.headers?.['X-Dynasty-Admin-Token'];
  if (verifyAdminSessionToken(token)) return { ok: true, auth_type: 'admin_session' };
  return { ok: false, error: 'admin_auth_required', status: 401 };
}

export function verifyTenantActionToken(token, tenant) {
  const secret = tenantActionSecret();
  if (!secret) return { ok: false, error: 'tenant_auth_secret_missing', status: 503 };

  const parts = String(token || '').split(':');
  if (parts.length !== 5 || parts[0] !== 'tenant') {
    return { ok: false, error: 'invalid_tenant_token', status: 403 };
  }

  const [, tokenTenantId, subject, expiry, supplied] = parts;
  if (tokenTenantId !== tenant.tenant_id) {
    return { ok: false, error: 'tenant_token_mismatch', status: 403 };
  }
  if (!subject || !/^\d+$/.test(expiry) || Date.now() > Number(expiry)) {
    return { ok: false, error: 'tenant_token_expired', status: 403 };
  }

  const expectedSubject = tenantOwnerSubject(tenant);
  if (expectedSubject && subject !== expectedSubject) {
    return { ok: false, error: 'tenant_owner_mismatch', status: 403 };
  }

  const payload = `tenant:${tokenTenantId}:${subject}:${expiry}`;
  if (!timingSafeEqualString(hmacHex(secret, payload), supplied)) {
    return { ok: false, error: 'tenant_token_signature_invalid', status: 403 };
  }
  return { ok: true, subject, auth_type: 'tenant_token' };
}

export function verifyPaymentAccessToken(token) {
  const secret = paymentAccessSecret();
  if (!secret) return { ok: false, error: 'payment_access_secret_missing', status: 503 };

  const parts = String(token || '').split(':');
  if (parts.length !== 6 || parts[0] !== 'pay') {
    return { ok: false, error: 'invalid_payment_token', status: 403 };
  }
  const [, sessionId, subject, tier, expiry, supplied] = parts;
  if (!sessionId || !/^\d+$/.test(expiry) || Date.now() > Number(expiry)) {
    return { ok: false, error: 'payment_token_expired', status: 403 };
  }
  const payload = `pay:${sessionId}:${subject}:${tier}:${expiry}`;
  if (!timingSafeEqualString(hmacHex(secret, payload), supplied)) {
    return { ok: false, error: 'payment_token_signature_invalid', status: 403 };
  }
  return { ok: true, subject, tier, session_id: sessionId, auth_type: 'payment_token' };
}

export function verifyTenantCredential(req, tenant) {
  if (verifyRawAdminHeader(req)) return { ok: true, auth_type: 'admin_key' };

  const token = bearerToken(req);
  if (!token) return { ok: false, error: 'tenant_authorization_required', status: 401 };
  if (verifyAdminSessionToken(token)) return { ok: true, auth_type: 'admin_session' };

  const tenantToken = verifyTenantActionToken(token, tenant);
  if (tenantToken.ok) return tenantToken;
  if (String(token).startsWith('tenant:')) return tenantToken;

  const paymentToken = verifyPaymentAccessToken(token);
  if (!paymentToken.ok) return paymentToken;
  const expectedSubject = tenantOwnerSubject(tenant);
  if (expectedSubject && paymentToken.subject !== expectedSubject) {
    return { ok: false, error: 'tenant_owner_mismatch', status: 403 };
  }
  if (!expectedSubject) {
    return { ok: false, error: 'tenant_owner_unbound', status: 403 };
  }
  return paymentToken;
}

export function requireTenantAccess(req, res, tenant) {
  const auth = verifyTenantCredential(req, tenant);
  if (!auth.ok) {
    res.status(auth.status || 403).json({ error: auth.error });
    return false;
  }
  return auth;
}

export function authorizeTenantTokenIssue(req, tenant, requestedSubject) {
  if (verifyRawAdminHeader(req)) return { ok: true, auth_type: 'admin_key' };

  const token = bearerToken(req);
  if (!token) return { ok: false, error: 'tenant_authorization_required', status: 401 };
  if (verifyAdminSessionToken(token)) return { ok: true, auth_type: 'admin_session' };

  const existingTenantToken = verifyTenantActionToken(token, tenant);
  if (existingTenantToken.ok) return existingTenantToken;

  const paymentToken = verifyPaymentAccessToken(token);
  if (!paymentToken.ok) return paymentToken;

  const expectedSubject = tenantOwnerSubject(tenant);
  const subject = requestedSubject || paymentToken.subject;
  if (!expectedSubject) return { ok: false, error: 'tenant_owner_unbound', status: 403 };
  if (paymentToken.subject !== expectedSubject || subject !== expectedSubject) {
    return { ok: false, error: 'tenant_owner_mismatch', status: 403 };
  }
  return paymentToken;
}
