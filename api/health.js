export const maxDuration = 10;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const checks = {};
  const config = JSON.parse(process.env.DYNASTY_TOOL_CONFIG || '{}');

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
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 5, messages: [{ role: 'user', content: 'ping' }] })
    });
    checks.anthropic = r.ok ? { ok: true } : { ok: false, status: r.status };
  } catch(e) { checks.anthropic = { ok: false, error: e.message }; }

  // Stripe
  try {
    const stripeKey = config.payments?.stripe_live;
    if (stripeKey) {
      const r = await fetch('https://api.stripe.com/v1/products?limit=1', {
        headers: { 'Authorization': `Basic ${Buffer.from(stripeKey + ':').toString('base64')}` }
      });
      checks.stripe = { ok: r.ok, status: r.status, expired: r.status === 401 };
    } else {
      checks.stripe = { ok: false, error: 'No key in config' };
    }
  } catch(e) { checks.stripe = { ok: false, error: e.message }; }

  // Flint bridge
  try {
    const r = await fetch('https://claude-outbox.audreysplace.place/messages', {
      headers: { 'Authorization': `Bearer ${process.env.FLINT_TOKEN || '1ed943c21ef9e2f60fe1189241a246d769e4191051ad2c0c035282722cb4b030'}` },
      signal: AbortSignal.timeout(5000)
    });
    checks.flint = r.ok ? { ok: true } : { ok: false, status: r.status, down: true };
  } catch(e) { checks.flint = { ok: false, down: true, error: e.message }; }

  // Pulsetic
  try {
    const r = await fetch('https://pulsetic.com/api/public/monitors', {
      headers: { 'APITOKEN': config.infrastructure?.pulsetic }
    });
    checks.pulsetic = { ok: r.ok, status: r.status };
  } catch(e) { checks.pulsetic = { ok: false, error: e.message }; }

  const allOk = Object.values(checks).every(c => c.ok);
  const expired = Object.entries(checks).filter(([,v]) => v.expired || v.ok === false).map(([k]) => k);

  return res.status(allOk ? 200 : 207).json({
    status: allOk ? 'healthy' : 'degraded',
    expired_or_failing: expired,
    checks,
    timestamp: new Date().toISOString()
  });
}
