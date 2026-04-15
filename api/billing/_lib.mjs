// api/billing/_lib.mjs — shared billing helpers (CORS, body, stub detection)

export function corsPreflight(req, res) {
  const origin = process.env.CORS_ORIGIN || 'https://yourdeputy.com';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Stripe-Signature, x-admin-key');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function methodGuard(req, res, allowed) {
  if (!allowed.includes(req.method)) {
    res.status(405).json({ error: `${allowed.join(', ')} only` });
    return false;
  }
  return true;
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (chunk) => { buf += chunk; });
    req.on('end', () => {
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

export async function readRawBody(req) {
  // For Stripe webhook signature verification we need the raw bytes.
  if (typeof req.body === 'string') return req.body;
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (chunk) => { buf += chunk; });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

export function getStripeConfig() {
  // Read DYNASTY_TOOL_CONFIG (per root CLAUDE.md) for stripe_live.
  let config = {};
  try { config = JSON.parse(process.env.DYNASTY_TOOL_CONFIG || '{}'); } catch (_) { /* ignore */ }
  const stripe_secret = process.env.STRIPE_SECRET_KEY || config.payments?.stripe_live || null;
  const webhook_secret = process.env.STRIPE_WEBHOOK_SECRET || config.payments?.stripe_webhook_secret || null;
  return { stripe_secret, webhook_secret };
}

export function stripEnabled() {
  const { stripe_secret } = getStripeConfig();
  return !!stripe_secret && !stripe_secret.startsWith('EXPIRED') && !stripe_secret.startsWith('STUB');
}
