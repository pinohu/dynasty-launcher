import type { OIEScore } from './schema.ts';

export function fallbackScore(reasoning = 'Fallback score applied due to scoring failure'): OIEScore {
  return {
    baseScore: 50,
    adjustment: 0,
    confidence: 0.1,
    finalScore: 50,
    reasoning,
    fallbackUsed: true,
  };
}
