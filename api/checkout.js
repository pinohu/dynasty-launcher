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
      foundation: { amount: 49700, name: 'Your Deputy — Foundation', desc: '9 consulting-grade strategy documents, SBA business plan, investor readiness package, 8-framework viability scorecard, production application deployed to your domain, 65+ files, private code repository + PostgreSQL database.' },
      starter: { amount: 49700, name: 'Your Deputy — Foundation', desc: '9 consulting-grade strategy documents, SBA business plan, investor readiness package, 8-framework viability scorecard, production application deployed to your domain, 65+ files, private code repository + PostgreSQL database.' },
      professional: { amount: 149700, name: 'Your Deputy — Professional', desc: 'Everything in Foundation plus: custom domain + authenticated business email (SPF/DKIM), connected payment account, CRM + client portal, 5-email marketing automation, AI chatbot, behavioral analytics + lead tracking.' },
      enterprise: { amount: 299700, name: 'Your Deputy — Enterprise', desc: 'Complete operational business: all 17 modules including AI voice agent, SMS campaigns, SEO content, explainer video, design assets, 7 automation workflows, legal documents, 260-post social calendar, and more.' }
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
          'line_items[0][price_data][unit_amount]=19700',
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
