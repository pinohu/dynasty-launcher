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

// ── Offer Intelligence Engine (OIE) I/O contracts ──────────────────────────
export const OfferIntelligenceInput = z.object({
  topic: z.string().min(1),
  pain_signals: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  market_type: z.string().default(''),
  delivery_preference: z.string().default(''),
  risk_tolerance: z.string().default(''),
  price_floor: z.string().default(''),
  time_to_ship_limit_days: z.number().int().positive().max(90).default(14),
  allow_liability_categories: z.boolean().default(false),
  allow_identity_risk: z.boolean().default(false),
  portfolio_role: z.string().default(''),
  upsell_role: z.string().default(''),
  authority_role: z.string().default(''),
  operator_override: z.boolean().optional().default(false),
  override_reason: z.string().optional().default(''),
});

export const OfferIntelligenceOutput = z.object({
  model_version: z.literal('v1.0'),
  topic: z.string(),
  opportunity_score: z.number().min(0).max(100),
  pain_score: z.number().min(0).max(100),
  saturation_score: z.number().min(0).max(100),
  refund_risk: z.enum(['low', 'medium', 'high']),
  liability_risk: z.enum(['low', 'medium', 'high']),
  identity_risk: z.enum(['low', 'medium', 'high']),
  time_to_ship_score: z.number().min(0).max(100),
  authority_fit: z.enum(['low', 'medium', 'high']),
  buyer_analysis: z.object({
    primary_buyer: z.string(),
    economic_buyer: z.string(),
    technical_user: z.string(),
    emotional_buyer: z.string(),
  }),
  best_delivery_format: z.string(),
  best_lead_magnet: z.object({
    type: z.string(),
    title: z.string(),
    why_it_converts: z.string(),
  }),
  recommended_price: z.string(),
  price_reasoning: z.string(),
  category: z.string(),
  ascension_path: z.array(z.string()),
  competitive_advantage: z.string(),
  why_our_version_wins: z.string(),
  do_not_build_if: z.array(z.string()),
  build_decision: z.enum(['BUILD', 'DO_NOT_BUILD']),
  operator_override: z.boolean(),
  override_reason: z.string(),
  evidence: z.array(z.record(z.any())),
  judgment: z.record(z.any()),
  decision: z.record(z.any()),
});

export const OfferIntelligenceSchema = {
  input: OfferIntelligenceInput,
  output: OfferIntelligenceOutput,
};


export const OIEAdjustment = z.object({
  adjustment: z.number().min(-20).max(20),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export const SCHEMAS = {
  viability: ViabilityScorecard,
  pivot: PivotProposal,
  cross_review: CrossReview,
  synthesis: FrameworkSynthesis,
  build_diagnostic: VercelBuildDiagnostic,
  devils_critique: DevilsCritique,
  offer_intelligence: OfferIntelligenceOutput,
  oie_adjustment: OIEAdjustment,
};
