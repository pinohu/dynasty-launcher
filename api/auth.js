// Your Deputy — Clerk Auth API
// Returns publishable key for frontend, verifies sessions, manages user metadata

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
    const CLERK_SECRET = process.env.CLERK_SECRET_KEY;
    if (!CLERK_SECRET) return res.json({ ok: false, error: 'Clerk not configured' });
    
    const { user_id } = req.body || {};
    if (!user_id) return res.json({ ok: false, error: 'user_id required' });

    try {
      const resp = await fetch(`https://api.clerk.com/v1/users/${user_id}`, {
        headers: { 'Authorization': `Bearer ${CLERK_SECRET}` },
      });
      const user = await resp.json();
      return res.json({
        ok: true,
        email: user.email_addresses?.[0]?.email_address,
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        plan: user.public_metadata?.plan || 'free',
        builds_used: user.public_metadata?.builds_used || 0,
      });
    } catch (e) {
      return res.json({ ok: false, error: e.message });
    }
  }

  // ── Update user metadata (after build or payment) ──────────────────
  if (action === 'update_user') {
    const CLERK_SECRET = process.env.CLERK_SECRET_KEY;
    if (!CLERK_SECRET) return res.json({ ok: false, error: 'Clerk not configured' });
    
    const { user_id, metadata } = req.body || {};
    if (!user_id || !metadata) return res.json({ ok: false, error: 'user_id and metadata required' });

    try {
      const resp = await fetch(`https://api.clerk.com/v1/users/${user_id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${CLERK_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_metadata: metadata }),
      });
      const user = await resp.json();
      return res.json({ ok: true, metadata: user.public_metadata });
    } catch (e) {
      return res.json({ ok: false, error: e.message });
    }
  }

  // ── Verify admin key (server-side — key never exposed in client code) ──
  if (action === 'verify_admin') {
    const { key } = req.body || {};
    const ADMIN_KEY = process.env.ADMIN_KEY;
    if (!ADMIN_KEY) return res.json({ ok: false, error: 'Admin not configured' });
    if (!key) return res.json({ ok: false, error: 'key required' });
    if (key !== ADMIN_KEY) return res.json({ ok: false, error: 'Invalid admin key' });
    // Generate a time-limited admin token (valid 30 days)
    const crypto = await import('crypto');
    const expiry = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
    const payload = `admin:${expiry}`;
    const token = crypto.createHmac('sha256', ADMIN_KEY).update(payload).digest('hex');
    return res.json({
      ok: true,
      admin: true,
      tier: 'enterprise',
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
    const ADMIN_KEY = process.env.ADMIN_KEY;
    if (!ADMIN_KEY || !token) return res.json({ ok: false, valid: false });
    try {
      const parts = token.split(':');
      if (parts.length !== 3) return res.json({ ok: false, valid: false });
      const [prefix, expiry, hash] = parts;
      const payload = `${prefix}:${expiry}`;
      const crypto = await import('crypto');
      const expected = crypto.createHmac('sha256', ADMIN_KEY).update(payload).digest('hex');
      if (hash !== expected) return res.json({ ok: false, valid: false });
      if (Date.now() > parseInt(expiry)) return res.json({ ok: false, valid: false, expired: true });
      return res.json({ ok: true, valid: true, tier: 'enterprise' });
    } catch {
      return res.json({ ok: false, valid: false });
    }
  }

  return res.status(400).json({ error: 'Unknown action. Use: config, user, update_user, verify_admin, validate_admin' });
}
