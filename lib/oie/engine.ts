import { computeBaseScore } from './scoring/base.ts';
import { computeAiAdjustment } from './scoring/ai.ts';
import { computeFinalScore } from './scoring/aggregate.ts';
import { fallbackScore } from './scoring/fallback.ts';
import { OIEInputSchema, OIEScoreSchema } from './scoring/schema.ts';
import { saveIdeaRecord, recordScoreMetric } from './storage/repository.ts';

export async function runOIE(input: unknown) {
  let fallbackUsed = false;
  let aiRaw = null;
  try {
    const parsedInput = OIEInputSchema.parse(input);
    const baseScore = computeBaseScore(parsedInput);
    const ai = await computeAiAdjustment({ idea: parsedInput.idea, baseScore, sessionId: parsedInput.ideaId });
    aiRaw = ai.raw;
    const adj = ai.parsed;
    const finalScore = computeFinalScore(baseScore, adj.adjustment, adj.confidence);
    const result = OIEScoreSchema.parse({
      baseScore,
      adjustment: adj.adjustment,
      confidence: adj.confidence,
      finalScore,
      reasoning: adj.reasoning,
      fallbackUsed: ai.fallbackUsed,
    });
    fallbackUsed = ai.fallbackUsed;
    saveIdeaRecord({ id: parsedInput.ideaId, idea: parsedInput.idea, ...result });
    recordScoreMetric(result.finalScore, fallbackUsed);
    console.log('OIE_EVENT', { stage: 'OIE', input: parsedInput, baseScore, aiRaw, parsedAI: adj, finalScore, fallbackUsed });
    return result;
  } catch (err) {
    const fallback = fallbackScore('OIE fallback due to scoring pipeline failure');
    recordScoreMetric(fallback.finalScore, true);
    console.error('OIE_ENGINE_ERROR', { err, input, aiRaw });
    console.log('OIE_EVENT', { stage: 'OIE', input, baseScore: fallback.baseScore, aiRaw, parsedAI: null, finalScore: fallback.finalScore, fallbackUsed: true });
    return fallback;
  }
}
