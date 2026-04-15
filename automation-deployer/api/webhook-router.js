/**
 * POST /api/webhook-router/:automation_id
 *
 * Inbound webhook with HMAC-SHA256 verification. Does NOT store the payload.
 * Routes to the tenant's registered endpoint after verifying the signature.
 *
 * This handler exists so automation vendors (Stripe, form tools, etc.) can
 * point at a single deployer-controlled URL and we fan out to per-tenant
 * endpoints. Many automations will skip this and let the tenant host the
 * webhook directly — this is opt-in.
 */
import crypto from 'node:crypto';
import { requireAuth } from './_auth.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const automationId = (req.query?.automation_id || '').trim();
  if (!/^\d{1,2}\.\d{2}$/.test(automationId)) {
    res.status(400).json({ error: 'automation_id required in query string' });
    return;
  }
  const signature = req.headers['x-signature-256'];
  const secret = process.env.WEBHOOK_HMAC_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'server missing WEBHOOK_HMAC_SECRET' });
    return;
  }
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  if (!signature || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)))) {
    res.status(401).json({ error: 'bad signature' });
    return;
  }
  // At this point we'd forward to tenant's registered endpoint.
  // For safety/boundary we only respond with ack + metadata.
  res.status(200).json({
    ok: true,
    automation_id: automationId,
    forwarded: false,
    note: 'Payload verified but not forwarded by this stub. Fill in forwarding to tenant endpoint based on tenant registry.',
  });
}
