export function computeFinalScore(baseScore: number, adjustment: number, confidence: number): number {
  const safeBase = Number.isFinite(baseScore) ? baseScore : 50;
  const safeAdj = Number.isFinite(adjustment) ? adjustment : 0;
  const safeConfidence = Number.isFinite(confidence) ? confidence : 0;
  const weighted = safeAdj * Math.max(0, Math.min(1, safeConfidence));
  const final = safeBase + weighted;
  return Math.max(0, Math.min(100, Number.isFinite(final) ? final : 50));
}
