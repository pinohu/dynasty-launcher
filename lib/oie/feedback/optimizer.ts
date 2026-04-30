import { getCurrentWeights, setCurrentWeights } from '../scoring/base.ts';
import { listIdeaRecords, markOptimizationRun } from '../storage/repository.ts';

export function runWeightOptimization() {
  const records = listIdeaRecords().filter((r) => Number.isFinite(r.finalScore) && Number.isFinite(r.performanceScore));
  if (records.length < 2) return { updated: false, reason: 'insufficient_data', weights: getCurrentWeights() };

  const meanFinal = records.reduce((a, r) => a + r.finalScore, 0) / records.length;
  const meanPerf = records.reduce((a, r) => a + (r.performanceScore || 0), 0) / records.length;

  const highHigh = records.filter((r) => r.finalScore >= meanFinal && (r.performanceScore || 0) >= meanPerf).length;
  const highLow = records.filter((r) => r.finalScore >= meanFinal && (r.performanceScore || 0) < meanPerf).length;

  const mismatch = highLow - highHigh;
  const current = getCurrentWeights();
  const delta = Math.max(-0.03, Math.min(0.03, mismatch * 0.005));
  const next = {
    ...current,
    monetization: Math.max(0.15, Math.min(0.5, current.monetization - delta)),
    demand: Math.max(0.15, Math.min(0.5, current.demand + delta / 2)),
    feasibility: Math.max(0.1, Math.min(0.4, current.feasibility + delta / 2)),
  };
  next.competition = Math.max(0.1, Math.min(0.35, 1 - (next.demand + next.monetization + next.feasibility)));
  setCurrentWeights(next);
  markOptimizationRun();
  return { updated: true, weights: next, analyzed: records.length };
}
