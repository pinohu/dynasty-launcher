const state = globalThis.__scoringHealthState || {
  lastScore: 0,
  fallbackCount: 0,
  totalCount: 0,
  failureCount: 0,
};

globalThis.__scoringHealthState = state;

export function recordScoringMetric({ finalScore, fallbackUsed, failed }) {
  state.totalCount += 1;
  state.lastScore = Number.isFinite(finalScore) ? finalScore : 0;
  if (fallbackUsed) state.fallbackCount += 1;
  if (failed) state.failureCount += 1;
}

export function getScoringHealth() {
  const fallbackRate = state.totalCount ? state.fallbackCount / state.totalCount : 0;
  return {
    status: state.failureCount > 0 || fallbackRate > 0.2 ? 'degraded' : 'ok',
    lastScore: state.lastScore,
    fallbackRate,
    failureCount: state.failureCount,
  };
}
