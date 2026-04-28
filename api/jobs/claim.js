import { readBody } from '../billing/_lib.mjs';
import { adminCorsHeaders, verifyAdminCredential } from '../tenants/_auth.mjs';
import { claimNextJob, listJobs } from './_store.mjs';

export const maxDuration = 30;

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', adminCorsHeaders());
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ ok: false, error: 'GET, POST only' });
  }
  const auth = verifyAdminCredential(req);
  if (!auth.ok) return res.status(auth.status || 401).json({ ok: false, error: auth.error });

  try {
    if (req.method === 'GET') {
      const jobs = await listJobs({
        status: req.query?.status || null,
        queue: req.query?.queue || null,
        limit: req.query?.limit || 100,
      });
      return res.status(200).json({ ok: true, jobs });
    }
    const body = await readBody(req, { maxBytes: 50000 });
    const job = await claimNextJob(body || {});
    return res.status(200).json({ ok: true, job });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'claim_failed' });
  }
}
