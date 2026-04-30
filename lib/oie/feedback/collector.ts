import { computePerformanceScore } from './performance.ts';
import { getIdeaRecord, saveIdeaRecord } from '../storage/repository.ts';

export function collectFeedback(input: { ideaId: string; leads?: number; conversions?: number; revenue?: number; timeToRevenue?: number }) {
  const existing = getIdeaRecord(input.ideaId);
  if (!existing) throw new Error('idea_not_found');
  const performanceScore = computePerformanceScore(input);
  return saveIdeaRecord({ ...existing, leads: input.leads, conversions: input.conversions, revenue: input.revenue, timeToRevenue: input.timeToRevenue, performanceScore });
}
