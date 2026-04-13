// Your Deputy — Stripe Checkout API
// Handles: create checkout session, verify payment, usage tracking, session recovery
// Uses Stripe REST API directly (no SDK — no package.json in this project)

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://yourdeputy.com';
const ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const RECOVER_ATTEMPTS = new Map();
const RECOVER_MAX = 5;
const RECOVER_WINDOW_MS = 15 * 60 * 1000;

function isRecoverRateLimited(req) {
  const xf = (req.headers['x-forwarded-for'] || '').toString();
  const ip = xf.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const e = RECOVER_ATTEMPTS.get(ip);
  if (!e || now - e.start > RECOVER_WINDOW_MS) {
    RECOVER_ATTEMPTS.set(ip, { start: now, count: 1 });
    return false;
  }
  e.count++;
    if (RECOVER_ATTEMPTS.size > 5000) { const now = Date.now(); for (const [k,v] of RECOVER_ATTEMPTS) { if (now - v.start > RECOVER_WINDOW_MS) RECOVER_ATTEMPTS.delete(k); } }
    return e.count > RECOVER_MAX;
}

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


const SESSION_ATTEMPTS = new Map();
const SESSION_MAX = 10;
const SESSION_WINDOW_MS = 15 * 60 * 1000;
function isSessionRateLimited(req) {
  const xf = (req.headers['x-forwarded-for'] || '').toString();
  const ip = xf.split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const e = SESSION_ATTEMPTS.get(ip);
  if (!e || now - e.start > SESSION_WINDOW_MS) { SESSION_ATTEMPTS.set(ip, { start: now, count: 1 }); return false; }
  e.count++;
  if (SESSION_ATTEMPTS.size > 5000) { for (const [k,v] of SESSION_ATTEMPTS) { if (now - v.start > SESSION_WINDOW_MS) SESSION_ATTEMPTS.delete(k); } }
  return e.count > SESSION_MAX;
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
    if (isSessionRateLimited(req)) { res.setHeader('Retry-After', '900'); return res.status(429).json({ ok: false, error: 'Too many checkout attempts. Try again later.' }); }
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
      scoring_pro: { amount: 1900, name: 'Your Deputy — Scoring Pro', desc: 'Monthly scoring access with higher monthly limits, account-level history, and fair-use safeguards.' },
      strategy_pack: { amount: 69700, name: 'Your Deputy — Strategy Pack', desc: 'All 90+ consulting-grade documents — strategy, legal, financial, marketing, operations — as a downloadable .zip. No code generation or deployment. $697 credited toward Foundation within 30 days.' },
      foundation: { amount: 199700, name: 'Your Deputy — Foundation', desc: '90+ consulting-grade documents (strategy, financial, legal, hiring, operations; typically tens of thousands of words, varies by session). SBA business plan, investor readiness, cap table themes, tax strategy. Production app + repo deploy. No automatic server-side integration module provisioning on Foundation — use OPERATIONS.md or upgrade to Professional+. $71K–$131K equivalent value.' },
      starter: { amount: 199700, name: 'Your Deputy — Foundation', desc: '90+ consulting-grade documents (strategy, financial, legal, hiring, operations; typically tens of thousands of words, varies by session). SBA business plan, investor readiness, cap table themes, tax strategy. Production app + repo deploy. No automatic server-side integration module provisioning on Foundation — use OPERATIONS.md or upgrade to Professional+. $71K–$131K equivalent value.' },
      professional: { amount: 499700, name: 'Your Deputy — Professional', desc: 'Everything in Foundation plus attempts at core live stack where APIs succeed: domain/email patterns, connected payments, CRM, marketing sequences, chatbot, analytics, automation (subject to keys and archetype deferrals). $100K–$170K equivalent value.' },
      enterprise: { amount: 999700, name: 'Your Deputy — Enterprise', desc: 'Broadest integration attempts: up to 17 module types when your site package does not skip them — subject to API success, keys, and implementation status. Plus creative, SEO, social calendar, and directory/WP paths per spec. See BUILD-MANIFEST.json for your build. $71K–$194K equivalent value.' }
    };
    const tierDef = tiers[normalizedPlan];
    if (!tierDef) return res.status(400).json({ error: `Unknown plan: ${normalizedPlan}. Valid plans: ${Object.keys(tiers).join(', ')}` });
    const isBlueprintCreditablePlan = !['blueprint', 'managed', 'scoring_pro', 'strategy_pack'].includes(normalizedPlan);
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
      if (normalizedPlan === 'managed' || normalizedPlan === 'scoring_pro') {
        const subParams = [
          'payment_method_types[0]=card',
          'mode=subscription',
          `success_url=${enc(`${APP_URL}/app?payment=success&session_id={CHECKOUT_SESSION_ID}&tier=${normalizedPlan}`)}`,
          `cancel_url=${enc(`${APP_URL}/app?payment=cancelled`)}`,
          'metadata[source]=your-deputy',
          `metadata[plan]=${normalizedPlan}`,
          `metadata[training_opt_in]=${training_opt_in ? 'yes' : 'no'}`,
          `metadata[build_archetype]=${enc((build_archetype || '').slice(0, 64))}`,
          `metadata[source_segment]=${enc((source_segment || '').slice(0, 64))}`,
          `metadata[diagnostic_session_id]=${enc((diagnostic_session_id || '').slice(0, 96))}`,
          `metadata[recommended_plan]=${enc((recommended_plan || '').slice(0, 48))}`,
          `metadata[user_id]=${enc((user_id || '').slice(0, 96))}`,
          'line_items[0][price_data][currency]=usd',
          `line_items[0][price_data][unit_amount]=${normalizedPlan === 'managed' ? 49700 : 1900}`,
          `line_items[0][price_data][product_data][name]=${enc(normalizedPlan === 'managed' ? 'Your Deputy — Managed Automation Runtime' : 'Your Deputy — Scoring Pro')}`,
          `line_items[0][price_data][product_data][description]=${enc(normalizedPlan === 'managed'
            ? 'Monthly autonomous runtime monitoring, retry queues, optimization reports, and system health checks.'
            : 'Monthly scoring access with expanded limits and fair-use controls.')}`,
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
      return res.json({ ok: false, error: 'Checkout processing error. Please try again.' });
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
      return res.json({ ok: false, error: 'Checkout processing error. Please try again.' });
    }
  }

  // ── Session Recovery — send a code to email ─────────────────────
  if (action === 'recover_start') {
    if (!STRIPE_SECRET) return res.json({ ok: false, error: 'Recovery unavailable' });
    if (isRecoverRateLimited(req)) { res.setHeader('Retry-After', '900'); return res.status(429).json({ ok: false, error: 'Too many attempts. Try again later.' }); }
    const { email } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Valid email required' });
    }
    try {
      const { createHmac } = await import('crypto');
      const window5m = Math.floor(Date.now() / 300000);
      const secret = process.env.PAYMENT_ACCESS_SECRET || STRIPE_SECRET;
      const code = createHmac('sha256', secret).update(`recover:${email.toLowerCase()}:${window5m}`).digest('hex').slice(-6).toUpperCase();

      const emailitKey = process.env.EMAILIT_API_KEY;
      if (emailitKey) {
        await fetch('https://api.emailit.com/v2/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${emailitKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Your Deputy <hello@yourdeputy.com>',
            to: email,
            subject: 'Your Deputy — Sign-in code',
            text: `Your sign-in code is: ${code}\n\nThis code expires in 5 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n\nhttps://yourdeputy.com`
          })
        });
        return res.json({ ok: true, sent: true });
      }
      return res.json({ ok: false, error: 'Email service not configured. Contact support.' });
    } catch (e) {
      return res.json({ ok: false, error: 'Could not send code. Try again.' });
    }
  }

  // ── Session Recovery — verify code and return session ──────────
  if (action === 'recover_verify') {
    if (!STRIPE_SECRET) return res.json({ ok: false, error: 'Recovery unavailable' });
    if (isRecoverRateLimited(req)) { res.setHeader('Retry-After', '900'); return res.status(429).json({ ok: false, error: 'Too many attempts. Try again later.' }); }
    const { email, code } = req.body || {};
    if (!email || !code) return res.status(400).json({ ok: false, error: 'email and code required' });
    try {
      const { createHmac } = await import('crypto');
      const secret = process.env.PAYMENT_ACCESS_SECRET || STRIPE_SECRET;
      const now5m = Math.floor(Date.now() / 300000);
      let valid = false;
      for (let w = now5m; w >= now5m - 1; w--) {
        const expected = createHmac('sha256', secret).update(`recover:${email.toLowerCase()}:${w}`).digest('hex').slice(-6).toUpperCase();
        if (code.toUpperCase() === expected) { valid = true; break; }
      }
      if (!valid) return res.json({ ok: false, error: 'Invalid or expired code' });

      const enc = (s) => encodeURIComponent(s);
      const sessions = await stripeGet(`checkout/sessions?limit=10&customer_details%5Bemail%5D=${enc(email.toLowerCase())}`);
      const paid = (sessions.data || []).find(s => s.payment_status === 'paid' || (s.mode === 'subscription' && s.status === 'complete'));
      if (!paid) return res.json({ ok: false, error: 'Could not verify. Check your email and try again.' });

      const accessToken = await signPaidAccessToken({
        sessionId: paid.id, userId: '', plan: paid.metadata?.plan || 'foundation'
      });
      return res.json({
        ok: true,
        paid: true,
        session_id: paid.id,
        plan: paid.metadata?.plan || 'foundation',
        access_token: accessToken,
        customer_email: paid.customer_email || paid.customer_details?.email,
      });
    } catch (e) {
      return res.json({ ok: false, error: 'Recovery failed. Please try again.' });
    }
  }

  return res.status(400).json({ error: 'Unknown action. Use: create_session, verify, recover_start, recover_verify' });
}
