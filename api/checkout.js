// Your Deputy — Stripe Checkout API
// Handles: create checkout session, verify payment, usage tracking, session recovery
// Uses Stripe REST API directly (no SDK — no package.json in this project)

import crypto from 'node:crypto';

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://yourdeputy.com';
const ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const RECOVER_ATTEMPTS = new Map();
const RECOVERY_CODES = new Map();
const RECOVER_MAX = 5;
const RECOVER_WINDOW_MS = 15 * 60 * 1000;
const RECOVER_CODE_TTL_MS = 10 * 60 * 1000;
const RECOVER_CODE_MAX_ATTEMPTS = 5;

function signingSecret() {
  return process.env.PAYMENT_ACCESS_SECRET || STRIPE_SECRET || '';
}

function hmacHex(payload) {
  const secret = signingSecret();
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function hashCheckoutNonce(nonce) {
  const value = String(nonce || '').trim();
  if (!value || value.length < 16 || value.length > 128) return '';
  return hmacHex(`checkout-verify:${value}`);
}

function verifyCheckoutNonce(nonce, expectedHash) {
  const hash = hashCheckoutNonce(nonce);
  return !!hash && !!expectedHash && timingSafeEqualString(hash, expectedHash);
}

function recoveryEmailKey(email) {
  return hmacHex(`recover-email:${String(email || '').trim().toLowerCase()}`);
}

function recoveryCodeHash(email, code) {
  return hmacHex(`recover-code:${String(email || '').trim().toLowerCase()}:${String(code || '').trim().toUpperCase()}`);
}

function randomRecoveryCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function cleanupRecoveryCodes() {
  const now = Date.now();
  if (RECOVERY_CODES.size <= 5000) return;
  for (const [key, value] of RECOVERY_CODES) {
    if (!value || value.expires_at <= now) RECOVERY_CODES.delete(key);
  }
}

function genericRecoveryStart(res) {
  return res.json({
    ok: true,
    sent: true,
    message: 'If a paid session exists for that email, a sign-in code will be sent.',
  });
}

function storeRecoveryCode(email, code, paidSession) {
  const key = recoveryEmailKey(email);
  if (!key) return false;
  RECOVERY_CODES.set(key, {
    code_hash: recoveryCodeHash(email, code),
    expires_at: Date.now() + RECOVER_CODE_TTL_MS,
    attempts: 0,
    paid_session: paidSession,
  });
  cleanupRecoveryCodes();
  return true;
}

function verifyStoredRecoveryCode(email, code) {
  const key = recoveryEmailKey(email);
  const entry = key ? RECOVERY_CODES.get(key) : null;
  if (!entry) return { ok: false, error: 'Invalid or expired code' };
  if (entry.expires_at <= Date.now()) {
    RECOVERY_CODES.delete(key);
    return { ok: false, error: 'Invalid or expired code' };
  }
  entry.attempts += 1;
  if (entry.attempts > RECOVER_CODE_MAX_ATTEMPTS) {
    RECOVERY_CODES.delete(key);
    return { ok: false, error: 'Too many attempts. Request a new code.' };
  }
  const supplied = recoveryCodeHash(email, code);
  if (!supplied || !timingSafeEqualString(supplied, entry.code_hash)) {
    return { ok: false, error: 'Invalid or expired code' };
  }
  RECOVERY_CODES.delete(key);
  return { ok: true, paid_session: entry.paid_session };
}

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
  const secret = signingSecret();
  if (!secret || !sessionId) return null;
  const uid = (userId || '').trim() || 'anon';
  const tier = (plan || 'foundation').toString().toLowerCase();
  const exp = Date.now() + ACCESS_TOKEN_TTL_MS;
  const payload = `pay:${sessionId}:${uid}:${tier}:${exp}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}:${sig}`;
}

async function stripePost(endpoint, params) {
  const auth = Buffer.from(`${STRIPE_SECRET}:`).toString('base64');
  const resp = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  const data = await resp.json();
  if (!resp.ok) data._http_error = resp.status;
  return data;
}

async function stripeGet(endpoint) {
  const auth = Buffer.from(`${STRIPE_SECRET}:`).toString('base64');
  const resp = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    headers: { 'Authorization': `Basic ${auth}` }
  });
  const data = await resp.json();
  if (!resp.ok) data._http_error = resp.status;
  return data;
}

async function sendRecoveryEmail({ email, code }) {
  const subject = 'Your Deputy - Sign-in code';
  const text = `Your sign-in code is: ${code}\n\nThis code expires in 5 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n\nhttps://yourdeputy.com`;
  const from = process.env.RECOVERY_EMAIL_FROM || 'Your Deputy <hello@yourdeputy.com>';
  const realKey = (value) => {
    const key = (value || '').trim();
    return key && !key.startsWith('STUB_') ? key : '';
  };
  const emailitKey = realKey(process.env.EMAILIT_API_KEY);
  const resendKey = realKey(process.env.RESEND_API_KEY || process.env.RESEND_KEY);
  const sendgridKey = realKey(process.env.SENDGRID_API_KEY);

  if (emailitKey) {
    const resp = await fetch('https://api.emailit.com/v2/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${emailitKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: email, subject, text })
    });
    const body = await resp.text().catch(() => '');
    if (resp.ok) return { ok: true, provider: 'emailit' };
    return { ok: false, provider: 'emailit', status: resp.status, body: body.slice(0, 300) };
  }

  if (resendKey) {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject, text })
    });
    const body = await resp.text().catch(() => '');
    if (resp.ok) return { ok: true, provider: 'resend' };
    return { ok: false, provider: 'resend', status: resp.status, body: body.slice(0, 300) };
  }

  if (sendgridKey) {
    const fromEmail = process.env.RECOVERY_EMAIL_FROM_ADDRESS || 'hello@yourdeputy.com';
    const fromName = process.env.RECOVERY_EMAIL_FROM_NAME || 'Your Deputy';
    const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: fromEmail, name: fromName },
        subject,
        content: [{ type: 'text/plain', value: text }]
      })
    });
    const body = await resp.text().catch(() => '');
    if (resp.ok) return { ok: true, provider: 'sendgrid' };
    return { ok: false, provider: 'sendgrid', status: resp.status, body: body.slice(0, 300) };
  }

  return { ok: false, provider: 'none', error: 'No recovery email provider configured' };
}

async function findPaidSessionByEmail(email) {
  const normalized = email.toLowerCase();
  const sessions = await stripeGet('checkout/sessions?limit=100');
  if (sessions.error || sessions._http_error) {
    return { ok: false, error: sessions.error?.message || 'Stripe lookup failed' };
  }
  const paid = (sessions.data || []).find(s => {
    const sessionEmail = (s.customer_email || s.customer_details?.email || '').toLowerCase();
    const paidSession = s.payment_status === 'paid' || (s.mode === 'subscription' && s.status === 'complete');
    return paidSession && sessionEmail === normalized;
  });
  return { ok: true, paid };
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
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  const { action } = req.query;

  // ── Create Checkout Session ──────────────────────────────────────
  if (action === 'create_session') {
    if (isSessionRateLimited(req)) { res.setHeader('Retry-After', '900'); return res.status(429).json({ ok: false, error: 'Too many checkout attempts. Try again later.' }); }
    if (!STRIPE_SECRET) return res.json({ ok: false, error: 'Stripe not configured' });

    const { plan, email, user_id, training_opt_in, build_archetype, source_segment, diagnostic_session_id, recommended_plan, apply_blueprint_credit, verify_nonce } = req.body || {};
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
      foundation: { amount: 199700, name: 'Your Deputy — Foundation', desc: '90+ consulting-grade documents plus production Next.js app, deployment, and Day-1 Success Kit. Server-side integration attempts use the same 11-slot allowlist as Professional in api/provision.js (hosting/DNS, billing, email, chatbot, SEO, design, analytics, automation, docs, social, vertical tool) when vendor keys, archetype, and API health allow — not a guarantee every vendor succeeds. See BUILD-MANIFEST.json and OPERATIONS.md per build. $71K–$131K equivalent value.' },
      starter: { amount: 199700, name: 'Your Deputy — Foundation', desc: '90+ consulting-grade documents plus production Next.js app, deployment, and Day-1 Success Kit. Server-side integration attempts use the same 11-slot allowlist as Professional in api/provision.js (hosting/DNS, billing, email, chatbot, SEO, design, analytics, automation, docs, social, vertical tool) when vendor keys, archetype, and API health allow — not a guarantee every vendor succeeds. See BUILD-MANIFEST.json and OPERATIONS.md per build. $71K–$131K equivalent value.' },
      professional: { amount: 499700, name: 'Your Deputy — Professional', desc: 'Same 11-slot server integration allowlist as Foundation in api/provision.js; Professional is the higher build tier ($4,997) for buyers who need that positioning. Outcomes still depend on keys, archetype deferrals, and API success — see BUILD-MANIFEST.json. $100K–$170K equivalent value.' },
      enterprise: { amount: 999700, name: 'Your Deputy — Enterprise', desc: 'Everything in Professional, plus two additional orchestrator slots (13 total): WordPress/managed CMS path and post-deploy verification — still subject to keys and skips. Voice, SMS, CRM, directory, lead intel, and full video pipelines require Custom Volume (19-slot allowlist) or manual follow-up. See BUILD-MANIFEST.json and /maturity. $71K–$194K equivalent value.' }
    };
    const tierDef = tiers[normalizedPlan];
    if (!tierDef) return res.status(400).json({ ok: false, error: `Unknown plan: ${normalizedPlan}. Valid plans: ${Object.keys(tiers).join(', ')}` });
    const isBlueprintCreditablePlan = !['blueprint', 'managed', 'scoring_pro', 'strategy_pack'].includes(normalizedPlan);
    const wantsBlueprintCredit = !!apply_blueprint_credit && isBlueprintCreditablePlan;
    const blueprintCreditCents = wantsBlueprintCredit ? Math.min(29700, Math.max(0, tierDef.amount - 5000)) : 0;
    const finalAmount = Math.max(5000, tierDef.amount - blueprintCreditCents);
    const enc = (s) => encodeURIComponent(s);
    const verifyNonceHash = hashCheckoutNonce(verify_nonce);

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
        `metadata[verify_nonce_hash]=${verifyNonceHash}`,
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
          `metadata[verify_nonce_hash]=${verifyNonceHash}`,
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

    const { session_id, user_id, verify_nonce } = req.body || {};
    if (!session_id) return res.json({ ok: false, error: 'session_id required' });

    try {
      const session = await stripeGet(`checkout/sessions/${session_id}`);
      if (session.error) return res.json({ ok: false, error: session.error.message });
      const sessionUserId = (session.metadata?.user_id || '').toString().trim();
      const requestUserId = (user_id || '').toString().trim();
      const nonceHash = (session.metadata?.verify_nonce_hash || '').toString().trim();
      const nonceOk = verifyCheckoutNonce(verify_nonce, nonceHash);
      if (sessionUserId && requestUserId && sessionUserId !== requestUserId) {
        return res.status(403).json({ ok: false, error: 'Session ownership mismatch' });
      }
      if (nonceHash && !nonceOk) {
        return res.status(403).json({ ok: false, error: 'Session verification failed' });
      }
      if (sessionUserId && !requestUserId && !nonceOk) {
        return res.status(403).json({ ok: false, error: 'Session ownership mismatch' });
      }
      if (!sessionUserId && !nonceHash) {
        return res.status(403).json({ ok: false, error: 'Session verification binding required' });
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
    if (!STRIPE_SECRET) return genericRecoveryStart(res);
    if (isRecoverRateLimited(req)) { res.setHeader('Retry-After', '900'); return res.status(429).json({ ok: false, error: 'Too many attempts. Try again later.' }); }
    const { email } = req.body || {};
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Valid email required' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const lookup = await findPaidSessionByEmail(normalizedEmail);
      if (!lookup.ok || !lookup.paid) return genericRecoveryStart(res);

      const code = randomRecoveryCode();
      storeRecoveryCode(normalizedEmail, code, lookup.paid);
      const delivery = await sendRecoveryEmail({ email: normalizedEmail, code });
      if (!delivery.ok) {
        RECOVERY_CODES.delete(recoveryEmailKey(normalizedEmail));
        console.error('[recover_start] email delivery failed', { provider: delivery.provider, status: delivery.status, body: delivery.body, error: delivery.error });
      }
      return genericRecoveryStart(res);

    } catch (e) {
      console.error('[recover_start] failed', e);
      return genericRecoveryStart(res);
    }
  }

  // ── Session Recovery — verify code and return session ──────────
  if (action === 'recover_verify') {
    if (!STRIPE_SECRET) return res.json({ ok: false, error: 'Recovery unavailable' });
    if (isRecoverRateLimited(req)) { res.setHeader('Retry-After', '900'); return res.status(429).json({ ok: false, error: 'Too many attempts. Try again later.' }); }
    const { email, code } = req.body || {};
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Valid email required' });
    if (!code) return res.status(400).json({ ok: false, error: 'Verification code required' });
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const codeCheck = verifyStoredRecoveryCode(normalizedEmail, code);
      if (!codeCheck.ok) return res.json({ ok: false, error: codeCheck.error });

      const paid = codeCheck.paid_session;
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

  return res.status(400).json({ ok: false, error: 'Unknown action. Use: create_session, verify, recover_start, recover_verify' });
}
