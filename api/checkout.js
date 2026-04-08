// Dynasty Launcher — Stripe Checkout API
// Handles: create checkout session, verify payment, usage tracking

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://dynasty-launcher.vercel.app';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { action } = req.query;

  // ── Create Checkout Session ──────────────────────────────────────
  if (action === 'create_session') {
    if (!STRIPE_SECRET) return res.json({ ok: false, error: 'Stripe not configured' });
    
    const { plan, email } = req.body || {};
    // V3 tiers: starter ($297), professional ($997), enterprise ($2,497)

    try {
      const stripe = require('stripe')(STRIPE_SECRET);

      let sessionParams = {
        payment_method_types: ['card'],
        mode: 'payment',
        success_url: `${APP_URL}?payment=success&session_id={CHECKOUT_SESSION_ID}&tier=${plan || 'starter'}`,
        cancel_url: `${APP_URL}?payment=cancelled`,
        metadata: { source: 'dynasty-launcher', plan: plan || 'starter' },
      };

      if (email) sessionParams.customer_email = email;

      const tiers = {
        starter: { amount: 29700, name: 'Dynasty Launcher — Starter', desc: 'Code + docs + Vercel deployment. 30+ production files, 8-framework viability analysis, GitHub repo + Neon database.' },
        professional: { amount: 99700, name: 'Dynasty Launcher — Professional', desc: 'Everything in Starter plus: custom domain, business email, Stripe billing, CRM, email marketing, chatbot, analytics.' },
        enterprise: { amount: 249700, name: 'Dynasty Launcher — Enterprise', desc: 'All 17 modules: domain, email, phone, CRM, billing, SEO, video, design, analytics, leads, automation, legal docs, and more.' }
      };
      const tierDef = tiers[plan] || tiers.starter;

      sessionParams.line_items = [{
        price_data: {
          currency: 'usd',
          unit_amount: tierDef.amount,
          product_data: { name: tierDef.name, description: tierDef.desc },
        },
        quantity: 1,
      }];

      const session = await stripe.checkout.sessions.create(sessionParams);
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
      const stripe = require('stripe')(STRIPE_SECRET);
      const session = await stripe.checkout.sessions.retrieve(session_id);
      
      return res.json({
        ok: true,
        paid: session.payment_status === 'paid',
        plan: session.metadata?.plan || 'single',
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
