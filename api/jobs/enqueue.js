import { readBody } from '../billing/_lib.mjs';
import { adminCorsHeaders, verifyAdminCredential } from '../tenants/_auth.mjs';
import { enqueueJob } from './_store.mjs';

export const maxDuration = 30;

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', adminCorsHeaders());
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const auth = verifyAdminCredential(req);
  if (!auth.ok) return res.status(auth.status || 401).json({ ok: false, error: auth.error });

  try {
    const body = await readBody(req, { maxBytes: 250000 });
    const job = await enqueueJob(body || {});
    return res.status(200).json({ ok: true, job });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ ok: false, error: 'invalid_job', details: error.flatten() });
    }
    return res.status(500).json({ ok: false, error: error?.message || 'enqueue_failed' });
  }
}
