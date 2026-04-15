/**
 * 15.01 — Invoice auto-gen Stripe ingress.
 * Same shape as 8.01: verify Stripe signature → sign + forward to n8n.
 */
import crypto from 'node:crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const rawBody = await readRawBody(req);
  if (!verifyStripeSignature(rawBody, req.headers['stripe-signature'] || '', process.env.STRIPE_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'bad signature' });
  }
  const event = JSON.parse(rawBody.toString('utf8'));
  if (event.type !== 'payment_intent.succeeded') return res.status(202).end();

  const pi = event.data.object;
  const payload = {
    customer_email: pi.charges?.data?.[0]?.billing_details?.email || pi.receipt_email,
    customer_name: pi.charges?.data?.[0]?.billing_details?.name || 'Customer',
    amount_cents: pi.amount,
    currency: pi.currency,
    payment_intent_id: pi.id,
    description: pi.description || 'Services',
    business: {
      legal_name: process.env.BUSINESS_LEGAL_NAME,
      tax_id: process.env.BUSINESS_TAX_ID || null,
    },
    template_id: process.env.INVOICE_TEMPLATE_ID,
  };
  const body = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', process.env.N8N_INBOUND_HMAC).update(body).digest('hex');

  await fetch(process.env.N8N_WEBHOOK_URL_INVOICE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature-256': `sha256=${hmac}` },
    body,
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
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1 || '')); } catch { return false; }
}
