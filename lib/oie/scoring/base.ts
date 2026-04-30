import { OIEInputSchema, type OIEInput } from './schema.ts';

let adaptiveWeights = {
  demand: 0.3,
  competition: 0.2,
  monetization: 0.3,
  feasibility: 0.2,
};

export function getCurrentWeights() {
  return { ...adaptiveWeights };
}

export function setCurrentWeights(next: typeof adaptiveWeights) {
  adaptiveWeights = { ...adaptiveWeights, ...next };
}

export function computeBaseScore(input: Partial<OIEInput>): number {
  try {
    const parsed = OIEInputSchema.parse(input);
    const { demand, competition, monetization, feasibility } = parsed;
    const score = demand * adaptiveWeights.demand + (100 - competition) * adaptiveWeights.competition + monetization * adaptiveWeights.monetization + feasibility * adaptiveWeights.feasibility;
    return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 50;
  } catch (err) {
    console.error('OIE_BASE_SCORE_ERROR', { err, input });
    return 50;
  }
}
