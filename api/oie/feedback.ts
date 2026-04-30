import { collectFeedback } from '../../lib/oie/feedback/collector.ts';
import { runWeightOptimization } from '../../lib/oie/feedback/optimizer.ts';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const record = collectFeedback(req.body || {});
    const optimization = runWeightOptimization();
    return res.status(200).json({ ok: true, record, optimization });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message || 'feedback_failed' });
  }
}
