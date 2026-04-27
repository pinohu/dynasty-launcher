// Serverless Function - proxies GitHub API using server-side GITHUB_TOKEN.
// Paid users may read allowed repository paths; only admins may mutate GitHub.
export const maxDuration = 30;

import {
  bearerToken,
  verifyAdminSessionToken,
  verifyPaymentAccessToken,
  verifyRawAdminHeader,
} from './tenants/_auth.mjs';

const ALLOWED_PATH_PREFIXES = ['/repos/pinohu/', '/user/repos'];

function header(req, name) {
  const needle = String(name).toLowerCase();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (String(key).toLowerCase() === needle)
      return Array.isArray(value) ? String(value[0] || '') : String(value || '');
  }
  return '';
}

function isMutation(method) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(String(method || '').toUpperCase());
}

function authForGitHubProxy(req) {
  if (verifyRawAdminHeader(req)) return { ok: true, auth_type: 'admin_key', admin: true };

  const adminCandidates = [header(req, 'x-dynasty-admin-token'), bearerToken(req)].filter(Boolean);
  for (const token of adminCandidates) {
    if (verifyAdminSessionToken(token))
      return { ok: true, auth_type: 'admin_session', admin: true };
  }

  const paidCandidates = [
    header(req, 'x-dynasty-access-token'),
    req.body?.access_token,
    bearerToken(req),
  ].filter(Boolean);
  for (const token of paidCandidates) {
    if (!String(token).startsWith('pay:')) continue;
    const paid = verifyPaymentAccessToken(String(token));
    if (paid.ok) return { ok: true, auth_type: 'payment_token', admin: false, tier: paid.tier };
    return paid;
  }

  return { ok: false, status: 401, error: 'Authentication required' };
}

function sanitizedBody(req) {
  if (!req.body || typeof req.body !== 'object') return req.body;
  const body = { ...req.body };
  body.access_token = undefined;
  body.admin_token = undefined;
  body.paid_access_token = undefined;
  return body;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-admin-key, x-dynasty-admin-token, x-dynasty-access-token',
  );

  if (req.method === 'OPTIONS') return res.status(204).end();

  const auth = authForGitHubProxy(req);
  if (!auth.ok) {
    return res
      .status(auth.status || 401)
      .json({ ok: false, error: auth.error || 'Authentication required' });
  }
  if (isMutation(req.method) && !auth.admin) {
    return res.status(403).json({ ok: false, error: 'admin_required_for_mutation' });
  }

  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  const ghPath = req.query.path || '';

  const normalizedPath = ghPath.replace(/\.\./g, '').replace(/\/\//g, '/');
  const allowed =
    ALLOWED_PATH_PREFIXES.some((p) => normalizedPath.startsWith(p)) && !ghPath.includes('..');
  if (!allowed) {
    return res.status(403).json({ error: 'Path not allowed', path: ghPath });
  }

  const method = req.method;
  const body =
    method !== 'GET' && method !== 'HEAD' ? JSON.stringify(sanitizedBody(req)) : undefined;

  try {
    const upstream = await fetch(`https://api.github.com${ghPath}`, {
      method,
      headers: {
        Authorization: `token ${ghToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'dynasty-launcher',
      },
      ...(body ? { body } : {}),
    });

    const data = await upstream.text();
    return res.status(upstream.status).send(data);
  } catch {
    return res.status(500).json({ error: 'GitHub proxy error' });
  }
}
