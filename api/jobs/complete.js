import { readBody } from '../billing/_lib.mjs';
import { adminCorsHeaders, verifyAdminCredential } from '../tenants/_auth.mjs';
import { completeJob, failJob } from './_store.mjs';

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
    const jobId = String(body?.job_id || '');
    if (!jobId) return res.status(400).json({ ok: false, error: 'job_id_required' });
    const status = String(body?.status || 'completed');
    const job =
      status === 'failed'
        ? await failJob(jobId, body?.error || 'job_failed', {
            retry_delay_ms: Number(body?.retry_delay_ms || 60000),
          })
        : await completeJob(jobId, body?.result || {});
    if (!job) return res.status(404).json({ ok: false, error: 'job_not_found' });
    return res.status(200).json({ ok: true, job });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'complete_failed' });
  }
}
