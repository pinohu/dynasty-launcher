import { corsPreflight, methodGuard, readBody } from '../tenants/_lib.mjs';
import { createDemoSession } from './_runtime.mjs';

export const maxDuration = 30;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;

  let body;
  try { body = await readBody(req); } catch {
    return res.status(400).json({ error: 'invalid_json' });
  }

  try {
    const session = await createDemoSession(body || {});
    return res.status(201).json({ session });
  } catch (err) {
    return res.status(500).json({ error: 'demo_session_failed', details: String(err.message || err) });
  }
}

