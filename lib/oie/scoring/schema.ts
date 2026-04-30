import { z } from 'zod';

const finite = z.coerce.number().refine((n) => Number.isFinite(n) && !Number.isNaN(n), 'Must be finite');
const pct = finite.pipe(z.number().min(0).max(100));

export const OIEInputSchema = z.object({
  ideaId: z.string().min(1),
  idea: z.string().min(1),
  demand: pct,
  competition: pct,
  monetization: pct,
  feasibility: pct,
});

export const OIEAdjustmentSchema = z.object({
  adjustment: z.coerce.number().pipe(z.number().min(-20).max(20)).refine((n) => Number.isFinite(n) && !Number.isNaN(n)),
  confidence: z.coerce.number().pipe(z.number().min(0).max(1)).refine((n) => Number.isFinite(n) && !Number.isNaN(n)),
  reasoning: z.string().min(1),
});

export const OIEScoreSchema = z.object({
  baseScore: pct,
  adjustment: z.number().min(-20).max(20),
  confidence: z.number().min(0).max(1),
  finalScore: pct,
  reasoning: z.string(),
  fallbackUsed: z.boolean().default(false),
});

export type OIEInput = z.infer<typeof OIEInputSchema>;
export type OIEScore = z.infer<typeof OIEScoreSchema>;
export type OIEAdjustment = z.infer<typeof OIEAdjustmentSchema>;
