import { fallbackScore } from './fallback.ts';
import { OIEAdjustmentSchema, OIEScoreSchema, type OIEAdjustment, type OIEScore } from './schema.ts';

export function safeParseAdjustment(raw: unknown): OIEAdjustment {
  try {
    return OIEAdjustmentSchema.parse(raw);
  } catch (err) {
    console.error('OIE_ADJUSTMENT_PARSE_ERROR', { err, raw });
    return { adjustment: 0, confidence: 0.1, reasoning: 'Adjustment parse fallback' };
  }
}

export function safeParseScore(raw: unknown): OIEScore {
  try {
    return OIEScoreSchema.parse(raw);
  } catch (err) {
    console.error('OIE_SCORE_PARSE_ERROR', { err, raw });
    return fallbackScore();
  }
}
