// Serverless Function — 300s timeout (Vercel Pro max) for AI generation calls
export const maxDuration = 300;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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


  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'AI service error' });
  }
}
