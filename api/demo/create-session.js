import { corsPreflight, methodGuard, readBody } from '../tenants/_lib.mjs';
import { createDemoSession } from './_runtime.mjs';

export const maxDuration = 30;
const DEMO_CREATE_ATTEMPTS = new Map();
const DEMO_CREATE_MAX = 20;
const DEMO_CREATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_DEMO_CREATE_BODY_BYTES = 20_000;

function clientIp(req) {
  const xf = (req.headers?.['x-forwarded-for'] || '').toString();
  return xf.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const existing = DEMO_CREATE_ATTEMPTS.get(ip);
  if (!existing || now - existing.windowStart > DEMO_CREATE_WINDOW_MS) {
    DEMO_CREATE_ATTEMPTS.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  existing.count += 1;
  if (DEMO_CREATE_ATTEMPTS.size > 5000) {
    for (const [key, value] of DEMO_CREATE_ATTEMPTS) {
      if (now - value.windowStart > DEMO_CREATE_WINDOW_MS) DEMO_CREATE_ATTEMPTS.delete(key);
    }
  }
  return existing.count > DEMO_CREATE_MAX;
}

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;
  if (isRateLimited(req)) {
    res.setHeader('Retry-After', '600');
    return res.status(429).json({ error: 'too_many_demo_sessions' });
  }

  let body;
  try { body = await readBody(req, { maxBytes: MAX_DEMO_CREATE_BODY_BYTES }); } catch (err) {
    if (err?.code === 'payload_too_large') return res.status(413).json({ error: 'payload_too_large' });
    return res.status(400).json({ error: 'invalid_json' });
  }

  try {
    const session = await createDemoSession(body || {});
    return res.status(201).json({ session });
  } catch (err) {
    const message = String(err.message || err);
    const status = /required|invalid|too long|payload/.test(message) ? 400 : 500;
    return res.status(status).json({ error: 'demo_session_failed', details: message });
  }
}

