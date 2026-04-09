// Your Deputy — Admin API
// All actions require valid admin token (HMAC-signed, checked server-side)
import { createHmac } from 'crypto';

export const maxDuration = 60;

function verifyAdmin(req) {
  const ADMIN_KEY = process.env.ADMIN_KEY || 'DYNASTY2026';

  const auth = req.headers.authorization?.replace('Bearer ', '') || '';
  if (!auth) return false;
  try {
    const parts = auth.split(':');
    if (parts.length !== 3) return false;
    const [prefix, expiry, hash] = parts;
    const payload = `${prefix}:${expiry}`;
    const expected = createHmac('sha256', ADMIN_KEY).update(payload).digest('hex');
    if (hash !== expected) return false;
    if (Date.now() > parseInt(expiry)) return false;
    return true;
  } catch { return false; }
}

export default async function handler(req, res) {
  const origin = process.env.CORS_ORIGIN || 'https://yourdeputy.com';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!verifyAdmin(req)) return res.status(401).json({ error: 'Unauthorized — valid admin token required' });

  const action = req.query?.action || req.body?.action;
  const config = JSON.parse(process.env.DYNASTY_TOOL_CONFIG || '{}');

  // ── DASHBOARD OVERVIEW ──────────────────────────────────────────────
  if (action === 'overview') {
    const overview = {
      timestamp: new Date().toISOString(),
      environment: {
        github_token: !!process.env.GITHUB_TOKEN,
        anthropic_key: !!process.env.ANTHROPIC_API_KEY,
        stripe_key: !!(process.env.STRIPE_SECRET_KEY),
        vercel_token: !!(process.env.VERCEL_API_TOKEN || config.infrastructure?.vercel),
        clerk_key: !!process.env.CLERK_SECRET_KEY,
        n8n_key: !!(process.env.N8N_API_KEY || config.automation?.n8n_api),
        admin_key: !!process.env.ADMIN_KEY,
        neon_url: !!process.env.NEON_STORE_ID,
        telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      },
      config_keys: {},
      vercel: { team: 'team_fuTLGjBMk3NAD32Bm5hA7wkr', project: 'prj_ohqrZxB5qgn4Hkc5rt8qZAG5fDHX' },
    };
    // Catalog all config keys (masked)
    function maskKey(v) { return typeof v === 'string' && v.length > 6 ? v.slice(0, 6) + '****' : (v ? 'SET' : 'EMPTY'); }
    for (const [cat, vals] of Object.entries(config)) {
      if (typeof vals === 'object' && !Array.isArray(vals)) {
        overview.config_keys[cat] = {};
        for (const [k, v] of Object.entries(vals)) {
          overview.config_keys[cat][k] = maskKey(v);
        }
      }
    }
    return res.json({ ok: true, ...overview });
  }

  // ── SERVICE HEALTH (extended) ──────────────────────────────────────
  if (action === 'health') {
    const checks = {};
    const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

    async function check(name, fn) {
      try { checks[name] = await Promise.race([fn(), timeout(8000)]); }
      catch (e) { checks[name] = { ok: false, error: e.message }; }
    }

    await Promise.all([
      check('github', async () => {
        const r = await fetch('https://api.github.com/user', { headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}` } });
        const d = await r.json(); return r.ok ? { ok: true, user: d.login, scopes: r.headers.get('x-oauth-scopes') } : { ok: false, error: d.message };
      }),
      check('anthropic', async () => {
        const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 5, messages: [{ role: 'user', content: 'ping' }] }) });
        return { ok: r.ok, status: r.status };
      }),
      check('stripe', async () => {
        const sk = process.env.STRIPE_SECRET_KEY || config.payments?.stripe_live;
        if (!sk) return { ok: false, error: 'No key' };
        const auth = Buffer.from(`${sk}:`).toString('base64');
        const r = await fetch('https://api.stripe.com/v1/balance', { headers: { 'Authorization': `Basic ${auth}` } });
        const d = await r.json();
        return r.ok ? { ok: true, balance: d.available?.map(b => `${b.currency} ${(b.amount/100).toFixed(2)}`), pending: d.pending?.map(b => `${b.currency} ${(b.amount/100).toFixed(2)}`) } : { ok: false, error: d.error?.message };
      }),
      check('vercel', async () => {
        const vt = process.env.VERCEL_API_TOKEN || config.infrastructure?.vercel;
        if (!vt) return { ok: false, error: 'No token' };
        const r = await fetch('https://api.vercel.com/v2/user', { headers: { 'Authorization': `Bearer ${vt}` } });
        const d = await r.json(); return r.ok ? { ok: true, user: d.user?.username } : { ok: false, error: d.error?.message };
      }),
      check('twentyi', async () => {
        const key = config.infrastructure?.twentyi_general;
        if (!key) return { ok: false, error: 'No key' };
        const r = await fetch('https://api.20i.com/reseller/10455', { headers: { 'Authorization': `Bearer ${key}` } });
        return { ok: r.ok, status: r.status };
      }),
      check('acumbamail', async () => {
        const key = config.comms?.acumbamail;
        if (!key) return { ok: false, error: 'No key' };
        const r = await fetch(`https://acumbamail.com/api/1/getLists/?auth_token=${key}&response_type=json`);
        const d = await r.json(); return { ok: r.ok, lists: Array.isArray(d) ? d.length : 0 };
      }),
      check('n8n', async () => {
        const key = process.env.N8N_API_KEY || config.automation?.n8n_api;
        const url = config.automation?.n8n_url || 'https://pinohu.app.n8n.cloud';
        if (!key) return { ok: false, error: 'No key' };
        const r = await fetch(`${url}/api/v1/workflows?limit=1`, { headers: { 'X-N8N-API-KEY': key } });
        return { ok: r.ok, status: r.status };
      }),
      check('clerk', async () => {
        const sk = process.env.CLERK_SECRET_KEY;
        if (!sk) return { ok: false, error: 'No key' };
        const r = await fetch('https://api.clerk.com/v1/users?limit=1', { headers: { 'Authorization': `Bearer ${sk}` } });
        return { ok: r.ok, status: r.status };
      }),
    ]);

    const allOk = Object.values(checks).every(c => c.ok);
    return res.json({ ok: true, status: allOk ? 'healthy' : 'degraded', checks, timestamp: new Date().toISOString() });
  }

  // ── BUILDS LIST (from Neon) ─────────────────────────────────────────
  if (action === 'builds') {
    try {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: process.env.NEON_STORE_ID });
      const result = await pool.query(`SELECT * FROM dynasty_builds ORDER BY created_at DESC LIMIT $1`, [parseInt(req.query?.limit || '50')]);
      await pool.end();
      return res.json({ ok: true, builds: result.rows, total: result.rowCount });
    } catch (e) {
      return res.json({ ok: true, builds: [], error: e.message, note: 'Neon DB may not be configured or table may not exist' });
    }
  }

  // ── LICENSES ────────────────────────────────────────────────────────
  if (action === 'licenses') {
    const licenses = {
      suitedash: { total: config.suitedash?.licenses_total || 136, used: config.suitedash?.licenses_used || 0 },
      brilliant: { total: config.directories?.brilliant_licenses || 100, used: config.directories?.brilliant_licenses_used || 0 },
    };
    // Try to get actual counts from Neon
    try {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: process.env.NEON_STORE_ID });
      const sd = await pool.query(`SELECT COUNT(*) FROM dynasty_licenses WHERE service='suitedash' AND status='active'`).catch(() => ({ rows: [{ count: 0 }] }));
      const bd = await pool.query(`SELECT COUNT(*) FROM dynasty_licenses WHERE service='brilliant' AND status='active'`).catch(() => ({ rows: [{ count: 0 }] }));
      licenses.suitedash.used_db = parseInt(sd.rows[0].count);
      licenses.brilliant.used_db = parseInt(bd.rows[0].count);
      await pool.end();
    } catch {}
    return res.json({ ok: true, licenses });
  }

  // ── VERCEL PROJECTS ─────────────────────────────────────────────────
  if (action === 'vercel_projects') {
    const vt = process.env.VERCEL_API_TOKEN || config.infrastructure?.vercel;
    if (!vt) return res.json({ ok: false, error: 'Vercel token not configured' });
    try {
      const r = await fetch('https://api.vercel.com/v9/projects?teamId=team_fuTLGjBMk3NAD32Bm5hA7wkr&limit=50', { headers: { 'Authorization': `Bearer ${vt}` } });
      const d = await r.json();
      const projects = (d.projects || []).map(p => ({
        id: p.id, name: p.name, framework: p.framework, created: p.createdAt, updated: p.updatedAt,
        url: p.latestDeployments?.[0]?.url ? `https://${p.latestDeployments[0].url}` : null,
        state: p.latestDeployments?.[0]?.readyState,
      }));
      return res.json({ ok: true, projects, total: projects.length });
    } catch (e) { return res.json({ ok: false, error: e.message }); }
  }

  // ── STRIPE CUSTOMERS ────────────────────────────────────────────────
  if (action === 'stripe_customers') {
    const sk = process.env.STRIPE_SECRET_KEY || config.payments?.stripe_live;
    if (!sk) return res.json({ ok: false, error: 'Stripe key not configured' });
    try {
      const auth = Buffer.from(`${sk}:`).toString('base64');
      const r = await fetch(`https://api.stripe.com/v1/checkout/sessions?limit=${req.query?.limit || 25}`, { headers: { 'Authorization': `Basic ${auth}` } });
      const d = await r.json();
      const sessions = (d.data || []).map(s => ({
        id: s.id, email: s.customer_email || s.customer_details?.email, plan: s.metadata?.plan,
        amount: s.amount_total, currency: s.currency, status: s.payment_status, mode: s.mode,
        created: new Date(s.created * 1000).toISOString(),
      }));
      return res.json({ ok: true, sessions, total: sessions.length });
    } catch (e) { return res.json({ ok: false, error: e.message }); }
  }

  // ── CLERK USERS ─────────────────────────────────────────────────────
  if (action === 'clerk_users') {
    const sk = process.env.CLERK_SECRET_KEY;
    if (!sk) return res.json({ ok: false, error: 'Clerk not configured' });
    try {
      const r = await fetch(`https://api.clerk.com/v1/users?limit=${req.query?.limit || 25}&order_by=-created_at`, { headers: { 'Authorization': `Bearer ${sk}` } });
      const users = await r.json();
      return res.json({ ok: true, users: (users || []).map(u => ({
        id: u.id, email: u.email_addresses?.[0]?.email_address, name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
        plan: u.public_metadata?.plan, builds: u.public_metadata?.builds_used, created: u.created_at,
      }))});
    } catch (e) { return res.json({ ok: false, error: e.message }); }
  }

  // ── CREATE USER ──────────────────────────────────────────────────────
  if (action === 'create_user') {
    const sk = process.env.CLERK_SECRET_KEY;
    if (!sk) return res.json({ ok: false, error: 'Clerk not configured' });
    const { email, first_name, last_name, tier, password } = req.body || {};
    if (!email) return res.json({ ok: false, error: 'email required' });
    try {
      const body = {
        email_address: [email],
        ...(first_name ? { first_name } : {}),
        ...(last_name ? { last_name } : {}),
        ...(password ? { password } : {}),
        public_metadata: { plan: tier || 'free', builds_used: 0 },
        skip_password_checks: !password,
        skip_password_requirement: !password,
      };
      const r = await fetch('https://api.clerk.com/v1/users', {
        method: 'POST', headers: { 'Authorization': `Bearer ${sk}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const u = await r.json();
      if (u.errors) return res.json({ ok: false, error: u.errors.map(e => e.long_message || e.message).join(', ') });
      return res.json({ ok: true, user_id: u.id, email: u.email_addresses?.[0]?.email_address, tier: tier || 'free' });
    } catch (e) { return res.json({ ok: false, error: e.message }); }
  }

  // ── DELETE USER ─────────────────────────────────────────────────────
  if (action === 'delete_user') {
    const sk = process.env.CLERK_SECRET_KEY;
    if (!sk) return res.json({ ok: false, error: 'Clerk not configured' });
    const { user_id } = req.body || {};
    if (!user_id) return res.json({ ok: false, error: 'user_id required' });
    try {
      const r = await fetch(`https://api.clerk.com/v1/users/${user_id}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${sk}` },
      });
      return res.json({ ok: r.ok || r.status === 200, deleted: user_id });
    } catch (e) { return res.json({ ok: false, error: e.message }); }
  }

  // ── UPDATE USER TIER ────────────────────────────────────────────────
  if (action === 'update_tier') {
    const sk = process.env.CLERK_SECRET_KEY;
    if (!sk) return res.json({ ok: false, error: 'Clerk not configured' });
    const { user_id, tier, builds_remaining } = req.body || {};
    if (!user_id) return res.json({ ok: false, error: 'user_id required' });
    try {
      const metadata = {};
      if (tier) metadata.plan = tier;
      if (builds_remaining !== undefined) metadata.builds_used = Math.max(0, 999 - builds_remaining);
      const r = await fetch(`https://api.clerk.com/v1/users/${user_id}`, {
        method: 'PATCH', headers: { 'Authorization': `Bearer ${sk}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_metadata: metadata }),
      });
      const u = await r.json();
      return res.json({ ok: true, user_id, updated: u.public_metadata });
    } catch (e) { return res.json({ ok: false, error: e.message }); }
  }

  // ── RETRY DEPLOY ────────────────────────────────────────────────────
  if (action === 'deploy') {
    const vt = process.env.VERCEL_API_TOKEN || config.infrastructure?.vercel;
    if (!vt) return res.json({ ok: false, error: 'Vercel token not configured' });
    const { project_id, repo } = req.body || {};
    if (!project_id) return res.json({ ok: false, error: 'project_id required' });
    try {
      const r = await fetch(`https://api.vercel.com/v13/deployments?teamId=team_fuTLGjBMk3NAD32Bm5hA7wkr`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${vt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: repo || project_id, project: project_id, target: 'production',
          gitSource: { type: 'github', org: 'pinohu', repo: repo || project_id, ref: 'main' } })
      });
      const d = await r.json();
      return res.json({ ok: true, deployment_id: d.id, url: d.url, state: d.readyState });
    } catch (e) { return res.json({ ok: false, error: e.message }); }
  }

  // ── DELETE VERCEL PROJECT ───────────────────────────────────────────
  if (action === 'delete_project') {
    const vt = process.env.VERCEL_API_TOKEN || config.infrastructure?.vercel;
    if (!vt) return res.json({ ok: false, error: 'Vercel token not configured' });
    const { project_id } = req.body || {};
    if (!project_id) return res.json({ ok: false, error: 'project_id required' });
    try {
      const r = await fetch(`https://api.vercel.com/v9/projects/${project_id}?teamId=team_fuTLGjBMk3NAD32Bm5hA7wkr`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${vt}` }
      });
      return res.json({ ok: r.ok || r.status === 204, deleted: project_id });
    } catch (e) { return res.json({ ok: false, error: e.message }); }
  }

  // ── MODULE TEST ─────────────────────────────────────────────────────
  if (action === 'test_module') {
    const { module_name } = req.body || {};
    if (!module_name) return res.json({ ok: false, error: 'module_name required' });
    // Dry-run a single module with test project
    const testProject = { name: 'Admin Test', slug: 'test-admin', description: 'Admin module test', type: 'saas', domain: 'test.vercel.app', accent: '#C9A84C' };
    try {
      const r = await fetch(`${req.headers.origin || 'https://yourdeputy.com'}/api/provision?action=provision_modules`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: testProject, liveUrl: 'https://test.vercel.app', modules_enabled: { [module_name]: true }, tier: 'enterprise', dry_run: true })
      });
      const d = await r.json();
      return res.json({ ok: true, module: module_name, result: d });
    } catch (e) { return res.json({ ok: false, error: e.message }); }
  }

  return res.status(400).json({ error: `Unknown admin action: ${action}` });
}
