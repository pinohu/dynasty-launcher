// Zod schemas for every structured AI output in the build pipeline.
// Every AI call that used to parse JSON with `match(/\{[\s\S]*\}/)` can now
// validate against one of these instead — malformed JSON becomes a typed
// error with actionable detail, not silent drop.
import { z } from 'zod';

// ── Viability scorecard (core 5 dimensions + optional framework analyses) ────
export const ViabilityScorecard = z.object({
  market_hunger: z.object({ score: z.number().min(0).max(10), rationale: z.string() }),
  blue_ocean_index: z.object({ score: z.number().min(0).max(10), rationale: z.string() }),
  competitive_moat: z.object({ score: z.number().min(0).max(10), rationale: z.string() }),
  revenue_confidence: z.object({ score: z.number().min(0).max(10), rationale: z.string() }),
  mvp_feasibility: z.object({ score: z.number().min(0).max(10), rationale: z.string() }),
  composite: z.number().min(0).max(10),
  verdict: z.string(),
  risk_summary: z.string(),
  opportunity_summary: z.string(),
  framework_analyses: z.record(z.string()).optional().default({}),
});

// ── Pivot proposal (Phase 1 of multi-model pivot review) ─────────────────────
export const PivotProposal = z.object({
  pivot_description: z.string(),
  predicted_composite_score: z.number().min(0).max(10),
  key_advantages: z.array(z.string()).min(1).max(8),
  risks: z.array(z.string()).min(1).max(6),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
});

// ── Cross-review ballot (Phase 2) ────────────────────────────────────────────
export const CrossReview = z.object({
  vote: z.string(),
  ratings: z.record(z.union([
    z.number().min(1).max(10),
    z.object({ score: z.number().min(1).max(10), reasoning: z.string().optional() }),
  ])),
  synthesis: z.string(),
});

// ── Cross-framework synthesis (meta-analysis across selected frameworks) ─────
export const FrameworkSynthesis = z.object({
  consensus_signals: z.array(z.string()).max(5),
  contradictions: z.array(z.string()).max(3),
  blind_spots: z.array(z.string()).max(3),
  score_adjustment: z.object({
    direction: z.enum(['up', 'down', 'none']),
    amount: z.number().min(-2).max(2),
    reason: z.string(),
  }),
  synthesis_summary: z.string(),
});

// ── L2 Vercel diagnostic (mirror of client-side parser output shape) ─────────
export const VercelBuildDiagnostic = z.object({
  class: z.enum([
    'module_not_found',
    'missing_dependency',
    'ts_error',
    'syntax_error',
    'env_var_missing',
    'eslint_error',
    'unknown',
  ]),
  orphans: z.array(z.string()).default([]),
  missingPackages: z.array(z.string()).default([]),
  tsErrors: z.array(z.object({ file: z.string(), line: z.number(), col: z.number(), code: z.string(), message: z.string() })).default([]),
  syntaxErrors: z.array(z.object({ file: z.string(), snippet: z.string() })).default([]),
  envVars: z.array(z.string()).default([]),
  eslintIssues: z.array(z.object({ file: z.string(), line: z.number(), col: z.number(), message: z.string() })).default([]),
  rawSnippet: z.string().default(''),
  summary: z.string(),
});

// ── Devil's advocate critique (Phase 4) ──────────────────────────────────────
export const DevilsCritique = z.object({
  market_reality: z.string(),
  moat_weakness: z.string(),
  revenue_fantasy: z.string(),
  founder_blind_spot: z.string(),
  the_killer: z.string(),
});

export const SCHEMAS = {
  viability: ViabilityScorecard,
  pivot: PivotProposal,
  cross_review: CrossReview,
  synthesis: FrameworkSynthesis,
  build_diagnostic: VercelBuildDiagnostic,
  devils_critique: DevilsCritique,
};
