import { corsPreflight, methodGuard } from '../tenants/_lib.mjs';
import { getDemoSession } from './_runtime.mjs';

export const maxDuration = 10;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['GET'])) return;

  const session_id = req.query?.session_id || req.query?.id;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });

  const session = getDemoSession(session_id);
  if (!session) return res.status(404).json({ error: 'demo_session_not_found' });
  return res.status(200).json({ session });
}

