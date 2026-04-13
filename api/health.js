export const maxDuration = 15;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  if (req.method === 'OPTIONS') return res.status(200).end();
  // Public health returns minimal info; full details require admin
  const adminKey = req.query?.key || req.headers['x-admin-key'] || '';
  const ADMIN = process.env.ADMIN_KEY || process.env.TEST_ADMIN_KEY || '';
  if (!ADMIN || adminKey !== ADMIN) {
    return res.json({ ok: true, status: 'operational', timestamp: new Date().toISOString() });
  }
  const allowedOrigin = process.env.CORS_ORIGIN || 'https://yourdeputy.com';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const checks = {};
  let config = {}; try { config = JSON.parse(process.env.DYNASTY_TOOL_CONFIG || '{}'); } catch {}

  // GitHub token
  try {
    const r = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}` }
    });
    const d = await r.json();
    checks.github = r.ok ? { ok: true, user: d.login } : { ok: false, error: d.message };
  } catch(e) { checks.github = { ok: false, error: e.message }; }

  // Anthropic API
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 5, messages: [{ role: 'user', content: 'ping' }] })
    });
    checks.anthropic = r.ok ? { ok: true } : { ok: false, status: r.status };
  } catch(e) { checks.anthropic = { ok: false, error: e.message }; }

  // Stripe
  try {
    const stripeKey = config.payments?.stripe_live;
    if (stripeKey && !stripeKey.startsWith('EXPIRED')) {
      const r = await fetch('https://api.stripe.com/v1/products?limit=1', {
        headers: { 'Authorization': `Basic ${Buffer.from(stripeKey + ':').toString('base64')}` }
      });
      checks.stripe = { ok: r.ok, status: r.status, expired: r.status === 401 };
    } else {
      checks.stripe = { ok: false, error: 'Key expired — refresh at dashboard.stripe.com' };
    }
  } catch(e) { checks.stripe = { ok: false, error: e.message }; }

  // Pulsetic (correct auth format)
  try {
    const pulseticKey = config.infrastructure?.pulsetic;
    if (pulseticKey) {
      const r = await fetch('https://api.pulsetic.com/api/public/monitors', {
        headers: { 'Authorization': pulseticKey, 'Content-Type': 'application/json' }
      });
      const d = r.ok ? await r.json() : null;
      const count = d ? (Array.isArray(d) ? d.length : d.data?.length || 0) : 0;
      checks.pulsetic = { ok: r.ok, monitors: count };
    } else {
      checks.pulsetic = { ok: false, error: 'No key in config' };
    }
  } catch(e) { checks.pulsetic = { ok: false, error: e.message }; }

  const allOk = Object.values(checks).every(c => c.ok);
  const failing = Object.entries(checks).filter(([,v]) => !v.ok).map(([k]) => k);

  return res.status(allOk ? 200 : 207).json({
    status: allOk ? 'healthy' : 'degraded',
    failing,
    checks,
    timestamp: new Date().toISOString(),
    version: '2.0'
  });
}
