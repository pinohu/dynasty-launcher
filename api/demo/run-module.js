import { corsPreflight, methodGuard, readBody } from '../tenants/_lib.mjs';
import { runDemoUnit } from './_runtime.mjs';

export const maxDuration = 60;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;

  let body;
  try { body = await readBody(req); } catch {
    return res.status(400).json({ error: 'invalid_json' });
  }

  try {
    const trace = await runDemoUnit(body || {});
    return res.status(200).json({ trace });
  } catch (err) {
    const message = String(err.message || err);
    const status = message.includes('required') ? 400 : 500;
    return res.status(status).json({ error: 'demo_run_failed', details: message });
  }
}

