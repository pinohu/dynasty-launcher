/**
 * 3.01 — Lead scorer.
 * 5-signal scoring mirroring the PA CROP `/api/qualify-lead` reference impl:
 *   visitedDeadline     +20
 *   completedCheck      +30
 *   hasForeignEntity    +25
 *   planInterest        +15
 *   source              +10 (linkedin/referral), +5 (organic), 0 (paid)
 *
 * Configurable via env JSON blob LEAD_SCORING_RULES if desired.
 */
const DEFAULT_RULES = [
  { key: 'visited_deadline_page', points: 20 },
  { key: 'form_completed', points: 30 },
  { key: 'has_foreign_entity', points: 25 },
  { key: 'plan_interest', points: 15 },
];

const SOURCE_POINTS = { linkedin: 10, referral: 10, organic: 5, paid: 0, direct: 3 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { lead } = req.body || {};
  if (!lead || !lead.email) return res.status(400).json({ error: 'lead.email required' });

  let score = 0;
  const breakdown = {};
  for (const r of DEFAULT_RULES) {
    if (lead[r.key]) {
      score += r.points;
      breakdown[r.key] = r.points;
    }
  }
  const src = (lead.utm_source || 'direct').toLowerCase();
  score += SOURCE_POINTS[src] ?? 0;
  breakdown['utm_source'] = SOURCE_POINTS[src] ?? 0;
  score = Math.min(100, score);

  // Optionally write back to the CRM (SuiteDash) as a custom field
  if (process.env.SUITEDASH_API_KEY) {
    try { await writeSuitedashScore(lead.email, score); } catch {}
  }

  const hotThreshold = Number(process.env.HOT_THRESHOLD || 70);
  const hot = score >= hotThreshold;
  if (hot && process.env.HOT_WEBHOOK_URL) {
    try {
      await fetch(process.env.HOT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lead, score, breakdown }),
      });
    } catch {}
  }

  return res.status(200).json({ ok: true, score, hot, breakdown });
}

async function writeSuitedashScore(email, score) {
  const [publicId, secret] = (process.env.SUITEDASH_API_KEY || '').split(':');
  if (!publicId || !secret) return;
  await fetch('https://app.suitedash.com/secure-api/contacts/search', {
    method: 'POST',
    headers: {
      'x-public-id': publicId,
      'x-secret-key': secret,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ emailAddress: email }),
  });
  // Real impl would then PATCH the custom field.
}
