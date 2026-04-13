// Serverless Function — proxies GitHub API using server-side GITHUB_TOKEN
// Security: validates path prefix to prevent abuse
export const maxDuration = 30;

const ALLOWED_PATH_PREFIXES = [
  '/repos/pinohu/',
  '/user/repos',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // ── Security: require paid session or admin token (HMAC-verified) ──
  const _adminTok = (req.headers['x-dynasty-admin-token'] || '').toString();
  const _paidTok = (req.body?.access_token || req.headers['x-dynasty-access-token'] || '').toString();
  let _authed = false;
  if (_adminTok) {
    try {
      const parts = _adminTok.split(':');
      if (parts.length === 3) {
        const [prefix, expiry, hash] = parts;
        const secret = prefix === 'admin' ? (process.env.ADMIN_KEY || '') : (prefix === 'admin_test' ? (process.env.TEST_ADMIN_KEY || '') : '');
        if (secret && parseInt(expiry) > Date.now()) {
          const { createHmac, timingSafeEqual } = await import('crypto');
          const expected = createHmac('sha256', secret).update(prefix + ':' + expiry).digest('hex');
          if (expected.length === hash.length && timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) _authed = true;
        }
      }
    } catch {}
  }
  if (!_authed && _paidTok) {
    try {
      const parts = _paidTok.split(':');
      if (parts.length === 6 && parts[0] === 'pay') {
        const [prefix, tokSession, tokUser, tokTier, exp, sig] = parts;
        const expNum = parseInt(exp, 10);
        if (Number.isFinite(expNum) && Date.now() <= expNum) {
          const secret = process.env.PAYMENT_ACCESS_SECRET || process.env.STRIPE_SECRET_KEY || '';
          if (secret) {
            const { createHmac, timingSafeEqual } = await import('crypto');
            const payload = prefix + ':' + tokSession + ':' + tokUser + ':' + tokTier + ':' + exp;
            const expected = createHmac('sha256', secret).update(payload).digest('hex');
            if (expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) _authed = true;
          }
        }
      }
    } catch {}
  }
  if (!_authed) return res.status(401).json({ ok: false, error: 'Authentication required' });


  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  const ghPath = req.query.path || '';

  // Validate path to prevent open relay abuse
  const normalizedPath = ghPath.replace(/\.\./g, '').replace(/\/\//g, '/');
  const allowed = ALLOWED_PATH_PREFIXES.some(p => normalizedPath.startsWith(p)) && !ghPath.includes('..');
  if (!allowed) {
    return res.status(403).json({ error: 'Path not allowed', path: ghPath });
  }

  const method = req.method;
  const body = method !== 'GET' && method !== 'HEAD' ? JSON.stringify(req.body) : undefined;

  try {
    const upstream = await fetch(`https://api.github.com${ghPath}`, {
      method,
      headers: {
        'Authorization': `token ${ghToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'dynasty-launcher',
      },
      ...(body ? { body } : {}),
    });

    const data = await upstream.text();
    return res.status(upstream.status).send(data);
  } catch (err) {
    return res.status(500).json({ error: 'GitHub proxy error' });
  }
}
