/**
 * 8.01 — Welcome Sequence (Stripe webhook ingress).
 * Verifies signature, extracts tier, signs a follow-up request, and hits
 * the tenant's n8n webhook which does the multi-channel fanout.
 */
import crypto from 'node:crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const rawBody = await readRawBody(req);
  const sigHeader = req.headers['stripe-signature'] || '';
  if (!verifyStripeSignature(rawBody, sigHeader, process.env.STRIPE_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'bad signature' });
  }
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'bad body' });
  }
  if (event.type !== 'checkout.session.completed') {
    return res.status(202).json({ ignored: event.type });
  }
  const session = event.data.object;
  const tierKey = (session.metadata && session.metadata.tier) || 'starter';
  const mapping = safeJson(process.env.TIER_MAPPING) || {};
  const templateSlug = mapping[tierKey] || 'welcome-default';

  const payload = {
    email: session.customer_details?.email,
    name: session.customer_details?.name,
    amount: session.amount_total,
    tier: tierKey,
    template_slug: templateSlug,
    portal_url: process.env.PORTAL_URL,
  };
  const bodyStr = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', process.env.N8N_INBOUND_HMAC).update(bodyStr).digest('hex');

  const n8nUrl = process.env.N8N_WEBHOOK_URL_WELCOME;
  if (!n8nUrl) return res.status(500).json({ error: 'n8n webhook url missing' });
  await fetch(n8nUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature-256': `sha256=${hmac}` },
    body: bodyStr,
  });
  return res.status(200).json({ ok: true });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyStripeSignature(body, sigHeader, secret) {
  if (!secret || !sigHeader) return false;
  const parts = Object.fromEntries(sigHeader.split(',').map((p) => p.split('=')));
  const signedPayload = `${parts.t}.${body.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1 || ''));
  } catch {
    return false;
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
