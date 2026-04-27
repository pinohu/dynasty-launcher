// Post-Launch Metrics Collector — wires the OIE feedback loop.
//
// Closes the loop on every shipped decision: did the BUILD verdict actually
// pan out? The cron job pulls vendor data (PostHog pageviews / conversion,
// Stripe revenue / refund rate) for each decision marked shipped, computes
// a predicted_vs_actual_delta, and posts to dynasty_offer_intelligence_metrics.
// Manual entry covers products without automation hooks.
//
// Auth model:
//   • Admin actions (manual_entry, summary, run_collection_now) — admin Bearer token.
//   • Cron action (collect_cron) — Vercel cron secret in `Authorization: Bearer $CRON_SECRET`,
//     scheduled via vercel.json. The same admin-token path also works for ad-hoc triggers.

import { createHmac, timingSafeEqual } from 'crypto';
import { PostLaunchMetricsEntry } from './_schemas.js';
import {
  listShippedDecisions,
  recordPostLaunchMetrics,
  listPostLaunchMetricsAll,
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

function verifyCronOrAdmin(req) {
  if (verifyAdmin(req)) return true;
  // Vercel cron sets `Authorization: Bearer ${CRON_SECRET}`. We accept it
  // here so scheduled runs don't need an admin HMAC token.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (!auth || auth.length !== cronSecret.length) return false;
  try { return timingSafeEqual(Buffer.from(auth), Buffer.from(cronSecret)); } catch { return false; }
}

// ── Vendor pulls. Each returns { ok, fields..., error? }. None throw. ───────

async function fetchPostHogMetrics(decision) {
  const phKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const phProject = process.env.POSTHOG_PROJECT_ID;
  const prefix = decision.shipped_posthog_event_prefix;
  if (!phKey || !phProject || !prefix) {
    return { ok: false, source: 'posthog', error: 'posthog_not_linked', skipped: true };
  }
  // PostHog Trends API: count of pageview events with event name starting
  // with the prefix, last 30 days. Conversion = unique users who fired
  // ${prefix}:purchased / unique users who fired ${prefix}:viewed.
  try {
    const base = `https://us.posthog.com/api/projects/${phProject}/insights/trend`;
    const headers = { 'Authorization': `Bearer ${phKey}`, 'Content-Type': 'application/json' };
    const trendBody = (event) => ({
      events: [{ id: event, type: 'events', math: 'dau' }],
      date_from: '-30d',
    });
    const [viewedRes, purchasedRes] = await Promise.allSettled([
      fetch(base, { method: 'POST', headers, body: JSON.stringify(trendBody(`${prefix}:viewed`)) }),
      fetch(base, { method: 'POST', headers, body: JSON.stringify(trendBody(`${prefix}:purchased`)) }),
    ]);
    const sumSeries = async (settled) => {
      if (settled.status !== 'fulfilled' || !settled.value.ok) return 0;
      const d = await settled.value.json().catch(() => ({}));
      const series = d.result?.[0]?.data || [];
      return series.reduce((a, b) => a + (Number(b) || 0), 0);
    };
    const viewed = await sumSeries(viewedRes);
    const purchased = await sumSeries(purchasedRes);
    const conversion_rate = viewed > 0 ? purchased / viewed : null;
    return {
      ok: true,
      source: 'posthog',
      pageviews_30d: viewed || null,
      conversion_rate,
    };
  } catch (e) {
    return { ok: false, source: 'posthog', error: e.message };
  }
}

async function fetchStripeMetrics(decision) {
  const sk = process.env.STRIPE_SECRET_KEY;
  const productId = decision.shipped_stripe_product_id;
  if (!sk || !productId) {
    return { ok: false, source: 'stripe', error: 'stripe_not_linked', skipped: true };
  }
  // 30-day refund rate = refunded charges / paid charges, filtered to charges
  // tied to a price under this product. We pull charges with metadata.product_id
  // first (cheap path) and fall back to subscription.list when nothing matches.
  try {
    const auth = Buffer.from(`${sk}:`).toString('base64');
    const since = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
    const headers = { 'Authorization': `Basic ${auth}` };
    // Page through up to 200 charges in the window.
    let charges = [];
    let starting_after = null;
    for (let i = 0; i < 4; i++) {
      const url = new URL('https://api.stripe.com/v1/charges');
      url.searchParams.set('limit', '100');
      url.searchParams.set('created[gte]', String(since));
      if (starting_after) url.searchParams.set('starting_after', starting_after);
      const r = await fetch(url, { headers });
      if (!r.ok) break;
      const d = await r.json();
      const matched = (d.data || []).filter(c =>
        c.metadata?.product_id === productId ||
        c.metadata?.stripe_product_id === productId ||
        c.invoice && c.metadata?.dynasty_decision_id === String(decision.id)
      );
      charges = charges.concat(matched);
      if (!d.has_more || !d.data?.length) break;
      starting_after = d.data[d.data.length - 1].id;
    }
    if (!charges.length) {
      return { ok: false, source: 'stripe', error: 'no_charges_matched', skipped: true };
    }
    const paid = charges.filter(c => c.paid && !c.refunded).length;
    const refunded = charges.filter(c => c.refunded).length;
    const refund_rate = (paid + refunded) > 0 ? refunded / (paid + refunded) : null;
    const total_revenue_cents = charges.filter(c => c.paid).reduce((a, c) => a + (c.amount || 0), 0);
    return {
      ok: true,
      source: 'stripe',
      refund_rate,
      paid_count: paid,
      refunded_count: refunded,
      total_revenue_usd: total_revenue_cents / 100,
    };
  } catch (e) {
    return { ok: false, source: 'stripe', error: e.message };
  }
}

// Compose vendor pulls into a single metrics row + write to Neon.
async function collectForDecision(decision) {
  const [ph, st] = await Promise.all([
    fetchPostHogMetrics(decision),
    fetchStripeMetrics(decision),
  ]);
  // Compute predicted_vs_actual_delta. Predicted is the OIE opportunity_score
  // (0-100). Actual is a simple composite: 60% conversion-quality, 40%
  // refund-quality (low refund rate is good). We map both to 0-100 to match.
  const conversion_rate = ph.ok ? ph.conversion_rate : null;
  const refund_rate = st.ok ? st.refund_rate : null;
  const predicted = Number(decision.opportunity_score) || 0;
  let actual = null;
  if (conversion_rate != null || refund_rate != null) {
    // Neutral mid-point when one component is missing.
    const conv01 = conversion_rate != null ? Math.max(0, Math.min(1, conversion_rate)) : 0.05;
    const refund01 = refund_rate != null ? Math.max(0, Math.min(1, refund_rate)) : 0.05;
    // Conversion at 5% = "expected"; map linearly so 1% → 20, 5% → 60, 10%+ → 100.
    const convScore = Math.max(0, Math.min(100, Math.round(conv01 * 1000)));
    // Refund: 0% → 100, 10% → 0.
    const refundScore = Math.max(0, Math.min(100, Math.round((1 - refund01 * 10) * 100)));
    actual = Math.round(convScore * 0.6 + refundScore * 0.4);
  }
  const predicted_vs_actual_delta = actual != null ? Math.round(actual - predicted) : null;

  const metrics = {
    shipped: true,
    shipped_at: decision.shipped_at || null,
    pageviews_30d: ph.ok ? ph.pageviews_30d : null,
    conversion_rate,
    refund_rate,
    review_quality_avg: null,
    support_friction_events: null,
    upsell_conversion_rate: null,
    predicted_vs_actual_delta,
    notes: `auto: posthog=${ph.ok ? 'ok' : (ph.skipped ? 'skipped' : 'error')}; stripe=${st.ok ? 'ok' : (st.skipped ? 'skipped' : 'error')}`,
  };
  const writeOut = await recordPostLaunchMetrics({
    decision_id: decision.id,
    metrics,
    source: 'auto',
  });
  return { decision_id: decision.id, posthog: ph, stripe: st, written: writeOut, computed: metrics };
}

export default async function handler(req, res) {
  const origin = process.env.CORS_ORIGIN || 'https://yourdeputy.com';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query?.action || req.body?.action || 'summary';

  // ── Cron-callable: pull metrics for every shipped decision ────────────────
  // Hit by Vercel cron daily; also exposed to admin for ad-hoc runs.
  if (action === 'collect_cron' || action === 'run_collection_now') {
    if (!verifyCronOrAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized — cron secret or admin token required' });
    const ship = await listShippedDecisions();
    if (!ship.ok) return res.status(503).json({ ok: false, error: ship.error });
    const results = [];
    // Sequential (not parallel) — Stripe rate limits and we don't want a
    // burst from a single function instance.
    for (const d of ship.decisions) {
      try {
        const r = await collectForDecision(d);
        results.push({ id: d.id, topic: (d.topic || '').slice(0, 80), ok: r.written?.ok || false, computed: r.computed });
      } catch (e) {
        results.push({ id: d.id, topic: (d.topic || '').slice(0, 80), ok: false, error: e.message });
      }
    }
    return res.json({
      ok: true,
      ran_at: new Date().toISOString(),
      processed: results.length,
      results,
    });
  }

  // From here down, every action is admin-only.
  if (!verifyAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized — valid admin token required' });

  // ── Manual metrics entry (admin form) ─────────────────────────────────────
  if (action === 'manual_entry') {
    const parsed = PostLaunchMetricsEntry.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'invalid_input', issues: parsed.error.issues });
    const m = parsed.data;
    // Compute predicted_vs_actual_delta if not supplied but we have actuals.
    let pva = m.predicted_vs_actual_delta;
    if (pva == null && (m.conversion_rate != null || m.refund_rate != null)) {
      const got = await getDecision(m.decision_id);
      if (got.ok) {
        const predicted = Number(got.decision.opportunity_score) || 0;
        const conv01 = m.conversion_rate != null ? m.conversion_rate : 0.05;
        const refund01 = m.refund_rate != null ? m.refund_rate : 0.05;
        const convScore = Math.max(0, Math.min(100, Math.round(conv01 * 1000)));
        const refundScore = Math.max(0, Math.min(100, Math.round((1 - refund01 * 10) * 100)));
        const actual = Math.round(convScore * 0.6 + refundScore * 0.4);
        pva = Math.round(actual - predicted);
      }
    }
    const out = await recordPostLaunchMetrics({
      decision_id: m.decision_id,
      metrics: { ...m, predicted_vs_actual_delta: pva },
      source: 'manual',
    });
    return res.json(out);
  }

  // ── Summary: roster of shipped decisions + their latest metrics ───────────
  if (action === 'summary') {
    const [ship, agg] = await Promise.all([
      listShippedDecisions(),
      listPostLaunchMetricsAll(),
    ]);
    const aggBy = new Map((agg.metrics || []).map(r => [r.decision_id, r]));
    const rows = (ship.decisions || []).map(d => ({
      id: d.id,
      topic: d.topic,
      shipped_at: d.shipped_at,
      shipped_url: d.shipped_url,
      shipped_vercel_project_id: d.shipped_vercel_project_id,
      shipped_stripe_product_id: d.shipped_stripe_product_id,
      shipped_posthog_event_prefix: d.shipped_posthog_event_prefix,
      opportunity_score: d.opportunity_score,
      latest_metric: aggBy.get(d.id) || null,
    }));
    return res.json({ ok: true, shipped: rows, count: rows.length });
  }

  return res.status(400).json({
    ok: false,
    error: `Unknown action: ${action}`,
    valid_actions: ['summary', 'manual_entry', 'run_collection_now', 'collect_cron'],
  });
}
