// api/_ai_security.mjs
// -----------------------------------------------------------------------------
// Shared authorization and spend controls for AI-backed endpoints.
//
// Provider keys are business assets. Public AI routes must prove one of:
//   - signed admin session token
//   - raw x-admin-key for server/admin smoke paths
//   - dedicated AI gateway token
//   - signed tenant token for the matching tenant
//   - signed paid access token minted by checkout
// -----------------------------------------------------------------------------

import {
  bearerToken,
  realSecret,
  timingSafeEqualString,
  verifyAdminSessionToken,
  verifyPaymentAccessToken,
  verifyRawAdminHeader,
  verifyTenantActionToken,
} from './tenants/_auth.mjs';
import { getTenant } from './tenants/_store.mjs';

const DEFAULT_AI_RATE_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_AI_RATE_LIMIT = 120;
const DEFAULT_AI_MAX_PROMPT_CHARS = 12_000;
const DEFAULT_AI_MAX_TOKENS = 4_000;
const DEFAULT_AI_PIVOT_MAX_MODELS = 5;

const PAID_AI_TIERS = new Set([
  'blueprint',
  'foundation',
  'starter',
  'strategy_pack',
  'professional',
  'enterprise',
  'managed',
  'custom_volume',
  'scoring_pro',
]);

function header(req, name) {
  const headers = req.headers || {};
  const needle = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === needle) {
      return Array.isArray(value) ? String(value[0] || '') : String(value || '');
    }
  }
  return '';
}

function stringValue(value) {
  return String(value || '').trim();
}

function positiveInt(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(n) || n < min) return fallback;
  return Math.min(n, max);
}

function clientIp(req) {
  const forwarded = header(req, 'x-forwarded-for').split(',')[0]?.trim();
  return forwarded || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

function rateBuckets() {
  if (!globalThis.__dynastyAiSecurityBuckets) {
    globalThis.__dynastyAiSecurityBuckets = new Map();
  }
  return globalThis.__dynastyAiSecurityBuckets;
}

function consumeBudget(actorKey, cost) {
  const windowMs = positiveInt(process.env.AI_RATE_WINDOW_MS, DEFAULT_AI_RATE_WINDOW_MS, {
    min: 60_000,
  });
  const limit = positiveInt(process.env.AI_RATE_LIMIT, DEFAULT_AI_RATE_LIMIT, { min: 1 });
  const bucketStart = Math.floor(Date.now() / windowMs) * windowMs;
  const key = `${bucketStart}:${actorKey}`;
  const map = rateBuckets();
  const current = map.get(key) || 0;
  const charge = Math.max(1, Math.ceil(Number(cost) || 1));
  if (current + charge > limit) {
    return {
      ok: false,
      status: 429,
      error: 'ai_rate_limit_exceeded',
      limit,
      used: current,
      requested: charge,
      reset_at: new Date(bucketStart + windowMs).toISOString(),
    };
  }
  map.set(key, current + charge);
  return {
    ok: true,
    limit,
    used: current + charge,
    remaining: Math.max(0, limit - current - charge),
    reset_at: new Date(bucketStart + windowMs).toISOString(),
  };
}

function authOk(authType, subject, extra = {}) {
  return {
    ok: true,
    auth_type: authType,
    subject: subject || authType,
    actor_key: `${authType}:${subject || 'system'}`,
    ...extra,
  };
}

function resolveGatewayToken(req) {
  const secret = realSecret(process.env.AI_GATEWAY_TOKEN);
  if (!secret) return null;
  const supplied = header(req, 'x-ai-gateway-token') || bearerToken(req);
  if (supplied && timingSafeEqualString(supplied, secret)) {
    return authOk('ai_gateway', 'gateway');
  }
  return null;
}

function resolveAdmin(req, body) {
  if (verifyRawAdminHeader(req)) return authOk('admin_key', 'admin');
  const candidates = [
    header(req, 'x-dynasty-admin-token'),
    stringValue(body?.admin_token),
    bearerToken(req),
  ].filter(Boolean);
  for (const token of candidates) {
    if (verifyAdminSessionToken(token)) return authOk('admin_session', 'admin');
  }
  return null;
}

async function resolveTenant(req, body) {
  const token = header(req, 'x-dynasty-tenant-token') || bearerToken(req);
  if (!String(token || '').startsWith('tenant:')) return null;

  const tenantId = stringValue(body?.tenant_id || body?.tenantId || req.query?.tenant_id);
  if (!tenantId) {
    return { ok: false, status: 400, error: 'tenant_id_required_for_tenant_token' };
  }
  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return { ok: false, status: 404, error: `tenant '${tenantId}' not found` };
  }
  const verified = verifyTenantActionToken(token, tenant);
  if (!verified.ok) return verified;
  return authOk('tenant_token', verified.subject, { tenant_id: tenantId });
}

function resolvePaid(body, token) {
  if (!String(token || '').startsWith('pay:')) return null;
  const verified = verifyPaymentAccessToken(token);
  if (!verified.ok) return verified;

  const requestedSession = stringValue(
    body?.stripe_session_id || body?.session_id || body?.sessionId,
  );
  if (requestedSession && requestedSession !== verified.session_id) {
    return { ok: false, status: 403, error: 'payment_session_mismatch' };
  }

  const requestedUser = stringValue(body?.user_id || body?.userId);
  if (
    requestedUser &&
    verified.subject &&
    verified.subject !== 'anon' &&
    requestedUser !== verified.subject
  ) {
    return { ok: false, status: 403, error: 'payment_user_mismatch' };
  }

  const tier = stringValue(verified.tier).toLowerCase();
  if (!PAID_AI_TIERS.has(tier)) {
    return { ok: false, status: 402, error: 'paid_ai_access_required' };
  }

  const claimedTier = stringValue(body?.tier).toLowerCase();
  if (claimedTier && claimedTier !== 'free' && claimedTier !== tier) {
    return { ok: false, status: 403, error: 'payment_tier_mismatch' };
  }

  return authOk('payment_token', verified.subject || verified.session_id, {
    tier,
    session_id: verified.session_id,
  });
}

function resolvePayment(req, body) {
  const candidates = [
    header(req, 'x-dynasty-access-token'),
    stringValue(body?.access_token),
    stringValue(body?.paid_access_token),
    bearerToken(req),
  ].filter(Boolean);
  for (const token of candidates) {
    const auth = resolvePaid(body, token);
    if (auth) return auth;
  }
  return null;
}

export async function authorizeAiRequest(req, body = {}, { cost = 1 } = {}) {
  const admin = resolveAdmin(req, body);
  const auth =
    admin ||
    resolveGatewayToken(req) ||
    (await resolveTenant(req, body)) ||
    resolvePayment(req, body);

  if (!auth) {
    return { ok: false, status: 401, error: 'ai_authorization_required' };
  }
  if (!auth.ok) return auth;

  const budget = consumeBudget(auth.actor_key || `${auth.auth_type}:${clientIp(req)}`, cost);
  if (!budget.ok) return budget;
  return { ...auth, budget };
}

export function writeAiAuthError(res, auth) {
  return res.status(auth.status || 403).json({
    ok: false,
    error: auth.error || 'ai_authorization_failed',
    ...(auth.limit ? { limit: auth.limit } : {}),
    ...(auth.reset_at ? { reset_at: auth.reset_at } : {}),
  });
}

export function aiCorsHeaders() {
  return 'Content-Type, Authorization, x-admin-key, x-dynasty-admin-token, x-dynasty-access-token, x-dynasty-tenant-token, x-ai-gateway-token';
}

export function maxAiPromptChars() {
  return positiveInt(process.env.AI_MAX_PROMPT_CHARS, DEFAULT_AI_MAX_PROMPT_CHARS, { min: 1_000 });
}

export function maxAiTokensLimit() {
  return positiveInt(process.env.AI_MAX_TOKENS_PER_CALL, DEFAULT_AI_MAX_TOKENS, { min: 256 });
}

export function maxPivotModels() {
  return positiveInt(process.env.AI_PIVOT_MAX_MODELS, DEFAULT_AI_PIVOT_MAX_MODELS, {
    min: 1,
    max: 20,
  });
}

export function validateAiTextLimit(name, value, maxChars = maxAiPromptChars()) {
  const text = String(value || '');
  if (text.length > maxChars) {
    return {
      ok: false,
      status: 413,
      error: `${name}_too_large`,
      length: text.length,
      max_chars: maxChars,
    };
  }
  return { ok: true, text };
}

export function resolveAiMaxTokens(requested, fallback) {
  const limit = maxAiTokensLimit();
  const hasExplicitRequest = requested !== undefined && requested !== null && requested !== '';
  const value = hasExplicitRequest
    ? Number.parseInt(String(requested), 10)
    : Math.min(fallback, limit);
  if (!Number.isFinite(value) || value < 1) {
    return { ok: false, status: 400, error: 'max_tokens_invalid', max_tokens_limit: limit };
  }
  if (hasExplicitRequest && value > limit) {
    return { ok: false, status: 400, error: 'max_tokens_exceeds_limit', max_tokens_limit: limit };
  }
  return { ok: true, value };
}

export function coerceAiMaxTokens(requested, fallback) {
  const parsed = Number.parseInt(String(requested || ''), 10);
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.min(value, maxAiTokensLimit());
}
