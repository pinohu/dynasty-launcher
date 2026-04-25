import { corsPreflight, methodGuard } from '../tenants/_lib.mjs';
import { getDemoTrace } from './_runtime.mjs';

export const maxDuration = 10;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['GET'])) return;

  const run_id = req.query?.run_id || req.query?.id;
  if (!run_id) return res.status(400).json({ error: 'run_id required' });

  const trace = getDemoTrace(run_id);
  if (!trace) return res.status(404).json({ error: 'demo_trace_not_found' });
  return res.status(200).json({ trace });
}

