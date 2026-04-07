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
    // plan: 'single' ($29 one-time) or 'unlimited' ($99/mo subscription)
    
    try {
      const stripe = require('stripe')(STRIPE_SECRET);
      
      let sessionParams = {
        payment_method_types: ['card'],
        success_url: `${APP_URL}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL}?payment=cancelled`,
        metadata: { source: 'dynasty-launcher', plan: plan || 'single' },
      };

      if (email) sessionParams.customer_email = email;

      if (plan === 'unlimited') {
        // Monthly unlimited subscription
        sessionParams.mode = 'subscription';
        sessionParams.line_items = [{
          price_data: {
            currency: 'usd',
            unit_amount: 9900, // $99/mo
            recurring: { interval: 'month' },
            product_data: {
              name: 'Dynasty Launcher — Unlimited',
              description: 'Unlimited builds per month. All frameworks. All templates. Priority support.',
            },
          },
          quantity: 1,
        }];
      } else {
        // Single build — one-time payment
        sessionParams.mode = 'payment';
        sessionParams.line_items = [{
          price_data: {
            currency: 'usd',
            unit_amount: 2900, // $29
            product_data: {
              name: 'Dynasty Launcher — Single Build',
              description: 'One complete business system build: 30+ files, infrastructure provisioning, strategic analysis.',
            },
          },
          quantity: 1,
        }];
      }

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
