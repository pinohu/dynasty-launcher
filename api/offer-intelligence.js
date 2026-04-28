import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adminCorsHeaders, verifyAdminCredential } from './tenants/_auth.mjs';
import { OfferIntelligenceSchema } from './_schemas.js';

export const maxDuration = 60;

const INPUT_SCHEMA = OfferIntelligenceSchema.input;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function mapRisk(score) {
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

function mapAuthority(score) {
  if (score >= 80) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}

function slugify(value) {
  return String(value || 'untitled-topic')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled-topic';
}

function inferDeliveryFormat({ delivery_preference, pain_signals }) {
  const all = [delivery_preference, ...pain_signals].join(' ').toLowerCase();
  if (/calculator|cost|roi|pricing|token|forecast/.test(all)) return 'calculator';
  if (/template|swipe|script|email|playbook|workflow/.test(all)) return 'template_pack';
  if (/audit|diagnostic|assessment|score/.test(all)) return 'diagnostic_audit';
  if (/spreadsheet|sheet|excel/.test(all)) return 'spreadsheet';
  if (/app|dashboard|tool|mini app|mini-app/.test(all)) return 'mini_app';
  if (/service|done for you|dfy/.test(all)) return 'service';
  if (/pdf|guide|ebook/.test(all)) return 'pdf';
  return 'diagnostic_audit';
}

function determineLeadMagnet(format, topic) {
  const cleanTopic = topic?.trim() || 'Operator Revenue Leak';
  if (format === 'calculator' || format === 'spreadsheet') {
    return {
      type: 'Cost Calculator',
      title: `How Much Is ${cleanTopic} Costing You Every Month?`,
      why_it_converts: 'Quantifies active financial loss and frames immediate payback for buying the core offer.',
    };
  }
  if (format === 'template_pack') {
    return {
      type: 'Swipe File / Template Pack',
      title: `${cleanTopic} Rapid-Fix Template Pack`,
      why_it_converts: 'Gives immediate implementation assets and reduces setup friction for paid conversion.',
    };
  }
  if (format === 'diagnostic_audit') {
    return {
      type: 'Diagnostic Scorecard',
      title: `Is Your ${cleanTopic} Already Broken?`,
      why_it_converts: 'Creates urgency by diagnosing failure severity and exposing hidden backend revenue risk.',
    };
  }
  return {
    type: 'Failure Audit Checklist',
    title: `${cleanTopic} Failure Signals Checklist`,
    why_it_converts: 'Converts by helping operators self-identify expensive failure states quickly.',
  };
}

function priceBandFromPain(painScore, floor) {
  const minFloor = Number.parseInt(String(floor || '').replace(/[^0-9]/g, ''), 10) || 19;
  const tiers = [19, 49, 79, 97, 147, 297];
  let candidate = 19;
  if (painScore >= 85) candidate = 297;
  else if (painScore >= 75) candidate = 147;
  else if (painScore >= 65) candidate = 97;
  else if (painScore >= 55) candidate = 79;
  else if (painScore >= 45) candidate = 49;
  candidate = Math.max(candidate, minFloor);
  return tiers.find((t) => t >= candidate) || 297;
}

function scoreOpportunity(input) {
  const signals = (input.pain_signals || []).map((v) => String(v || '').trim()).filter(Boolean);
  const constraints = (input.constraints || []).map((v) => String(v || '').trim()).filter(Boolean);
  const signalText = signals.join(' ').toLowerCase();
  const evidence = signals.slice(0, 10).map((s, i) => ({
    source_type: 'pain_signal',
    source_id: `pain_signal_${i + 1}`,
    trust_rank: 0.8,
    quote: s,
  }));

  let pain = clamp(35 + signals.length * 7, 0, 100);
  if (/refund|chargeback|churn|lost revenue|cost|compliance|outage|delay|failure/.test(signalText)) pain += 15;
  pain = clamp(pain, 0, 100);

  let purchaseIntent = clamp(30 + signals.length * 6, 0, 100);
  if (/pay|buy|budget|invoice|contract|urgent|deadline/.test(signalText)) purchaseIntent += 15;
  purchaseIntent = clamp(purchaseIntent, 0, 100);

  let authorityFit = 65;
  const authority = String(input.authority_role || '').toLowerCase();
  if (authority.includes('unknown') || authority.length === 0) authorityFit -= 10;
  if (/tax|medical|legal|clinical|securities/.test(signalText)) authorityFit -= 20;
  authorityFit = clamp(authorityFit, 0, 100);

  let saturation = 45;
  if (/ai prompt|ebook|newsletter|generic|motivation|passive income/.test(signalText + ' ' + String(input.topic || '').toLowerCase())) saturation += 30;
  saturation = clamp(saturation, 0, 100);

  let refundRisk = 35;
  if (/fast money|get rich|overnight|passive income|easy/.test(signalText + ' ' + String(input.topic || '').toLowerCase())) refundRisk += 45;
  refundRisk = clamp(refundRisk, 0, 100);

  let liabilityRisk = 20;
  if (/tax|investment|health|legal|clinical|regulated/.test(signalText)) liabilityRisk += 55;
  if (input.allow_liability_categories) liabilityRisk -= 20;
  liabilityRisk = clamp(liabilityRisk, 0, 100);

  let identityRisk = 20;
  if (/client story|case study|my client|proprietary|secret method/.test(signalText)) identityRisk += 45;
  if (input.allow_identity_risk) identityRisk -= 15;
  identityRisk = clamp(identityRisk, 0, 100);

  const timeLimit = Number(input.time_to_ship_limit_days || 14);
  let timeToShipScore = clamp(100 - Math.max(0, (14 - Math.min(14, timeLimit)) * 3), 35, 100);
  if (/platform|marketplace|mobile app|deep integration/.test(signalText + ' ' + String(input.topic || '').toLowerCase())) timeToShipScore -= 25;
  timeToShipScore = clamp(timeToShipScore, 0, 100);

  const ascensionPotential = clamp(/audit|service|retainer|recurring|dfy/.test(signalText) ? 85 : 60, 0, 100);
  const leadMagnetStrength = clamp(/diagnostic|calculator|checklist|template/.test(signalText) ? 85 : 60, 0, 100);

  const weighted =
    pain * 0.2 +
    purchaseIntent * 0.15 +
    authorityFit * 0.15 +
    (100 - saturation) * 0.1 +
    (100 - refundRisk) * 0.1 +
    (100 - liabilityRisk) * 0.05 +
    (100 - identityRisk) * 0.05 +
    timeToShipScore * 0.1 +
    ascensionPotential * 0.05 +
    leadMagnetStrength * 0.05;

  const hardKills = [];
  if (saturation > 70) hardKills.push('market_saturation_above_70');
  if (authorityFit < 55) hardKills.push('authority_fit_below_medium');
  if (refundRisk > 70) hardKills.push('refund_risk_above_high');
  if (liabilityRisk > 70) hardKills.push('liability_risk_above_high');
  if (timeToShipScore < 50) hardKills.push('time_to_ship_over_14_days_equivalent');
  if (identityRisk > 70) hardKills.push('identity_risk_high');
  if (signals.length === 0) hardKills.push('no_evidence_signals_provided');

  if (input.operator_override === true && !String(input.override_reason || '').trim()) {
    throw new Error('override_reason is required when operator_override=true');
  }

  const delivery = inferDeliveryFormat(input);
  const leadMagnet = determineLeadMagnet(delivery, input.topic);
  const recommendedPrice = priceBandFromPain(pain, input.price_floor);
  const opportunityScore = clamp(Math.round(weighted), 0, 100);
  const category = opportunityScore >= 80 && hardKills.length === 0 ? 'build_candidate' : 'rejected';
  const buildDecision = category === 'build_candidate' ? 'BUILD' : 'DO_NOT_BUILD';

  const primaryBuyer = input.portfolio_role || 'operator_with_active_loss';
  const economicBuyer = /team|agency|enterprise/.test(String(input.market_type || '').toLowerCase()) ? 'owner_or_department_head' : 'owner_operator';

  const result = {
    model_version: 'v1.0',
    topic: input.topic,
    opportunity_score: opportunityScore,
    pain_score: pain,
    saturation_score: saturation,
    refund_risk: mapRisk(refundRisk),
    liability_risk: mapRisk(liabilityRisk),
    identity_risk: mapRisk(identityRisk),
    time_to_ship_score: timeToShipScore,
    authority_fit: mapAuthority(authorityFit),
    buyer_analysis: {
      primary_buyer: primaryBuyer,
      economic_buyer: economicBuyer,
      technical_user: input.upsell_role || 'implementation_operator',
      emotional_buyer: 'risk_averse_operator_needing_certainty',
    },
    best_delivery_format: delivery,
    best_lead_magnet: leadMagnet,
    recommended_price: `$${recommendedPrice}`,
    price_reasoning: `Price anchored to cost-of-delay profile and modeled pain intensity score (${pain}/100), not competitor PDF averages.`,
    category,
    ascension_path: [
      `Lead Magnet: ${leadMagnet.type}`,
      `Core Paid Product: ${delivery} at $${recommendedPrice}`,
      'Audit: Paid implementation diagnostic',
      'DFY Service: Hands-on remediation sprint',
      'Retainer: Ongoing optimization + monitoring',
    ],
    competitive_advantage: 'Decision framework enforces hard-kill filters, risk scoring, and backend ascension mapping before build approval.',
    why_our_version_wins: 'Reject-first governance prevents low-intent product waste and preserves operator capacity for high-pain opportunities.',
    do_not_build_if: hardKills,
    build_decision: buildDecision,
    operator_override: Boolean(input.operator_override),
    override_reason: String(input.override_reason || ''),
    evidence,
    judgment: {
      purchase_intent_score: purchaseIntent,
      authority_fit_score: authorityFit,
      refund_risk_score: refundRisk,
      liability_risk_score: liabilityRisk,
      identity_risk_score: identityRisk,
      ascension_potential_score: ascensionPotential,
      lead_magnet_strength_score: leadMagnetStrength,
      hard_kill_thresholds_triggered: hardKills,
    },
    decision: {
      recommended: buildDecision === 'BUILD',
      requires_human_approval: true,
      auto_publish_enabled: false,
      archive_target: buildDecision === 'DO_NOT_BUILD' ? 'DO_NOT_BUILD' : 'BUILD_PIPELINE_QUEUE',
      scored_at: new Date().toISOString(),
    },
  };

  return result;
}

async function persistDecision(report) {
  const baseDir = path.join(process.cwd(), 'gumroad-output', '_intelligence');
  const topicSlug = slugify(report.topic);
  const dateStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const topicDir = path.join(baseDir, topicSlug);
  const archiveDir = path.join(baseDir, 'DO_NOT_BUILD');
  const doNotBuildTopicDir = path.join(archiveDir, topicSlug);

  await mkdir(topicDir, { recursive: true });
  await mkdir(archiveDir, { recursive: true });

  const topicFile = path.join(topicDir, `${dateStamp}.json`);
  await writeFile(topicFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (report.build_decision === 'DO_NOT_BUILD') {
    await mkdir(doNotBuildTopicDir, { recursive: true });
    const archiveFile = path.join(doNotBuildTopicDir, `${dateStamp}.json`);
    await writeFile(archiveFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  const historyPath = path.join(baseDir, 'decision-history.md');
  let existing = '';
  try {
    existing = await readFile(historyPath, 'utf8');
  } catch {}
  if (!existing.trim()) {
    existing = '# Offer Intelligence Decision History\n\n';
  }
  const entry = `- ${new Date().toISOString()} | ${report.topic} | score=${report.opportunity_score} | decision=${report.build_decision} | model=${report.model_version}`;
  await writeFile(historyPath, `${existing.trimEnd()}\n${entry}\n`, 'utf8');

  return {
    topic_file: path.relative(process.cwd(), topicFile),
    history_file: path.relative(process.cwd(), historyPath),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', adminCorsHeaders());

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!verifyAdminCredential(req).ok) return res.status(401).json({ error: 'admin_token_required' });

  const parsed = INPUT_SCHEMA.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'invalid_input', details: parsed.error.flatten() });
  }

  try {
    const report = scoreOpportunity(parsed.data);
    const valid = OfferIntelligenceSchema.output.safeParse(report);
    if (!valid.success) {
      return res.status(500).json({ ok: false, error: 'output_validation_failed', details: valid.error.flatten() });
    }
    const persisted = await persistDecision(valid.data);
    return res.status(200).json({ ok: true, report: valid.data, persisted });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || 'offer_intelligence_failed' });
  }
}
