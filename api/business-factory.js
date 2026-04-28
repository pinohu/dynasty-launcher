import { runBusinessFactory } from './_business_factory.mjs';
import { enqueueJob } from './jobs/_store.mjs';
import { adminCorsHeaders, verifyAdminCredential } from './tenants/_auth.mjs';

export const maxDuration = 60;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', adminCorsHeaders());
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  const auth = verifyAdminCredential(req);
  if (!auth.ok) return res.status(auth.status || 401).json({ ok: false, error: auth.error });

  try {
    const report = runBusinessFactory(req.body || {});
    let job = null;
    if (req.body?.enqueue_job === true && report.status !== 'blocked') {
      job = await enqueueJob({
        type: 'business_factory.launch',
        queue: 'factory',
        priority: 90,
        idempotency_key: `business_factory:${report.idea.slug}:${req.body?.mode || 'dry_run'}`,
        payload: {
          run_id: report.run_id,
          idea: report.idea,
          launch_manifest: report.launch_manifest,
          deployment: report.deployment,
          revenue: report.revenue,
          agents: report.agents,
        },
      });
    }
    const code = report.status === 'blocked' && req.body?.mode === 'launch' ? 409 : 200;
    return res.status(code).json(job ? { ...report, queued_job: job } : report);
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_business_factory_input',
        details: error.flatten(),
      });
    }
    return res.status(500).json({
      ok: false,
      error: error?.message || 'business_factory_failed',
    });
  }
}
