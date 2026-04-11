// Your Deputy — Stripe Checkout API
// Handles: create checkout session, verify payment, usage tracking
// Uses Stripe REST API directly (no SDK — no package.json in this project)

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://yourdeputy.com';

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

    const { plan, email } = req.body || {};

    const tiers = {
      foundation: { amount: 199700, name: 'Your Deputy — Foundation', desc: '90+ consulting-grade documents (strategy, financial, legal, hiring, operations; typically tens of thousands of words, varies by session). SBA business plan, investor readiness, cap table themes, tax strategy. Production app + repo deploy. No automatic server-side integration module provisioning on Foundation — use OPERATIONS.md or upgrade to Professional+. $71K–$131K equivalent value.' },
      starter: { amount: 199700, name: 'Your Deputy — Foundation', desc: '90+ consulting-grade documents (strategy, financial, legal, hiring, operations; typically tens of thousands of words, varies by session). SBA business plan, investor readiness, cap table themes, tax strategy. Production app + repo deploy. No automatic server-side integration module provisioning on Foundation — use OPERATIONS.md or upgrade to Professional+. $71K–$131K equivalent value.' },
      professional: { amount: 499700, name: 'Your Deputy — Professional', desc: 'Everything in Foundation plus attempts at core live stack where APIs succeed: domain/email patterns, connected payments, CRM, marketing sequences, chatbot, analytics, automation (subject to keys and archetype deferrals). $100K–$170K equivalent value.' },
      enterprise: { amount: 999700, name: 'Your Deputy — Enterprise', desc: 'Broadest integration attempts: up to 17 module types when your site package does not skip them — subject to API success, keys, and implementation status. Plus creative, SEO, social calendar, and directory/WP paths per spec. See BUILD-MANIFEST.json for your build. $71K–$194K equivalent value.' }
    };
    const tierDef = tiers[plan] || tiers.foundation;
    const enc = (s) => encodeURIComponent(s);

    try {
      const params = [
        'payment_method_types[0]=card',
        'mode=payment',
        `success_url=${enc(`${APP_URL}/app?payment=success&session_id={CHECKOUT_SESSION_ID}&tier=${plan || 'foundation'}`)}`,
        `cancel_url=${enc(`${APP_URL}/app?payment=cancelled`)}`,
        `metadata[source]=your-deputy`,
        `metadata[plan]=${plan || 'foundation'}`,
        `line_items[0][price_data][currency]=usd`,
        `line_items[0][price_data][unit_amount]=${tierDef.amount}`,
        `line_items[0][price_data][product_data][name]=${enc(tierDef.name)}`,
        `line_items[0][price_data][product_data][description]=${enc(tierDef.desc)}`,
        `line_items[0][quantity]=1`
      ];
      if (email) params.push(`customer_email=${enc(email)}`);

      // Managed Operations is a $197/mo subscription — use Stripe subscription mode
      if (plan === 'managed') {
        const subParams = [
          'payment_method_types[0]=card',
          'mode=subscription',
          `success_url=${enc(`${APP_URL}/app?payment=success&session_id={CHECKOUT_SESSION_ID}&tier=managed`)}`,
          `cancel_url=${enc(`${APP_URL}/app?payment=cancelled`)}`,
          'metadata[source]=your-deputy',
          'metadata[plan]=managed',
          'line_items[0][price_data][currency]=usd',
          'line_items[0][price_data][unit_amount]=49700',
          `line_items[0][price_data][product_data][name]=${enc('Your Deputy — Managed Operations')}`,
          `line_items[0][price_data][product_data][description]=${enc('Monthly managed operations: weekly performance reports, priority support, automation monitoring, quarterly strategy refresh, ongoing optimization.')}`,
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

    const { session_id } = req.body || {};
    if (!session_id) return res.json({ ok: false, error: 'session_id required' });

    try {
      const session = await stripeGet(`checkout/sessions/${session_id}`);
      if (session.error) return res.json({ ok: false, error: session.error.message });
      const isPaid = session.payment_status === 'paid' ||
                     (session.mode === 'subscription' && session.status === 'complete');
      return res.json({
        ok: true,
        paid: isPaid,
        plan: session.metadata?.plan || 'foundation',
        mode: session.mode,
        customer_email: session.customer_email || session.customer_details?.email,
        amount: session.amount_total,
        currency: session.currency,
      });
    } catch (e) {
      return res.json({ ok: false, error: e.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action. Use: create_session, verify' });
}
