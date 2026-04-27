// Portfolio Allocation Engine (PAE) — admin-gated.
//
// OIE phase 2. OIE asks "should we build THIS?". PAE asks "is the PORTFOLIO
// balanced?" — does the operator have a sane mix of flagship / tripwire /
// backend / retainer offers, or is everything piling up in one role?
//
// Two-stage architecture:
//   1. computeCurrentState() — deterministic SQL aggregation over OIE rows.
//      No AI. Repeatable. Drives the snapshot embedded in every report.
//   2. AI recommendation pass — given the snapshot + every approved/shipped
//      decision's portfolio metadata, returns a structured PortfolioAllocation
//      report with target_mix, gap_analysis, and recommended_next_builds.
//
// Same auth/temperature/determinism story as OIE. Recommendations reference
// existing decision_ids when an approved-but-unshipped item already fills
// a gap; otherwise they recommend running a fresh OIE on a defined gap.

import { createHmac, timingSafeEqual } from 'crypto';
import { generateTyped } from './ai-sdk.js';
import { PORTFOLIO_ALLOCATOR_VERSION } from './_schemas.js';
import { computeCurrentState, listDecisions } from './_intelligence-store.js';

export const maxDuration = 120;

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
    return true;
  } catch { return false; }
}

// Allow caller-supplied capacity overrides via the run body.
const DEFAULT_TARGET_MIX = {
  flagship_authority: 1,
  low_ticket_tripwire: 2,
  backend_ascension: 1,
  diagnostic_lead_magnet: 1,
  recurring_retainer_feeder: 1,
};

function buildAllocatorPrompt({ state, decisions, target_mix, capacity_per_month, constraints }) {
  // Compact representation — full report JSON would blow context. Keep one
  // line per approved decision with the fields that drive allocation choices.
  const lines = decisions.map(d => {
    const meta = d.report?.decision?.portfolio_metadata || {};
    const cat = d.report?.decision?.category || '';
    const fmt = d.report?.decision?.best_delivery_format?.format || '';
    const ident = d.report?.judgment?.identity_safety?.score ?? '?';
    const shipped = d.shipped_at ? 'shipped' : 'approved-pending';
    return `  #${d.id} [${shipped}] score=${d.opportunity_score} cat=${cat} fmt=${fmt} portfolio=${meta.portfolio_role || '?'} upsell=${meta.upsell_role || '?'} authority=${meta.authority_role || '?'} identity=${ident} :: ${(d.topic || '').slice(0, 80)}`;
  }).join('\n');

  return `You are the Portfolio Allocation Engine (PAE) — the strategic governor that
sits above OIE. Your job is NOT to find new ideas. Your job is to keep the
operator's product mix balanced, prevent role over-concentration, and order
what to ship next based on existing approved work.

Output MUST match the PortfolioAllocation schema exactly.

═══════════════════════════════════════════════════════════════════════════════
CURRENT STATE (deterministic snapshot — copy verbatim into the report)
═══════════════════════════════════════════════════════════════════════════════
${JSON.stringify(state, null, 2)}

Operator-supplied target_mix:
${JSON.stringify(target_mix, null, 2)}

Capacity (items shippable per month): ${capacity_per_month}
Operator constraints:
${(constraints || []).map(c => '  - ' + c).join('\n') || '  (none)'}

═══════════════════════════════════════════════════════════════════════════════
APPROVED + SHIPPED DECISIONS (one per line — these are your inventory)
═══════════════════════════════════════════════════════════════════════════════
${lines || '  (no approved decisions yet)'}

═══════════════════════════════════════════════════════════════════════════════
RULES
═══════════════════════════════════════════════════════════════════════════════
1. current_state_snapshot must equal the snapshot block above.
2. target_mix should default to the operator-supplied numbers unless you
   have a STRONG reason to deviate. If you deviate, explain in target_mix_rationale.
3. recommended_next_builds: 0–10 items, ordered by priority (1 = highest).
   • Prefer action='ship_existing_approved' when an approved decision
     already fills a gap — reference its decision_id.
   • Use action='kill_low_performer' only when you have evidence
     (predicted_vs_actual_delta, low opportunity_score with high refund risk, etc).
   • Use action='run_new_oie_for_gap' only when no inventory item fits the gap.
   • Use action='reactivate_archived' if a previously-rejected idea has new
     supporting context (rare).
   • Use action='no_action_needed' as the SOLE entry when the portfolio is
     already balanced. Do NOT pad recommendations.
4. gap_analysis.identity_collision_warnings: flag if 3+ approved offers
   share an identity_score < 5 — that's a deanonymization risk concentration.
5. gap_analysis.portfolio_health_score: 0 = catastrophic concentration
   risk; 100 = balanced healthy mix matching target.
6. capacity_advice must be actionable — tell the operator how many of the
   recommended items realistically ship in the next 30 days given capacity.
7. confidence is your honest read on the data quality. If shipped_with_metrics_count
   is low, confidence should reflect that — you're guessing about real performance.

═══════════════════════════════════════════════════════════════════════════════
TONE
═══════════════════════════════════════════════════════════════════════════════
Investment committee, not brainstorm. Short, specific, evidence-backed.
If the portfolio is fine, say so and recommend nothing. Padding is a tell
that you don't have a real recommendation.`;
}

export default async function handler(req, res) {
  const origin = process.env.CORS_ORIGIN || 'https://yourdeputy.com';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!verifyAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized — valid admin token required' });

  const action = req.query?.action || req.body?.action || 'recommend';

  // ── CURRENT STATE: deterministic snapshot only (no AI) ────────────────────
  if (action === 'current_state') {
    const out = await computeCurrentState();
    return res.json({
      ok: out.ok,
      state: out.state,
      error: out.error,
      version: PORTFOLIO_ALLOCATOR_VERSION,
    });
  }

  // ── RECOMMEND: full allocator pass (deterministic snapshot + AI rec) ──────
  if (action === 'recommend') {
    const cs = await computeCurrentState();
    if (!cs.ok) return res.status(503).json({ ok: false, error: 'cannot_compute_state', detail: cs.error });

    const inv = await listDecisions({ filter: 'approved', limit: 200 });
    const decisions = inv.decisions || [];

    // Hydrate each decision with its full report so we can compact it for the prompt.
    // listDecisions returns thin rows by design; pull full rows from the same query.
    const { Pool } = await import('pg');
    const pool = process.env.NEON_STORE_ID ? new Pool({ connectionString: process.env.NEON_STORE_ID }) : null;
    let hydrated = decisions;
    if (pool && decisions.length) {
      try {
        const ids = decisions.map(d => d.id);
        const r = await pool.query(
          `SELECT id, topic, opportunity_score, status, shipped_at, report
             FROM dynasty_offer_intelligence
             WHERE id = ANY($1::int[])`,
          [ids]
        );
        const byId = new Map(r.rows.map(x => [x.id, x]));
        hydrated = decisions.map(d => ({ ...d, ...(byId.get(d.id) || {}) }));
      } catch {
        // Fall back to thin rows — the prompt will have less context but still works.
      } finally {
        await pool.end().catch(() => {});
      }
    }

    const target_mix = req.body?.target_mix || DEFAULT_TARGET_MIX;
    const capacity_per_month = parseInt(req.body?.capacity_per_month) || 2;
    const constraints = Array.isArray(req.body?.constraints) ? req.body.constraints : [];

    const prompt = buildAllocatorPrompt({
      state: cs.state,
      decisions: hydrated,
      target_mix,
      capacity_per_month,
      constraints,
    });
    const preferred = req.body?.model || 'gemma-4-31b-it';
    const out = await generateTyped({
      schemaName: 'portfolio_allocation',
      prompt,
      model: preferred,
      userId: 'admin',
      temperature: 0.2,
      maxTokens: 5000,
      traceName: 'pae:recommend',
    });
    if (!out.ok) {
      return res.status(502).json({ ok: false, error: 'generation_failed', errors: out.errors, tried: out.tried });
    }

    const allocation = out.object;
    // Force the canonical version + force the snapshot to match what we
    // actually computed (don't let the model edit the deterministic numbers).
    allocation.model_version = PORTFOLIO_ALLOCATOR_VERSION;
    allocation.current_state_snapshot = cs.state;

    return res.json({
      ok: true,
      allocation,
      ai: { model: out.model, provider: out.provider, usage: out.usage },
    });
  }

  if (action === 'version') {
    return res.json({ ok: true, model_version: PORTFOLIO_ALLOCATOR_VERSION });
  }

  return res.status(400).json({
    ok: false,
    error: `Unknown PAE action: ${action}`,
    valid_actions: ['current_state', 'recommend', 'version'],
  });
}
