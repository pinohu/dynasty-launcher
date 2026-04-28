import { corsPreflight, methodGuard, readBody } from '../tenants/_lib.mjs';
import { runDemoUnit } from './_runtime.mjs';

export const maxDuration = 60;
const DEMO_RUN_ATTEMPTS = new Map();
const DEMO_RUN_MAX = 30;
const DEMO_RUN_WINDOW_MS = 10 * 60 * 1000;
const MAX_DEMO_RUN_BODY_BYTES = 50_000;

function clientIp(req) {
  const xf = (req.headers?.['x-forwarded-for'] || '').toString();
  return xf.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const existing = DEMO_RUN_ATTEMPTS.get(ip);
  if (!existing || now - existing.windowStart > DEMO_RUN_WINDOW_MS) {
    DEMO_RUN_ATTEMPTS.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  existing.count += 1;
  if (DEMO_RUN_ATTEMPTS.size > 5000) {
    for (const [key, value] of DEMO_RUN_ATTEMPTS) {
      if (now - value.windowStart > DEMO_RUN_WINDOW_MS) DEMO_RUN_ATTEMPTS.delete(key);
    }
  }
  return existing.count > DEMO_RUN_MAX;
}

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;
  if (isRateLimited(req)) {
    res.setHeader('Retry-After', '600');
    return res.status(429).json({ error: 'too_many_demo_runs' });
  }

  let body;
  try { body = await readBody(req, { maxBytes: MAX_DEMO_RUN_BODY_BYTES }); } catch (err) {
    if (err?.code === 'payload_too_large') return res.status(413).json({ error: 'payload_too_large' });
    return res.status(400).json({ error: 'invalid_json' });
  }

  try {
    const trace = await runDemoUnit(body || {});
    return res.status(200).json({ trace });
  } catch (err) {
    const message = String(err.message || err);
    const status = /required|invalid|too long|payload/.test(message) ? 400 : 500;
    return res.status(status).json({ error: 'demo_run_failed', details: message });
  }
}

