// Your Deputy — Stripe Checkout API
// Handles: create checkout session, verify payment, usage tracking
// Uses Stripe REST API directly (no SDK — no package.json in this project)

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://yourdeputy.com';
const ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function signPaidAccessToken({ sessionId, userId, plan }) {
  const secret = process.env.PAYMENT_ACCESS_SECRET || STRIPE_SECRET || '';
  if (!secret || !sessionId) return null;
  const uid = (userId || '').trim() || 'anon';
  const tier = (plan || 'foundation').toString().toLowerCase();
  const exp = Date.now() + ACCESS_TOKEN_TTL_MS;
  const payload = `pay:${sessionId}:${uid}:${tier}:${exp}`;
  const { createHmac } = await import('crypto');
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}:${sig}`;
}

async function stripePost(endpoint, params) {
  const auth = Buffer.from(`${STRIPE_SECRET}:`).toString('base64');
  const resp = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  return resp.json();
}

async function stripeGet(endpoint) {
  const auth = Buffer.from(`${STRIPE_SECRET}:`).toString('base64');
  const resp = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    headers: { 'Authorization': `Basic ${auth}` }
  });
  return resp.json();
}

export default async function handler(req, res) {
  const allowedOrigin = process.env.CORS_ORIGIN || 'https://yourdeputy.com';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { action } = req.query;

  // ── Create Checkout Session ──────────────────────────────────────
  if (action === 'create_session') {
    if (!STRIPE_SECRET) return res.json({ ok: false, error: 'Stripe not configured' });

    const { plan, email, user_id, training_opt_in, build_archetype, source_segment, diagnostic_session_id, recommended_plan, apply_blueprint_credit } = req.body || {};
    const normalizedPlan = (plan || 'foundation').toString().toLowerCase();
    if (normalizedPlan === 'custom_volume') {
      return res.json({
        ok: false,
        contact_required: true,
        error: 'Custom volume plans are configured through sales onboarding.',
        contact_email: 'ikeohu@dynastyempire.com'
      });
    }

    const tiers = {
      blueprint: { amount: 29700, name: 'Your Deputy — Diagnostic + Execution Blueprint', desc: 'Conversion-grade execution blueprint: risk map, priority sequence, execution path, and persona-matched package recommendation. 100% creditable toward a paid build started within 14 days.' },
      foundation: { amount: 199700, name: 'Your Deputy — Foundation', desc: '90+ consulting-grade documents (strategy, financial, legal, hiring, operations; typically tens of thousands of words, varies by session). SBA business plan, investor readiness, cap table themes, tax strategy. Production app + repo deploy. No automatic server-side integration module provisioning on Foundation — use OPERATIONS.md or upgrade to Professional+. $71K–$131K equivalent value.' },
      starter: { amount: 199700, name: 'Your Deputy — Foundation', desc: '90+ consulting-grade documents (strategy, financial, legal, hiring, operations; typically tens of thousands of words, varies by session). SBA business plan, investor readiness, cap table themes, tax strategy. Production app + repo deploy. No automatic server-side integration module provisioning on Foundation — use OPERATIONS.md or upgrade to Professional+. $71K–$131K equivalent value.' },
      professional: { amount: 499700, name: 'Your Deputy — Professional', desc: 'Everything in Foundation plus attempts at core live stack where APIs succeed: domain/email patterns, connected payments, CRM, marketing sequences, chatbot, analytics, automation (subject to keys and archetype deferrals). $100K–$170K equivalent value.' },
      enterprise: { amount: 999700, name: 'Your Deputy — Enterprise', desc: 'Broadest integration attempts: up to 17 module types when your site package does not skip them — subject to API success, keys, and implementation status. Plus creative, SEO, social calendar, and directory/WP paths per spec. See BUILD-MANIFEST.json for your build. $71K–$194K equivalent value.' }
    };
    const tierDef = tiers[normalizedPlan] || tiers.foundation;
    const isBlueprintCreditablePlan = !['blueprint', 'managed'].includes(normalizedPlan);
    const wantsBlueprintCredit = !!apply_blueprint_credit && isBlueprintCreditablePlan;
    const blueprintCreditCents = wantsBlueprintCredit ? Math.min(29700, Math.max(0, tierDef.amount - 5000)) : 0;
    const finalAmount = Math.max(5000, tierDef.amount - blueprintCreditCents);
    const enc = (s) => encodeURIComponent(s);

    try {
      const params = [
        'payment_method_types[0]=card',
        'mode=payment',
        `success_url=${enc(`${APP_URL}/app?payment=success&session_id={CHECKOUT_SESSION_ID}&tier=${normalizedPlan || 'foundation'}`)}`,
        `cancel_url=${enc(`${APP_URL}/app?payment=cancelled`)}`,
        `metadata[source]=your-deputy`,
        `metadata[plan]=${normalizedPlan || 'foundation'}`,
        `metadata[training_opt_in]=${training_opt_in ? 'yes' : 'no'}`,
        `metadata[build_archetype]=${enc((build_archetype || '').slice(0, 64))}`,
        `metadata[source_segment]=${enc((source_segment || '').slice(0, 64))}`,
        `metadata[diagnostic_session_id]=${enc((diagnostic_session_id || '').slice(0, 96))}`,
        `metadata[recommended_plan]=${enc((recommended_plan || '').slice(0, 48))}`,
        `metadata[user_id]=${enc((user_id || '').slice(0, 96))}`,
        `metadata[blueprint_credit_applied]=${blueprintCreditCents > 0 ? 'yes' : 'no'}`,
        `metadata[blueprint_credit_amount]=${blueprintCreditCents}`,
        `line_items[0][price_data][currency]=usd`,
        `line_items[0][price_data][unit_amount]=${finalAmount}`,
        `line_items[0][price_data][product_data][name]=${enc(tierDef.name)}`,
        `line_items[0][price_data][product_data][description]=${enc(tierDef.desc)}`,
        `line_items[0][quantity]=1`
      ];
      if (email) params.push(`customer_email=${enc(email)}`);

      // Managed Automation Runtime is a $497/mo subscription — use Stripe subscription mode
      if (normalizedPlan === 'managed') {
        const subParams = [
          'payment_method_types[0]=card',
          'mode=subscription',
          `success_url=${enc(`${APP_URL}/app?payment=success&session_id={CHECKOUT_SESSION_ID}&tier=managed`)}`,
          `cancel_url=${enc(`${APP_URL}/app?payment=cancelled`)}`,
          'metadata[source]=your-deputy',
          'metadata[plan]=managed',
          `metadata[training_opt_in]=${training_opt_in ? 'yes' : 'no'}`,
          `metadata[build_archetype]=${enc((build_archetype || '').slice(0, 64))}`,
          `metadata[source_segment]=${enc((source_segment || '').slice(0, 64))}`,
          `metadata[diagnostic_session_id]=${enc((diagnostic_session_id || '').slice(0, 96))}`,
          `metadata[recommended_plan]=${enc((recommended_plan || '').slice(0, 48))}`,
          `metadata[user_id]=${enc((user_id || '').slice(0, 96))}`,
          'line_items[0][price_data][currency]=usd',
          'line_items[0][price_data][unit_amount]=49700',
          `line_items[0][price_data][product_data][name]=${enc('Your Deputy — Managed Automation Runtime')}`,
          `line_items[0][price_data][product_data][description]=${enc('Monthly autonomous runtime monitoring, retry queues, optimization reports, and system health checks.')}`,
          'line_items[0][price_data][recurring][interval]=month',
          'line_items[0][quantity]=1'
        ];
        if (email) subParams.push(`customer_email=${enc(email)}`);
        const subSession = await stripePost('checkout/sessions', subParams.join('&'));
        if (subSession.error) return res.json({ ok: false, error: subSession.error.message });
        return res.json({ ok: true, url: subSession.url, session_id: subSession.id });
      }

      const session = await stripePost('checkout/sessions', params.join('&'));
      if (session.error) return res.json({ ok: false, error: session.error.message });
      return res.json({ ok: true, url: session.url, session_id: session.id });
    } catch (e) {
      return res.json({ ok: false, error: e.message });
    }
  }

  // ── Verify Payment ───────────────────────────────────────────────
  if (action === 'verify') {
    if (!STRIPE_SECRET) return res.json({ ok: false, error: 'Stripe not configured' });

    const { session_id, user_id } = req.body || {};
    if (!session_id) return res.json({ ok: false, error: 'session_id required' });

    try {
      const session = await stripeGet(`checkout/sessions/${session_id}`);
      if (session.error) return res.json({ ok: false, error: session.error.message });
      const sessionUserId = (session.metadata?.user_id || '').toString().trim();
      const requestUserId = (user_id || '').toString().trim();
      if (sessionUserId && requestUserId && sessionUserId !== requestUserId) {
        return res.status(403).json({ ok: false, error: 'Session ownership mismatch' });
      }
      const isPaid = session.payment_status === 'paid' ||
                     (session.mode === 'subscription' && session.status === 'complete');
      const accessToken = isPaid ? await signPaidAccessToken({
        sessionId: session_id,
        userId: requestUserId || sessionUserId || '',
        plan: session.metadata?.plan || 'foundation',
      }) : null;
      return res.json({
        ok: true,
        paid: isPaid,
        plan: session.metadata?.plan || 'foundation',
        metadata: session.metadata || {},
        mode: session.mode,
        customer_email: session.customer_email || session.customer_details?.email,
        amount: session.amount_total,
        currency: session.currency,
        access_token: accessToken,
        access_token_expires_in_ms: accessToken ? ACCESS_TOKEN_TTL_MS : 0,
      });
    } catch (e) {
      return res.json({ ok: false, error: e.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action. Use: create_session, verify' });
}
