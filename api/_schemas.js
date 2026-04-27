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

// ── Offer Intelligence Engine ───────────────────────────────────────────────
// Strategic decision engine. Evaluates whether a product opportunity is worth
// building. Output separates EVIDENCE (verifiable proof) from JUDGMENT
// (reasoning) from DECISION (verdict) so operators can audit what drove the
// call. Default stance is reject — most ideas should die.
//
// Versioning: every report carries OFFER_INTELLIGENCE_MODEL_VERSION so
// historical decisions remain comparable when scoring logic evolves. Bump
// this string when thresholds, weights, or the system prompt changes in a
// way that would move opportunity scores.

export const OFFER_INTELLIGENCE_MODEL_VERSION = 'oie-1.0.0';

export const PortfolioRole = z.enum([
  'flagship_authority',
  'low_ticket_tripwire',
  'backend_ascension',
  'diagnostic_lead_magnet',
  'recurring_retainer_feeder',
  'unassigned',
]);

export const UpsellRole = z.enum([
  'entry_point',
  'core_offer',
  'profit_maximizer',
  'backend_upsell',
  'continuity',
  'none',
]);

export const AuthorityRole = z.enum([
  'flagship',
  'supporting',
  'proof_generator',
  'distribution',
  'none',
]);

export const RiskLevel = z.enum(['low', 'medium', 'high']);
export const Strength = z.enum(['weak', 'moderate', 'strong']);

export const DeliveryFormat = z.enum([
  'pdf',
  'template_pack',
  'calculator',
  'spreadsheet',
  'workflow_pack',
  'audit',
  'service',
  'mini_app',
  'diagnostic_tool',
  'other',
]);

export const LeadMagnetType = z.enum([
  'diagnostic_scorecard',
  'cost_calculator',
  'failure_audit_checklist',
  'swipe_file',
  'tool_kill_matrix',
  'decision_tree',
  'sop_mini_pack',
  'competitive_benchmark',
  'other',
]);

export const OfferCategory = z.enum([
  'cost_control',
  'revenue_failure',
  'launch_failure_prevention',
  'operational_recovery',
  'waste_elimination',
  'compliance_survival',
  'other',
]);

// Source-trust ranking per OIE spec §13. Paid review complaints / refund
// threads / high-view unresolved issues rank highest; random Reddit lowest.
export const EvidenceSourceType = z.enum([
  'paid_review_complaint',
  'refund_discussion',
  'unresolved_issue_high_views',
  'github_issue_high_reactions',
  'stack_overflow_unanswered',
  'forum_complaint_recurring',
  'support_ticket_pattern',
  'operator_firsthand_observation',
  'reddit_thread',
  'tweet_or_post',
  'other',
]);

export const EvidenceItem = z.object({
  source_type: EvidenceSourceType,
  summary: z.string().max(500),
  url_or_reference: z.string().max(500),
  trust_weight: z.enum(['high', 'medium', 'low']),
  supports_score: z.string().max(80),
});

// Input envelope the caller submits to /api/offer-intelligence (action=run).
export const OfferIntelligenceInput = z.object({
  topic: z.string().min(3).max(400),
  pain_signals: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  market_type: z.string().default(''),
  delivery_preference: z.string().default(''),
  risk_tolerance: RiskLevel.default('low'),
  price_floor: z.union([z.number(), z.string()]).default(''),
  time_to_ship_limit_days: z.number().int().min(1).max(365).default(14),
  allow_liability_categories: z.boolean().default(false),
  allow_identity_risk: z.boolean().default(false),
  portfolio_role: PortfolioRole.default('unassigned'),
});

export const PainOpportunity = z.object({
  rank: z.number().int().min(1).max(10),
  name: z.string(),
  opportunity_score: z.number().min(0).max(100),
  pain_score: z.number().min(0).max(20),
  saturation_score: z.number().min(0).max(100),
  refund_risk: RiskLevel,
  liability_risk: RiskLevel,
  identity_risk: RiskLevel,
  time_to_ship_days: z.number().int().min(0).max(365),
  authority_fit: RiskLevel,
  rationale: z.string().max(1200),
  evidence_ids: z.array(z.number().int().nonnegative()).default([]),
});

// Why-this-wins is mandatory. If the model can't articulate a strong reason,
// it's required to flag strength: 'weak' and add 'weak_competitive_advantage'
// to kill_flags_triggered — which forces a DO_NOT_BUILD verdict.
export const WhyThisWins = z.object({
  claim: z.string().max(600),
  strength: Strength,
  rationale: z.string().max(1200),
  unfair_advantage: z.string().max(600),
});

// Low-end competitor trap scan. Cheap Gumroad PDFs, Etsy packs, low-quality
// Kindle books, template sellers — all destroy pricing power even at low
// quality. Spec §12.
export const LowEndCompetitor = z.object({
  platform: z.enum(['gumroad', 'etsy', 'amazon_kindle', 'template_marketplace', 'fiverr', 'youtube_free', 'other']),
  example_title: z.string().max(300),
  estimated_price_usd: z.number().nonnegative().max(10000),
  quality_signal: z.string().max(300),
  pricing_power_impact: z.string().max(400),
});

// Identity safety as first-class score (spec §13). Separate from the
// per-opportunity identity_risk — this evaluates deanonymization risk of
// the CATEGORY, not just one variant.
export const IdentitySafety = z.object({
  score: z.number().min(0).max(10),
  analysis: z.string().max(800),
  collision_vectors: z.array(z.string()).default([]),
  mitigation: z.string().max(600),
});

export const VanityMarketCheck = z.object({
  is_vanity_market: z.boolean(),
  analysis: z.string().max(600),
  specificity_of_operator: z.enum(['highly_specific', 'specific', 'broad', 'vanity']),
});

// Post-launch feedback loop (spec §6). Populated later by the tracking
// subsystem once a product has shipped. Stored as empty shell on decision
// creation so the schema is forward-compatible.
export const PostLaunchTracking = z.object({
  shipped: z.boolean().default(false),
  shipped_at: z.string().nullable().default(null),
  pageviews_30d: z.number().int().nullable().default(null),
  conversion_rate: z.number().nullable().default(null),
  refund_rate: z.number().nullable().default(null),
  review_quality_avg: z.number().nullable().default(null),
  support_friction_events: z.number().int().nullable().default(null),
  upsell_conversion_rate: z.number().nullable().default(null),
  predicted_vs_actual_delta: z.number().nullable().default(null),
  notes: z.string().default(''),
});

export const OfferIntelligenceReport = z.object({
  model_version: z.string().default(OFFER_INTELLIGENCE_MODEL_VERSION),
  topic: z.string(),

  // ── EVIDENCE (verifiable proof; never mixed with judgment) ─────────────────
  evidence: z.array(EvidenceItem).min(0).max(25),

  // ── JUDGMENT (reasoning layer; references evidence by index) ───────────────
  judgment: z.object({
    top_pain_opportunities: z.array(PainOpportunity).min(1).max(10),
    buyer_analysis: z.object({
      primary_buyer: z.string(),
      economic_buyer: z.string(),
      technical_user: z.string(),
      emotional_buyer: z.string(),
    }),
    vanity_market_check: VanityMarketCheck,
    identity_safety: IdentitySafety,
    low_end_competitors: z.array(LowEndCompetitor).max(10),
    why_this_wins: WhyThisWins,
  }),

  // ── DECISION (verdict and ship recommendations) ────────────────────────────
  decision: z.object({
    build_decision: z.enum(['BUILD', 'DO_NOT_BUILD']),
    build_decision_reason: z.string().max(1200),
    kill_flags_triggered: z.array(z.string()).default([]),
    best_delivery_format: z.object({
      format: DeliveryFormat,
      rationale: z.string().max(800),
      rejected_formats: z.array(z.string()).default([]),
    }),
    best_lead_magnet: z.object({
      type: LeadMagnetType,
      title: z.string(),
      why_it_converts: z.string().max(800),
    }),
    // Pricing anchors to cost_of_staying_broken, NOT comp pricing (spec §10).
    best_price: z.object({
      amount_usd: z.number().nonnegative().max(99999),
      cost_of_staying_broken_monthly_usd: z.number().nonnegative().max(1_000_000),
      rationale: z.string().max(800),
    }),
    category: OfferCategory,
    ascension_path: z.object({
      lead_magnet: z.string(),
      core_paid_product: z.string(),
      audit: z.string(),
      dfy_service: z.string(),
      retainer: z.string(),
    }),
    portfolio_metadata: z.object({
      portfolio_role: PortfolioRole,
      upsell_role: UpsellRole,
      authority_role: AuthorityRole,
    }),
    competitive_advantage: z.string().max(1200),
    do_not_build_if: z.array(z.string()).min(1).max(12),
  }),

  // ── SCORING (explicit weighted rubric; sums to opportunity_score) ──────────
  scoring: z.object({
    pain_intensity: z.number().min(0).max(20),
    purchase_intent: z.number().min(0).max(15),
    authority_fit: z.number().min(0).max(15),
    market_saturation: z.number().min(0).max(10),
    refund_risk: z.number().min(0).max(10),
    liability_risk: z.number().min(0).max(5),
    identity_risk: z.number().min(0).max(5),
    time_to_ship: z.number().min(0).max(10),
    ascension_potential: z.number().min(0).max(5),
    lead_magnet_strength: z.number().min(0).max(5),
    opportunity_score: z.number().min(0).max(100),
  }),

  // ── POST-LAUNCH (feedback loop; empty shell at creation) ───────────────────
  post_launch_tracking: PostLaunchTracking,
});

// ── Outline (for the product the OIE approved) ──────────────────────────────
// Generated ONLY after OIE approval. Shape is format-agnostic so a PDF,
// calculator, or workflow pack can share the same outline contract.
export const OfferOutline = z.object({
  decision_id: z.number().int().nonnegative(),
  topic: z.string(),
  title: z.string().max(200),
  subtitle: z.string().max(300),
  target_reader: z.string().max(400),
  promise: z.string().max(400),
  delivery_format: DeliveryFormat,
  override_warning: z.string().default(''),
  sections: z.array(z.object({
    number: z.number().int().min(1).max(30),
    heading: z.string().max(200),
    purpose: z.string().max(400),
    key_points: z.array(z.string().max(400)).min(1).max(10),
    artifacts: z.array(z.string().max(200)).default([]),
    estimated_words: z.number().int().min(0).max(10000),
  })).min(3).max(20),
  proof_artifacts_required: z.array(z.string().max(300)).min(1).max(15),
  ctas: z.object({
    lead_magnet_cta: z.string().max(300),
    core_offer_cta: z.string().max(300),
    ascension_cta: z.string().max(300),
  }),
  estimated_total_words: z.number().int().min(0).max(100000),
  sourcing_notes: z.string().max(1200),
});

// ── Portfolio Allocation Engine (PAE) ───────────────────────────────────────
// Phase 2 of OIE. Reads approved/shipped decisions, computes the current
// product mix, and recommends next builds (or kills) so the operator runs
// a balanced portfolio instead of a pile of similar offers. AI-driven gap
// analysis on top of deterministic counts — like an investment-committee
// portfolio review, not a brainstorm.

export const PORTFOLIO_ALLOCATOR_VERSION = 'pae-1.0.0';

// Deterministic snapshot of the current portfolio. Computed from the DB
// without AI, so two consecutive calls yield identical numbers. Embedded
// inside PortfolioAllocation as the input the AI reasoned about.
export const PortfolioCurrentState = z.object({
  total_decisions: z.number().int().nonnegative(),
  approved_count: z.number().int().nonnegative(),
  shipped_count: z.number().int().nonnegative(),
  pending_count: z.number().int().nonnegative(),
  rejected_count: z.number().int().nonnegative(),
  do_not_build_count: z.number().int().nonnegative(),
  override_count: z.number().int().nonnegative(),
  by_portfolio_role: z.record(z.number().int().nonnegative()),
  by_upsell_role: z.record(z.number().int().nonnegative()),
  by_authority_role: z.record(z.number().int().nonnegative()),
  by_category: z.record(z.number().int().nonnegative()),
  by_delivery_format: z.record(z.number().int().nonnegative()),
  identity_risk_concentration: z.object({
    low: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
  }),
  avg_opportunity_score: z.number().min(0).max(100),
  avg_predicted_vs_actual_delta: z.number().nullable(),
  shipped_with_metrics_count: z.number().int().nonnegative(),
});

export const NextBuildAction = z.enum([
  'ship_existing_approved',
  'kill_low_performer',
  'run_new_oie_for_gap',
  'reactivate_archived',
  'no_action_needed',
]);

export const RecommendedNextBuild = z.object({
  priority: z.number().int().min(1).max(10),
  action: NextBuildAction,
  decision_id: z.number().int().nonnegative().nullable(),
  title: z.string().max(200),
  portfolio_role: PortfolioRole,
  rationale: z.string().max(800),
  fills_gap: z.string().max(300),
  sequencing_hint: z.string().max(400),
  estimated_capacity_load: z.enum(['low', 'medium', 'high']),
});

export const PortfolioAllocation = z.object({
  model_version: z.string().default(PORTFOLIO_ALLOCATOR_VERSION),
  current_state_snapshot: PortfolioCurrentState,
  target_mix: z.object({
    flagship_authority: z.number().int().nonnegative(),
    low_ticket_tripwire: z.number().int().nonnegative(),
    backend_ascension: z.number().int().nonnegative(),
    diagnostic_lead_magnet: z.number().int().nonnegative(),
    recurring_retainer_feeder: z.number().int().nonnegative(),
  }),
  target_mix_rationale: z.string().max(800),
  gap_analysis: z.object({
    over_concentrated_in: z.array(z.string()).default([]),
    missing_roles: z.array(z.string()).default([]),
    identity_collision_warnings: z.array(z.string()).default([]),
    category_imbalance: z.string().max(600),
    portfolio_health_score: z.number().min(0).max(100),
    summary: z.string().max(1200),
  }),
  recommended_next_builds: z.array(RecommendedNextBuild).min(0).max(10),
  capacity_advice: z.string().max(800),
  confidence: z.number().min(0).max(1),
});

// ── Post-launch metrics (manual entry) ──────────────────────────────────────
// Used by the admin "Record metrics" form when automated collection isn't
// wired up for a given vendor.
export const PostLaunchMetricsEntry = z.object({
  decision_id: z.number().int().positive(),
  shipped: z.boolean().default(true),
  shipped_at: z.string().nullable().default(null),
  pageviews_30d: z.number().int().nullable().default(null),
  conversion_rate: z.number().min(0).max(1).nullable().default(null),
  refund_rate: z.number().min(0).max(1).nullable().default(null),
  review_quality_avg: z.number().min(0).max(5).nullable().default(null),
  support_friction_events: z.number().int().nullable().default(null),
  upsell_conversion_rate: z.number().min(0).max(1).nullable().default(null),
  predicted_vs_actual_delta: z.number().nullable().default(null),
  notes: z.string().max(1200).default(''),
});

// ── Mark Shipped (link an approved decision to vendor IDs for collection) ───
export const MarkShippedInput = z.object({
  decision_id: z.number().int().positive(),
  shipped_url: z.string().max(500).default(''),
  shipped_vercel_project_id: z.string().max(200).default(''),
  shipped_stripe_product_id: z.string().max(200).default(''),
  shipped_posthog_event_prefix: z.string().max(200).default(''),
  shipped_at: z.string().nullable().default(null),
});

export const SCHEMAS = {
  viability: ViabilityScorecard,
  pivot: PivotProposal,
  cross_review: CrossReview,
  synthesis: FrameworkSynthesis,
  build_diagnostic: VercelBuildDiagnostic,
  devils_critique: DevilsCritique,
  offer_intelligence_input: OfferIntelligenceInput,
  offer_intelligence: OfferIntelligenceReport,
  offer_outline: OfferOutline,
  portfolio_allocation: PortfolioAllocation,
};
