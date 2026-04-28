export const maxDuration = 15;
import { adminCorsHeaders, verifyAdminCredential } from './tenants/_auth.mjs';

const _se = (m) => typeof m === 'string' ? m.replace(/sk_live_\w+/g,'sk_live_***').replace(/ghp_\w+/g,'ghp_***').replace(/postgres(ql)?:\/\/[^\s]+/g,'postgres://***').slice(0,200) : 'Error';

export default async function handler(req, res) {
  const allowedOrigin = process.env.CORS_ORIGIN || 'https://yourdeputy.com';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', adminCorsHeaders());
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });

  // Public health returns minimal info; full details require admin
  if (!verifyAdminCredential(req).ok) {
    return res.json({ ok: true, status: 'operational', timestamp: new Date().toISOString() });
  }

  const checks = {};
  let config = {}; try { config = JSON.parse(process.env.DYNASTY_TOOL_CONFIG || '{}'); } catch {}

  // GitHub token
  try {
    const r = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}` }
    });
    const d = await r.json();
    checks.github = r.ok ? { ok: true, user: d.login } : { ok: false, error: d.message };
  } catch(e) { checks.github = { ok: false, error: _se(e.message) }; }

  // Primary AI provider — Google Gemini (free tier). Previously pinged Anthropic;
  // removed to eliminate Claude spend on routine health checks.
  try {
    const geminiKey = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY || '';
    if (!geminiKey) { checks.gemini = { ok: false, error: 'GOOGLE_AI_KEY not set' }; }
    else {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 5 } })
      });
      checks.gemini = r.ok ? { ok: true } : { ok: false, status: r.status };
    }
  } catch(e) { checks.gemini = { ok: false, error: _se(e.message) }; }

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
  } catch(e) { checks.stripe = { ok: false, error: _se(e.message) }; }

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
  } catch(e) { checks.pulsetic = { ok: false, error: _se(e.message) }; }

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
