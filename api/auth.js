// Your Deputy — Clerk Auth API
// Returns publishable key for frontend, verifies sessions, manages user metadata

const ADMIN_ATTEMPTS = new Map();
const ADMIN_MAX_ATTEMPTS = 8;
const ADMIN_WINDOW_MS = 15 * 60 * 1000;
const TEST_ADMIN_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 6 months
const PRIMARY_ADMIN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getClientIp(req) {
  const xf = (req.headers['x-forwarded-for'] || '').toString();
  return xf.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

function isAdminRateLimited(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const existing = ADMIN_ATTEMPTS.get(ip);
  if (!existing || now - existing.windowStart > ADMIN_WINDOW_MS) {
    ADMIN_ATTEMPTS.set(ip, { windowStart: now, attempts: 1 });
    return false;
  }
  existing.attempts += 1;
  ADMIN_ATTEMPTS.set(ip, existing);
  return existing.attempts > ADMIN_MAX_ATTEMPTS;
}

async function timingSafeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const { timingSafeEqual } = await import('crypto');
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  // ── Get publishable key for frontend ──────────────────────────────
  if (action === 'config' || !action) {
    const pk = process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (!pk) return res.json({ ok: false, error: 'Clerk not configured' });
    return res.json({ ok: true, publishableKey: pk });
  }

  // ── Get user metadata (subscription status, build count) ───────────
  if (action === 'user') {
    return res.status(403).json({ ok: false, error: 'User metadata endpoint disabled for security hardening' });
  }

  // ── Update user metadata (after build or payment) ──────────────────
  if (action === 'update_user') {
    return res.status(403).json({ ok: false, error: 'Metadata update endpoint disabled for security hardening' });
  }

  // ── Verify admin key (server-side — key never exposed in client code) ──
  if (action === 'verify_admin') {
    const { key } = req.body || {};
    const ADMIN_KEY = process.env.ADMIN_KEY || '';
    const TEST_ADMIN_KEY = process.env.TEST_ADMIN_KEY || '';
    if (!ADMIN_KEY && !TEST_ADMIN_KEY) return res.status(503).json({ ok: false, error: 'Admin auth unavailable: no admin keys configured' });
    if (isAdminRateLimited(req)) res.setHeader('Retry-After', '900'); return res.status(429).json({ ok: false, error: 'Too many attempts. Try again later.' });
    if (!key) return res.json({ ok: false, error: 'key required' });
    let keyType = '';
    let signingSecret = '';
    if (ADMIN_KEY && await timingSafeEqualString(key, ADMIN_KEY)) {
      keyType = 'admin';
      signingSecret = ADMIN_KEY;
    } else if (TEST_ADMIN_KEY && await timingSafeEqualString(key, TEST_ADMIN_KEY)) {
      keyType = 'admin_test';
      signingSecret = TEST_ADMIN_KEY;
    }
    if (!keyType || !signingSecret) return res.json({ ok: false, error: 'Invalid admin key' });
    // Generate a time-limited admin token
    const crypto = await import('crypto');
    const expiry = Date.now() + (keyType === 'admin_test' ? TEST_ADMIN_TTL_MS : PRIMARY_ADMIN_TTL_MS);
    const payload = `${keyType}:${expiry}`;
    const token = crypto.createHmac('sha256', signingSecret).update(payload).digest('hex');
    return res.json({
      ok: true,
      admin: true,
      tier: 'enterprise',
      access_type: keyType === 'admin_test' ? 'test_6_month' : 'primary',
      token: `${payload}:${token}`,
      expires: new Date(expiry).toISOString(),
      privileges: {
        all_modules: true,
        unlimited_builds: true,
        skip_payment: true,
        all_tiers_accessible: true,
      }
    });
  }

  // ── Validate existing admin token ──────────────────────────────────
  if (action === 'validate_admin') {
    const { token } = req.body || {};
    const ADMIN_KEY = process.env.ADMIN_KEY || '';
    const TEST_ADMIN_KEY = process.env.TEST_ADMIN_KEY || '';
    if (!ADMIN_KEY && !TEST_ADMIN_KEY) return res.status(503).json({ ok: false, valid: false, error: 'No admin keys configured' });
    if (!token) return res.json({ ok: false, valid: false });
    try {
      const parts = token.split(':');
      if (parts.length !== 3) return res.json({ ok: false, valid: false });
      const [prefix, expiry, hash] = parts;
      const tokenSecret = prefix === 'admin' ? ADMIN_KEY : (prefix === 'admin_test' ? TEST_ADMIN_KEY : '');
      if (!tokenSecret) return res.json({ ok: false, valid: false });
      const payload = `${prefix}:${expiry}`;
      const crypto = await import('crypto');
      const expected = crypto.createHmac('sha256', tokenSecret).update(payload).digest('hex');
      if (expected.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) return res.json({ ok: false, valid: false });
      if (Date.now() > parseInt(expiry)) return res.json({ ok: false, valid: false, expired: true });
      return res.json({ ok: true, valid: true, tier: 'enterprise' });
    } catch {
      return res.json({ ok: false, valid: false });
    }
  }

  return res.status(400).json({ error: 'Unknown action. Use: config, user, update_user, verify_admin, validate_admin' });
}
