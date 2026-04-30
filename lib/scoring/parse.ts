import { fallbackScore } from './fallback.ts';
import { IdeaScoreSchema, type IdeaScore } from './schema.ts';

export function safeParseScore(raw: unknown): IdeaScore {
  try {
    return IdeaScoreSchema.parse(raw);
  } catch (err) {
    console.error('SCORING_PARSE_ERROR', { err, raw });
    return fallbackScore();
  }
}

export function parseAiScorePayload(rawAiOutput: string): { parsed: IdeaScore; raw: unknown; fallbackUsed: boolean } {
  let decoded: unknown = rawAiOutput;
  try {
    decoded = JSON.parse(rawAiOutput);
  } catch (err) {
    console.error('SCORING_AI_JSON_ERROR', { err, rawAiOutput });
  }
  const parsed = safeParseScore(decoded);
  return {
    parsed,
    raw: decoded,
    fallbackUsed: parsed.reasoning === fallbackScore().reasoning && parsed.confidence === 0.1,
  };
}
