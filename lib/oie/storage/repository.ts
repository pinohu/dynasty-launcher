import type { IdeaRecord, OIEHealthRecord } from './model.ts';

const state = globalThis.__oieRepoState || {
  ideas: new Map<string, IdeaRecord>(),
  health: { totalScores: 0, fallbackCount: 0, avgScore: 0, lastOptimizationRun: null } as OIEHealthRecord,
};
globalThis.__oieRepoState = state;

export function saveIdeaRecord(record: IdeaRecord) {
  const now = new Date().toISOString();
  const prev = state.ideas.get(record.id);
  const next = { ...prev, ...record, updatedAt: now, createdAt: prev?.createdAt || now };
  state.ideas.set(record.id, next);
  return next;
}

export function getIdeaRecord(id: string) { return state.ideas.get(id) || null; }
export function listIdeaRecords() { return Array.from(state.ideas.values()); }

export function recordScoreMetric(finalScore: number, fallbackUsed: boolean) {
  state.health.totalScores += 1;
  if (fallbackUsed) state.health.fallbackCount += 1;
  const n = state.health.totalScores;
  state.health.avgScore = ((state.health.avgScore * (n - 1)) + finalScore) / n;
}

export function markOptimizationRun() { state.health.lastOptimizationRun = new Date().toISOString(); }
export function getHealth() { return { ...state.health, fallbackRate: state.health.totalScores ? state.health.fallbackCount / state.health.totalScores : 0 }; }
