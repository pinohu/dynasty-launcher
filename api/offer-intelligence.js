// Offer Intelligence Engine (OIE) — admin-gated.
//
// This is a governor system, NOT an autopilot. It evaluates whether a product
// opportunity is worth building and returns a structured BUILD / DO_NOT_BUILD
// verdict. It never triggers outline generation, PDF shipping, listing
// creation, or pricing publication — those require separate human approval
// through /api/outline-generator and downstream pipelines.
//
// Auth: every action here requires a valid admin HMAC token (same scheme as
// /api/admin). Strategic intelligence is not a public endpoint.
//
// Determinism: generation runs at low temperature with a fixed rubric and
// hard kill thresholds so repeat submissions yield materially stable reports.
// Every row carries a model_version string (OFFER_INTELLIGENCE_MODEL_VERSION
// from _schemas.js) so historical decisions remain comparable when the
// scoring logic evolves.

import { createHmac, timingSafeEqual } from 'crypto';
import { generateTyped } from './ai-sdk.js';
import {
  OfferIntelligenceInput,
  OFFER_INTELLIGENCE_MODEL_VERSION,
} from './_schemas.js';
import {
  saveDecision,
  listDecisions,
  getDecision,
  approveDecision,
  overrideDecision,
  rejectDecision,
  isOutlineAllowed,
  recordPostLaunchMetrics,
  listPostLaunchMetrics,
  markShipped,
  listShippedDecisions,
} from './_intelligence-store.js';

export const maxDuration = 300;

const OVERRIDE_REASON_MIN_LENGTH = 50;

function verifyAdmin(req) {
  const ADMIN_KEY = process.env.ADMIN_KEY || '';
  const TEST_ADMIN_KEY = process.env.TEST_ADMIN_KEY || '';
  if (!ADMIN_KEY && !TEST_ADMIN_KEY) return false;
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (!auth) return false;
  try {
    const parts = auth.split(':');
    if (parts.length !== 3) return false;
    const [prefix, expiry, hash] = parts;
    const tokenSecret = prefix === 'admin' ? ADMIN_KEY : (prefix === 'admin_test' ? TEST_ADMIN_KEY : '');
    if (!tokenSecret) return false;
    const payload = `${prefix}:${expiry}`;
    const expected = createHmac('sha256', tokenSecret).update(payload).digest('hex');
    if (expected.length !== hash.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) return false;
    if (Date.now() > parseInt(expiry)) return false;
    return { ok: true, principal: prefix };
  } catch { return false; }
}

// ── The OIE system prompt ────────────────────────────────────────────────────
// Enforces:
//   §3  Hard negative bias — default stance is reject.
//   §2  Evidence before judgment — structured separation.
//   §8  Mandatory "why this wins" — weak claims force DO_NOT_BUILD.
//   §9  Delivery format free to reject PDF.
//   §10 Pricing anchored to cost of staying broken, not comp pricing.
//   §12 Low-end competitor scan (Gumroad/Etsy/Kindle/templates).
//   §13 Identity safety as first-class score.
//   §15 Reject vanity markets.
function buildOperatorPrompt(input) {
  const json = (v) => JSON.stringify(v, null, 2);
  return `You are the Offer Intelligence Engine (OIE) — a ruthless, disciplined investment committee.
You are NOT a brainstorming assistant. You are NOT a content generator.
You are a governor: your job is to prevent bad builds, not to find opportunities.

Your output MUST match the OfferIntelligenceReport schema exactly. No prose, no preamble.

═══════════════════════════════════════════════════════════════════════════════
CORE STANCE: PROBABLY REJECT
═══════════════════════════════════════════════════════════════════════════════
Most ideas should die. That is healthy. If you cannot make a strong positive
case with specific evidence, the answer is DO_NOT_BUILD. When in doubt, kill it.

═══════════════════════════════════════════════════════════════════════════════
EVIDENCE vs JUDGMENT vs DECISION
═══════════════════════════════════════════════════════════════════════════════
1. evidence[]: only verifiable proof. Each item includes source_type,
   a trust_weight (high/medium/low), a url_or_reference (use a plausible
   canonical form if exact URL is unknown), and which score it supports.
   HIGHEST trust: paid_review_complaint, refund_discussion,
                  unresolved_issue_high_views, github_issue_high_reactions.
   LOWEST trust: reddit_thread, tweet_or_post.
   If evidence is thin, say so — do not invent.

2. judgment.*: reasoning that cites evidence indices via evidence_ids.
   Never state a score or claim without evidence backing.

3. decision.*: verdict + ship recommendations. build_decision is BUILD or
   DO_NOT_BUILD. No other values.

═══════════════════════════════════════════════════════════════════════════════
MANDATORY FIELDS — IF ANY ARE WEAK, FORCE DO_NOT_BUILD
═══════════════════════════════════════════════════════════════════════════════
• judgment.why_this_wins.claim: specific, concrete unfair advantage.
  If strength is "weak", you MUST add "weak_competitive_advantage" to
  decision.kill_flags_triggered AND set build_decision = DO_NOT_BUILD.
• judgment.identity_safety.score: 0 (extreme risk) — 10 (anonymous-safe).
  If score < 5 and input.allow_identity_risk is false, add
  "high_identity_risk" to kill_flags and force DO_NOT_BUILD.
• judgment.vanity_market_check: if specificity_of_operator is "vanity" or
  "broad", add "vanity_market" to kill_flags and force DO_NOT_BUILD.
  Painfully specific operators only. Generic "AI developers", "startup
  founders", "productivity buyers" are vanity markets.
• judgment.low_end_competitors: scan cheap Gumroad PDFs, Etsy packs,
  Kindle books, template marketplaces. These destroy pricing power even
  at low quality. If 3+ low-end competitors exist at <20% of your
  recommended price, add "pricing_power_destroyed" to kill_flags.

═══════════════════════════════════════════════════════════════════════════════
HARD KILL THRESHOLDS (auto-reject if any match)
═══════════════════════════════════════════════════════════════════════════════
• market_saturation score contribution < 2  → "market_saturated"
• authority_fit score contribution      < 5  → "weak_authority_fit"
• refund_risk score contribution        < 3  → "high_refund_risk"
• liability_risk score contribution     < 2 AND input.allow_liability_categories=false → "liability_blocked"
• identity_risk score contribution      < 2 AND input.allow_identity_risk=false → "identity_blocked"
• time_to_ship estimate > input.time_to_ship_limit_days → "too_slow_to_ship"
• proof burden judged "impossible" → "unprovable"
• why_this_wins.strength = "weak" → "weak_competitive_advantage"

When ANY kill flag triggers, decision.build_decision MUST be DO_NOT_BUILD,
regardless of raw opportunity_score. Populate decision.kill_flags_triggered
with the exact strings listed above.

═══════════════════════════════════════════════════════════════════════════════
SCORING RUBRIC (explicit weights — sums to opportunity_score, 0-100)
═══════════════════════════════════════════════════════════════════════════════
Pain Intensity         [0-20]  — cost of staying broken × urgency × frequency
Purchase Intent        [0-15]  — "would they pay $79+" vs ignorance pain
Authority Fit          [0-15]  — can OUR operator credibly sell this?
Market Saturation      [0-10]  — HIGHER = LESS saturated (inverted)
Refund Risk            [0-10]  — HIGHER = LOWER refund risk (inverted)
Liability Risk         [0-5]   — HIGHER = LOWER liability (inverted)
Identity Risk          [0-5]   — HIGHER = LOWER collision (inverted)
Time-to-Ship           [0-10]  — HIGHER = FASTER
Ascension Potential    [0-5]   — can this seed DFY/retainer?
Lead Magnet Strength   [0-5]   — does the magnet pre-qualify buyers?

opportunity_score = sum of the above. Only 80+ without kill flags = BUILD.

═══════════════════════════════════════════════════════════════════════════════
DELIVERY FORMAT — DO NOT DEFAULT TO PDF
═══════════════════════════════════════════════════════════════════════════════
If the problem is better solved by a calculator, audit, workflow pack, or
service, SAY SO. Populate best_delivery_format.rejected_formats with
formats you considered but rejected, with reasoning in the main rationale.
Never recommend PDF because Gumroad is convenient.

═══════════════════════════════════════════════════════════════════════════════
PRICING — ANCHOR TO PAIN COST, NOT COMPETITOR PRICING
═══════════════════════════════════════════════════════════════════════════════
decision.best_price.cost_of_staying_broken_monthly_usd is mandatory — your
best estimate of what the buyer loses per month by NOT solving this.
Then price so "cost to stop the pain" is a fraction of "cost of staying
broken". Never price against what similar PDFs sell for on Gumroad. That
is a race to the bottom.

═══════════════════════════════════════════════════════════════════════════════
PORTFOLIO METADATA
═══════════════════════════════════════════════════════════════════════════════
decision.portfolio_metadata fields are mandatory so a future portfolio
allocator can reason about the product mix:
  • portfolio_role: fits the input's portfolio_role if specified, else classify.
  • upsell_role: entry_point / core_offer / profit_maximizer / backend_upsell / continuity / none.
  • authority_role: flagship / supporting / proof_generator / distribution / none.

═══════════════════════════════════════════════════════════════════════════════
INPUT
═══════════════════════════════════════════════════════════════════════════════
${json(input)}

═══════════════════════════════════════════════════════════════════════════════
OUTPUT CONTRACT
═══════════════════════════════════════════════════════════════════════════════
Set report.model_version = "${OFFER_INTELLIGENCE_MODEL_VERSION}" exactly.
Set report.topic = input.topic exactly.
All scoring sub-fields must sum to opportunity_score within ±1 rounding.
post_launch_tracking must be present with default zeros — an empty shell
for future feedback-loop population.

Remember: your success metric is preventing bad builds, not finding good
ones. If the operator feels slightly uncomfortable when you say "No",
you are doing your job correctly.`;
}

export default async function handler(req, res) {
  const origin = process.env.CORS_ORIGIN || 'https://yourdeputy.com';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = verifyAdmin(req);
  if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized — valid admin token required' });

  const action = req.query?.action || req.body?.action || 'run';

  // ── RUN: evaluate a topic and persist the report ──────────────────────────
  if (action === 'run') {
    const parsed = OfferIntelligenceInput.safeParse(req.body?.input || req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'invalid_input', issues: parsed.error.issues });
    }
    const input = parsed.data;
    const prompt = buildOperatorPrompt(input);
    // Low temperature for determinism. Prefer free/open-weight models so
    // strategic decisions aren't rate-limited by a paid key going dry.
    const preferred = req.body?.model || 'gemma-4-31b-it';
    const out = await generateTyped({
      schemaName: 'offer_intelligence',
      prompt,
      model: preferred,
      sessionId: req.body?.sessionId,
      userId: 'admin',
      temperature: 0.2,
      maxTokens: 6000,
      traceName: 'oie:run',
    });
    if (!out.ok) {
      return res.status(502).json({ ok: false, error: 'generation_failed', errors: out.errors, tried: out.tried });
    }
    const report = out.object;
    // Defensive: force model_version to the canonical constant so operators
    // can't accidentally mask a rubric change by prompting around it.
    report.model_version = OFFER_INTELLIGENCE_MODEL_VERSION;
    report.topic = input.topic;

    const persisted = await saveDecision({ input, report, model: out.model, provider: out.provider });
    return res.json({
      ok: true,
      id: persisted.id,
      slug: persisted.slug,
      model_version: persisted.model_version,
      build_decision: persisted.build_decision,
      opportunity_score: persisted.opportunity_score,
      persisted: persisted.persisted,
      warning: persisted.warning,
      report,
      ai: { model: out.model, provider: out.provider, usage: out.usage },
    });
  }

  // ── LIST: browse decision history (filters: all/build/do_not_build/approved/pending/override) ─
  if (action === 'list') {
    const filter = req.query?.filter || req.body?.filter || 'all';
    const limit = req.query?.limit || req.body?.limit || 50;
    const model_version = req.query?.model_version || req.body?.model_version || null;
    const out = await listDecisions({ filter, limit, model_version });
    return res.json(out);
  }

  // ── GET: full record for a specific decision ──────────────────────────────
  if (action === 'get') {
    const id = req.query?.id || req.body?.id;
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });
    const out = await getDecision(id);
    if (!out.ok) return res.status(404).json(out);
    return res.json(out);
  }

  // ── APPROVE: human-approval step for a BUILD decision ─────────────────────
  if (action === 'approve') {
    const id = req.body?.id;
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });
    const out = await approveDecision({ id, approved_by: auth.principal || 'admin' });
    return res.json(out);
  }

  // ── OVERRIDE: approve a DO_NOT_BUILD anyway (requires substantive reason) ─
  // Friction is intentional — humans love their own bad ideas.
  if (action === 'override') {
    const { id, override_reason } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });
    if (!override_reason || String(override_reason).trim().length < OVERRIDE_REASON_MIN_LENGTH) {
      return res.status(400).json({
        ok: false,
        error: `override_reason required (min ${OVERRIDE_REASON_MIN_LENGTH} chars). Describe specifically why the DO_NOT_BUILD verdict is wrong.`,
      });
    }
    const out = await overrideDecision({
      id,
      override_by: auth.principal || 'admin',
      override_reason: String(override_reason).trim(),
    });
    return res.json(out);
  }

  // ── REJECT: log a decision as explicitly killed ───────────────────────────
  if (action === 'reject') {
    const { id, reason } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });
    const out = await rejectDecision({ id, rejected_by: auth.principal || 'admin', reason });
    return res.json(out);
  }

  // ── OUTLINE_GATE: is this decision cleared for outline generation? ────────
  if (action === 'outline_gate') {
    const id = req.query?.id || req.body?.id;
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });
    const out = await isOutlineAllowed(id);
    return res.json({ ok: true, ...out });
  }

  // ── METRICS: post-launch feedback loop (spec §6) ──────────────────────────
  if (action === 'record_metrics') {
    const { decision_id, metrics } = req.body || {};
    if (!decision_id) return res.status(400).json({ ok: false, error: 'decision_id required' });
    const out = await recordPostLaunchMetrics({ decision_id, metrics });
    return res.json(out);
  }
  if (action === 'get_metrics') {
    const id = req.query?.id || req.body?.decision_id;
    if (!id) return res.status(400).json({ ok: false, error: 'decision_id required' });
    const out = await listPostLaunchMetrics(id);
    return res.json(out);
  }

  // ── MARK SHIPPED: link an approved decision to vendor IDs ─────────────────
  // Required before automated metrics collection knows where to look. Only
  // approved/approved_override decisions can be shipped.
  if (action === 'mark_shipped') {
    const { decision_id, shipped_url, shipped_vercel_project_id, shipped_stripe_product_id, shipped_posthog_event_prefix, shipped_at } = req.body || {};
    if (!decision_id) return res.status(400).json({ ok: false, error: 'decision_id required' });
    const out = await markShipped({
      decision_id, shipped_url, shipped_vercel_project_id,
      shipped_stripe_product_id, shipped_posthog_event_prefix, shipped_at,
    });
    return res.json(out);
  }

  // ── LIST SHIPPED: roster of decisions that have been marked shipped ───────
  if (action === 'list_shipped') {
    const out = await listShippedDecisions();
    return res.json(out);
  }

  // ── MODEL VERSION (lets UIs show "running oie-1.0.0") ─────────────────────
  if (action === 'version') {
    return res.json({ ok: true, model_version: OFFER_INTELLIGENCE_MODEL_VERSION });
  }

  return res.status(400).json({
    ok: false,
    error: `Unknown OIE action: ${action}`,
    valid_actions: ['run', 'list', 'get', 'approve', 'override', 'reject', 'outline_gate', 'record_metrics', 'get_metrics', 'mark_shipped', 'list_shipped', 'version'],
  });
}
