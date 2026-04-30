import type { IdeaScore } from './schema.ts';

export function fallbackScore(): IdeaScore {
  return {
    score: 50,
    breakdown: {
      demand: 50,
      competition: 50,
      monetization: 50,
      feasibility: 50,
    },
    reasoning: 'Fallback score applied due to parsing or execution failure',
    confidence: 0.1,
  };
}
