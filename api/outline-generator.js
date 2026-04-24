// Outline Generator — gated behind OIE approval.
//
// This endpoint WILL NOT generate an outline unless:
//   (a) the referenced decision has build_decision = BUILD and status = approved, OR
//   (b) the decision has status = approved_override (human applied friction override)
//
// Auto-outlining before OIE approval is explicitly prohibited — it creates
// authority drift and undermines the decision engine. Every successful run
// marks outline_generated_at on the decision row, so the audit trail shows
// the full chain: OIE verdict → human approval (or override) → outline → PDF.

import { createHmac, timingSafeEqual } from 'crypto';
import { generateTyped } from './ai-sdk.js';
import {
  isOutlineAllowed,
  markOutlineGenerated,
  getDecision,
} from './_intelligence-store.js';

export const maxDuration = 300;

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

function buildOutlinePrompt(decision, warn_override) {
  const report = decision.report || {};
  const judgment = report.judgment || {};
  const decisionBlock = report.decision || {};
  const overrideBanner = warn_override
    ? `\n⚠️  OPERATOR OVERRIDE ACTIVE — OIE verdict was DO_NOT_BUILD.
Override reason: "${decision.override_reason || '(none provided)'}"
Treat this outline as an elevated-risk artifact. Set outline.override_warning to a short sentence making this clear. Keep scope minimal.`
    : '';
  return `Generate a structured product outline for the opportunity below.

This opportunity has been APPROVED by the Offer Intelligence Engine for production.${overrideBanner}

Your output MUST match the OfferOutline schema exactly. No prose preamble.

══════════════════════════════════════════════════════════════════════════════
APPROVED DECISION CONTEXT
══════════════════════════════════════════════════════════════════════════════
decision_id:        ${decision.id}
topic:              ${report.topic || decision.topic}
delivery_format:    ${decisionBlock.best_delivery_format?.format || 'pdf'}
lead_magnet:        ${decisionBlock.best_lead_magnet?.title || ''} (${decisionBlock.best_lead_magnet?.type || ''})
price:              $${decisionBlock.best_price?.amount_usd ?? 0} (anchored to cost-of-staying-broken $${decisionBlock.best_price?.cost_of_staying_broken_monthly_usd ?? 0}/mo)
category:           ${decisionBlock.category || ''}
primary_buyer:      ${judgment.buyer_analysis?.primary_buyer || ''}
economic_buyer:     ${judgment.buyer_analysis?.economic_buyer || ''}
why_this_wins:      ${judgment.why_this_wins?.claim || ''}
unfair_advantage:   ${judgment.why_this_wins?.unfair_advantage || ''}
competitive_adv:    ${decisionBlock.competitive_advantage || ''}

TOP PAIN OPPORTUNITIES (rank, name, score):
${(judgment.top_pain_opportunities || []).map(p => `  ${p.rank}. ${p.name} — score ${p.opportunity_score}`).join('\n')}

ASCENSION PATH:
  lead_magnet:      ${decisionBlock.ascension_path?.lead_magnet || ''}
  core_paid:        ${decisionBlock.ascension_path?.core_paid_product || ''}
  audit:            ${decisionBlock.ascension_path?.audit || ''}
  dfy:              ${decisionBlock.ascension_path?.dfy_service || ''}
  retainer:         ${decisionBlock.ascension_path?.retainer || ''}

══════════════════════════════════════════════════════════════════════════════
OUTLINE REQUIREMENTS
══════════════════════════════════════════════════════════════════════════════
• Set outline.decision_id = ${decision.id}.
• Set outline.topic to the topic above.
• Set outline.delivery_format to "${decisionBlock.best_delivery_format?.format || 'pdf'}".
• 3–20 sections, each with purpose, key_points, artifacts, estimated_words.
• Artifacts should be concrete (templates, calculators, checklists, scripts)
  — not generic ("case studies", "research").
• proof_artifacts_required: list specific proof items the operator must
  actually provide (screenshots, calculations, before/after, receipts).
• CTAs must match the ascension path (lead magnet → core offer → ascension).
• Title must be specific and outcome-oriented, not aspirational.
• DO NOT pad. Estimated word counts should reflect what the buyer actually
  needs, not what looks impressive.`;
}

export default async function handler(req, res) {
  const origin = process.env.CORS_ORIGIN || 'https://yourdeputy.com';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  if (!verifyAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized — valid admin token required' });

  const action = req.query?.action || req.body?.action || 'generate';

  if (action === 'gate_check') {
    const id = req.body?.decision_id || req.query?.id;
    if (!id) return res.status(400).json({ ok: false, error: 'decision_id required' });
    const gate = await isOutlineAllowed(id);
    return res.json({ ok: true, ...gate });
  }

  if (action === 'generate') {
    const { decision_id, model } = req.body || {};
    if (!decision_id) return res.status(400).json({ ok: false, error: 'decision_id required' });

    // THE GATE — refuses non-approved decisions unconditionally.
    const gate = await isOutlineAllowed(decision_id);
    if (!gate.allowed) {
      return res.status(409).json({
        ok: false,
        error: 'outline_blocked',
        reason: gate.reason,
        decision: gate.decision ? {
          id: gate.decision.id,
          build_decision: gate.decision.build_decision,
          status: gate.decision.status,
          operator_override: gate.decision.operator_override,
        } : null,
      });
    }

    const got = await getDecision(decision_id);
    if (!got.ok) return res.status(404).json({ ok: false, error: got.error });
    const decision = got.decision;

    const prompt = buildOutlinePrompt(decision, gate.warn_override);
    const out = await generateTyped({
      schemaName: 'offer_outline',
      prompt,
      model: model || 'gemma-4-31b-it',
      userId: 'admin',
      temperature: 0.3,
      maxTokens: 6000,
      traceName: 'outline:generate',
    });
    if (!out.ok) {
      return res.status(502).json({ ok: false, error: 'generation_failed', errors: out.errors, tried: out.tried });
    }

    const outline = out.object;
    outline.decision_id = parseInt(decision_id);
    if (gate.warn_override && !outline.override_warning) {
      outline.override_warning = `Operator override active — OIE verdict was DO_NOT_BUILD. Reason: ${gate.override_reason || '(none)'}`;
    }

    await markOutlineGenerated(decision_id);

    return res.json({
      ok: true,
      decision_id: parseInt(decision_id),
      outline,
      override_active: !!gate.warn_override,
      ai: { model: out.model, provider: out.provider, usage: out.usage },
    });
  }

  return res.status(400).json({
    ok: false,
    error: `Unknown action: ${action}`,
    valid_actions: ['generate', 'gate_check'],
  });
}
