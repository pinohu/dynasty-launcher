import { getHealth } from '../../lib/oie/storage/repository.ts';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const health = getHealth();
  return res.status(200).json({
    status: health.fallbackRate > 0.2 ? 'degraded' : 'ok',
    avgScore: health.avgScore,
    fallbackRate: health.fallbackRate,
    lastOptimizationRun: health.lastOptimizationRun,
  });
}
