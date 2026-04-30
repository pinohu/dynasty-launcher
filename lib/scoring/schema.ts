import { z } from 'zod';

const parseFractionalNumber = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  const fractionMatch = normalized.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (!fractionMatch) return value;
  const numerator = Number(fractionMatch[1]);
  const denominator = Number(fractionMatch[2]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return Number.NaN;
  return (numerator / denominator) * 100;
};

const finite = (label: string) => z.number().refine((n) => Number.isFinite(n) && !Number.isNaN(n), label);

const boundedScore = z.preprocess(parseFractionalNumber, z.coerce.number().pipe(z.number().min(0).max(100)).pipe(finite('Invalid number')));

export const IdeaScoreSchema = z.object({
  score: boundedScore,
  breakdown: z.object({
    demand: boundedScore,
    competition: boundedScore,
    monetization: boundedScore,
    feasibility: boundedScore,
  }),
  reasoning: z.string().min(1),
  confidence: z.coerce.number().pipe(z.number().min(0).max(1)).pipe(finite('Invalid confidence')).optional(),
});

export type IdeaScore = z.infer<typeof IdeaScoreSchema>;
