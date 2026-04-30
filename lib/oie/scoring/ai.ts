import { generateTyped } from '../../../api/ai-sdk.js';
import { safeParseAdjustment } from './parse.ts';

const PROMPT = `You MUST return valid JSON ONLY. No text outside JSON.\n\nSchema:\n{\n  "adjustment": number (-20 to 20),\n  "confidence": number (0 to 1),\n  "reasoning": string\n}`;

export async function computeAiAdjustment(input: { idea: string; baseScore: number; model?: string; sessionId?: string; userId?: string }) {
  const prompt = `${PROMPT}\n\nIdea: ${input.idea}\nBase score: ${input.baseScore}\nReturn conservative bounded adjustment only.`;
  try {
    const out = await generateTyped({
      schemaName: 'oie_adjustment',
      prompt,
      model: input.model || 'gemini-2.0-flash',
      sessionId: input.sessionId,
      userId: input.userId,
      maxTokens: 500,
      traceName: 'oie:adjustment',
    });
    if (!out.ok) {
      return { raw: out, parsed: { adjustment: 0, confidence: 0.1, reasoning: 'AI generation failed' }, fallbackUsed: true };
    }
    const parsed = safeParseAdjustment(out.object);
    return { raw: out.object, parsed, fallbackUsed: false };
  } catch (err) {
    console.error('OIE_AI_ADJUSTMENT_ERROR', { err, input });
    return { raw: null, parsed: { adjustment: 0, confidence: 0.1, reasoning: 'AI exception fallback' }, fallbackUsed: true };
  }
}
