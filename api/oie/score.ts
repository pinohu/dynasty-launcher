import { runOIE } from '../../lib/oie/engine.ts';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const result = await runOIE(req.body || {});
  return res.status(200).json(result);
}
