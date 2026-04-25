// api/_lib/admin-auth.mjs
// Extracted from api/claude.js so every /api/agents/* endpoint uses the
// same HMAC verification. Admin tokens are format 'prefix:expiry:hash'
// where prefix is 'admin' or 'admin_test', expiry is epoch ms, and hash
// is HMAC-SHA256(prefix:expiry) keyed on ADMIN_KEY or TEST_ADMIN_KEY.
//
// Returns true only on a valid, unexpired token with a timingSafeEqual
// hash match. Any other input returns false — empty, wrong format,
// expired, wrong secret.
// -----------------------------------------------------------------------------

export async function verifyAdminToken(req) {
  const raw = (req.headers['x-dynasty-admin-token'] || '').toString();
  if (!raw) return false;
  try {
    const parts = raw.split(':');
    if (parts.length !== 3) return false;
    const [prefix, expiry, hash] = parts;
    const secret =
      prefix === 'admin'      ? (process.env.ADMIN_KEY || '') :
      prefix === 'admin_test' ? (process.env.TEST_ADMIN_KEY || '') :
      '';
    if (!secret) return false;
    if (!(parseInt(expiry, 10) > Date.now())) return false;
    const { createHmac, timingSafeEqual } = await import('node:crypto');
    const expected = createHmac('sha256', secret).update(prefix + ':' + expiry).digest('hex');
    if (expected.length !== hash.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
  } catch {
    return false;
  }
}

// Higher-order helper: wraps a handler so the auth check runs first.
// Returns 401 if the token is missing or invalid, 501 if the modular-agents
// flag is off. Call order: flag check -> auth -> handler.
export function requireAdmin(handler) {
  return async (req, res) => {
    if (process.env.USE_MODULAR_AGENTS !== 'true') {
      return res.status(501).json({ error: 'USE_MODULAR_AGENTS is off' });
    }
    const ok = await verifyAdminToken(req);
    if (!ok) return res.status(401).json({ error: 'admin token invalid or missing' });
    return handler(req, res);
  };
}
