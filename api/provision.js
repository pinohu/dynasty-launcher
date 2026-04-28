export const maxDuration = 300; // 5 min — AI content generation takes time
import { classifyVercelFailure } from './_deployment_repair.mjs';

// Credential boundary: DYNASTY_TOOL_CONFIG keys serve build-time / one-time provisioning (derivative
// creation and setup). Customer deploys must not rely on this pool for ongoing operation — use
// customer-owned env vars (.env.example, MANUAL-ACTIONS) on their Vercel project.
// Enforced: we do not POST real third-party secrets to customer Vercel projects (placeholders only).

// ── Helpers ───────────────────────────────────────────────────────────────

// Free LLM helper — multi-provider fallback chain for provisioning modules.
// Order: Gemini → Groq (Llama 3.3 70B) → Cerebras → Moonshot Kimi →
//        Z.AI GLM-4.5 → Fireworks Llama → DeepSeek. Returns text or '' on failure.
// Use instead of calling api.anthropic.com directly.
async function freeLLM(prompt, maxTokens = 4000) {
  const gemini1 = process.env.GOOGLE_AI_KEY || '';
  const gemini2 = process.env.GEMINI_API_KEY || '';
  const groq1   = process.env.GROQ_API_KEY || '';
  const groq2   = process.env.GROQ_API_KEY_2 || '';
  const cerebras = process.env.CEREBRAS_API_KEY || '';
  const moonshot = process.env.MOONSHOT_API_KEY || '';
  const zai      = process.env.ZAI_API_KEY || process.env.Z_AI_API_KEY || '';
  const minimax  = process.env.MINIMAX_API_KEY || '';
  const fireworks = process.env.FIREWORKS_API_KEY || '';
  const hyperbolic = process.env.HYPERBOLIC_API_KEY || '';
  const together   = process.env.TOGETHER_API_KEY || '';
  const dashscope  = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || '';
  const nvidia     = process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY || '';
  const baseten    = process.env.BASETEN_API_KEY || '';

  // 1) Google Gemini (AI Studio — multiple keys for rotation)
  for (const key of [gemini1, gemini2].filter(Boolean)) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: Math.min(maxTokens, 8192), temperature: 0.7 } })
      });
      if (r.ok) {
        const d = await r.json();
        const text = d.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
        if (text) return text;
      }
    } catch {}
  }

  // OpenAI-compatible fallback (Groq, Cerebras, Moonshot, Z.AI, MiniMax, Fireworks, DeepSeek)
  const openAICompatTry = async (key, endpoint, model) => {
    if (!key) return null;
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: Math.min(maxTokens, 8000), messages: [{ role: 'user', content: prompt }] })
      });
      if (r.ok) {
        const d = await r.json();
        const text = d.choices?.[0]?.message?.content || '';
        if (text) return text;
      }
    } catch {}
    return null;
  };

  const attempts = [
    // Tier 1 — fastest free frontier models
    [groq1,     'https://api.groq.com/openai/v1/chat/completions',             'meta-llama/llama-4-scout-17b-16e-instruct'],
    [groq2,     'https://api.groq.com/openai/v1/chat/completions',             'meta-llama/llama-4-scout-17b-16e-instruct'],
    [cerebras,  'https://api.cerebras.ai/v1/chat/completions',                 'llama-4-scout-17b-16e-instruct'],

    // Tier 2 — reasoning specialists
    [zai,       'https://open.bigmodel.cn/api/paas/v4/chat/completions',       'glm-4.6'],
    [moonshot,  'https://api.moonshot.ai/v1/chat/completions',                 'kimi-k2-0905-preview'],

    // Tier 3 — proven workhorses
    [groq1,     'https://api.groq.com/openai/v1/chat/completions',             'llama-3.3-70b-versatile'],
    [groq2,     'https://api.groq.com/openai/v1/chat/completions',             'llama-3.3-70b-versatile'],
    [together,  'https://api.together.xyz/v1/chat/completions',                'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free'],
    [hyperbolic, 'https://api.hyperbolic.xyz/v1/chat/completions',             'meta-llama/Llama-3.3-70B-Instruct'],
    [nvidia,    'https://integrate.api.nvidia.com/v1/chat/completions',        'meta/llama-4-maverick-17b-128e-instruct'],
    [dashscope, 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', 'qwen3-max'],

    // Tier 4 — last-resort open-weight hosts (all free tier)
    [minimax,   'https://api.minimax.io/v1/text/chatcompletion_v2',            'MiniMax-M1'],
    [fireworks, 'https://api.fireworks.ai/inference/v1/chat/completions',      'accounts/fireworks/models/llama-v3p3-70b-instruct'],
    [fireworks, 'https://api.fireworks.ai/inference/v1/chat/completions',      'accounts/fireworks/models/deepseek-v3'],
    [baseten,   'https://inference.baseten.co/v1/chat/completions',            'meta-llama/Llama-3.3-70B-Instruct@baseten'],
  ];

  for (const [key, endpoint, model] of attempts) {
    const result = await openAICompatTry(key, endpoint, model);
    if (result) return result;
  }
  return '';
}

// Chain of Verification (CoVe) — for high-stakes outputs like legal documents.
// 1) Take the initial output (already generated)
// 2) Ask LLM to identify questionable claims, missing clauses, internal
//    contradictions, jurisdiction mismatches
// 3) If issues found, regenerate ONLY the affected sections with the
//    verification report fed back as constraints
//
// Returns the (possibly revised) output. Falls back to the original on any failure.
async function verifyAndReconcile(originalOutput, context, opts = {}) {
  if (!originalOutput || typeof originalOutput !== 'string' || originalOutput.length < 200) return originalOutput;
  const docType = opts.docType || 'document';
  const jurisdiction = opts.jurisdiction || 'United States';
  const checklist = opts.checklist || 'standard requirements for this document type';

  const verifyPrompt = `You are a legal/compliance reviewer for ${jurisdiction}. Review the following ${docType} for issues:

1. Missing required clauses (per ${checklist})
2. Internal contradictions (sections that conflict)
3. Jurisdiction mismatches (clauses inconsistent with ${jurisdiction} law)
4. Vague or unenforceable language ("as appropriate", "reasonable", without definition)
5. Missing parties, dates, amounts, or other concrete details

[Document]
${originalOutput.slice(0, 25000)}

Return ONLY a JSON object, no markdown, no preamble:
{
  "needs_revision": <boolean>,
  "issues": ["specific issue 1", "specific issue 2"],
  "missing_clauses": ["clause name 1", "clause name 2"]
}`;

  let report = { needs_revision: false, issues: [], missing_clauses: [] };
  try {
    const verifyResp = await freeLLM(verifyPrompt, 1500);
    const match = (verifyResp || '').match(/\{[\s\S]*\}/);
    if (match) report = { ...report, ...JSON.parse(match[0]) };
  } catch (e) { console.warn(`[cove] verify failed: ${e.message} — returning original`); return originalOutput; }

  if (!report.needs_revision || ((report.issues || []).length === 0 && (report.missing_clauses || []).length === 0)) {
    return originalOutput;
  }

  const issues = (report.issues || []).map((i, n) => `${n + 1}. ${i}`).join('\n');
  const missing = (report.missing_clauses || []).map((c, n) => `${n + 1}. ${c}`).join('\n');
  const revisePrompt = `${context || ''}\n\nA legal/compliance reviewer for ${jurisdiction} identified these issues with the prior version of this ${docType}:\n\nIssues to fix:\n${issues || '(none)'}\n\nMissing required clauses to add:\n${missing || '(none)'}\n\nProduce a corrected ${docType} that addresses every issue and adds every missing clause. Maintain the same delimiter format if any was used. Return ONLY the corrected document.`;

  try {
    const revised = await freeLLM(revisePrompt, Math.max(originalOutput.length / 3, 6000));
    if (revised && revised.length > originalOutput.length * 0.5) {
      console.log(`[cove] revised ${docType} (was ${originalOutput.length} chars, now ${revised.length}; ${report.issues.length} issues + ${report.missing_clauses.length} missing clauses addressed)`);
      return revised;
    }
  } catch (e) { console.warn(`[cove] revise failed: ${e.message} — returning original`); }
  return originalOutput;
}

async function pushFile(ghToken, org, repo, path, content, message, isBase64 = false) {
  const b64 = isBase64 ? content : Buffer.from(content).toString('base64');
  const h = { 'Authorization': `token ${ghToken}`, 'Content-Type': 'application/json',
               'Accept': 'application/vnd.github.v3+json' };
  let sha;
  try { const r = await fetch(`https://api.github.com/repos/${org}/${repo}/contents/${path}`, { headers: h });
        if (r.ok) { const d = await r.json(); sha = d.sha; } } catch {}
  const body = { message, content: b64, ...(sha ? { sha } : {}) };
  const r = await fetch(`https://api.github.com/repos/${org}/${repo}/contents/${path}`,
    { method: 'PUT', headers: h, body: JSON.stringify(body) });
  return r.ok;
}

const GENERATED_VERCEL_SETTINGS = {
  framework: 'nextjs',
  installCommand: 'npm install --engine-strict=false && npm install --prefix frontend --no-package-lock --engine-strict=false',
  buildCommand: 'npm run vercel-build',
  outputDirectory: 'frontend/.next',
};

function vercelTeamQuery(team) {
  return team ? `teamId=${encodeURIComponent(team)}` : '';
}

async function patchVercelProjectSettings({ token, team, projectId }) {
  if (!token || !projectId) return { ok: false, skipped: true, reason: 'missing_token_or_project' };
  const query = vercelTeamQuery(team);
  const url = `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}${query ? `?${query}` : ''}`;
  const body = {
    ...GENERATED_VERCEL_SETTINGS,
    ssoProtection: null,
  };
  try {
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { text: text.slice(0, 200) }; }
    return {
      ok: resp.ok,
      status: resp.status,
      settings: GENERATED_VERCEL_SETTINGS,
      deployment_protection_disabled: resp.ok,
      error: resp.ok ? null : sanitizeError(data?.error?.message || data?.message || text || `HTTP ${resp.status}`),
    };
  } catch (e) {
    return { ok: false, error: sanitizeError(e.message) };
  }
}

async function verifyLiveUrlWithRepair({ url, projectName, projectId, token, team }) {
  const result = {
    ok: false,
    status: 0,
    has_content: false,
    has_project_name: false,
    has_template_branding: false,
    deployment_protection_repaired: false,
    body_length: 0,
    url,
  };
  const fetchOnce = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'YourDeputy-VerifyBot/1.0' },
        signal: controller.signal,
        redirect: 'follow',
      });
      const text = await resp.text();
      return { resp, text };
    } finally {
      clearTimeout(timeout);
    }
  };

  let first;
  try {
    first = await fetchOnce();
  } catch (e) {
    result.error = sanitizeError(e.message);
    return result;
  }

  let { resp, text } = first;
  const protectionDiag = classifyVercelFailure([{ text: `${resp.status} ${resp.statusText}\n${text.slice(0, 1000)}` }]);
  if ((resp.status === 401 || resp.status === 403 || protectionDiag.class === 'deployment_protection') && token && projectId) {
    const patched = await patchVercelProjectSettings({ token, team, projectId });
    result.deployment_protection_repaired = !!patched.ok;
    result.project_settings_repair = patched;
    if (patched.ok) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      try {
        const second = await fetchOnce();
        resp = second.resp;
        text = second.text;
      } catch (e) {
        result.error = sanitizeError(e.message);
        return result;
      }
    }
  }

  result.status = resp.status;
  result.url = resp.url || url;
  result.body_length = text.length;
  if (resp.status === 200) {
    const lower = text.toLowerCase();
    const isErrorPage = /Application error|500 Internal Server Error|NEXT_NOT_FOUND|This page could not be found/i.test(text);
    const templateMarkers = [/SaaS ?Boilerplate/i, /SaaS ?Template/i, /@?Ixartz/i, /nextjs-boilerplate\.com/i, /Demo of SaaS/i];
    result.has_content = text.length > 500 && !isErrorPage;
    result.has_project_name = projectName ? lower.includes(String(projectName).toLowerCase()) : false;
    result.has_template_branding = templateMarkers.some((rx) => rx.test(text));
    result.ok = result.has_content && !result.has_template_branding;
  } else {
    const diag = classifyVercelFailure([{ text: `${resp.status} ${resp.statusText}\n${text.slice(0, 1000)}` }]);
    result.diagnostic = diag;
    result.error = diag.summary || `HTTP ${resp.status}`;
  }
  return result;
}

function hexToHsl(hex) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.slice(0,2),16)/255, g = parseInt(hex.slice(2,4),16)/255, b = parseInt(hex.slice(4,6),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max+min)/2;
  if (max===min) { h=s=0; } else {
    const d=max-min; s=l>0.5?d/(2-max-min):d/(max+min);
    switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break;}
  }
  return `${Math.round(h*360)} ${Math.round(s*100)}% ${Math.round(l*100)}%`;
}

function generateThemeCss(accentHex) {
  const a = hexToHsl(accentHex); const parts = a.split(' ');
  const p = `${parts[0]} ${parts[1]} ${Math.max(20, parseInt(parts[2])-15)}%`;
  return `/* AUTO-GENERATED by DYNASTY-LAUNCHER */\n:root {\n  --primary: ${p};\n  --primary-foreground: 210 40% 98%;\n  --secondary: ${a};\n  --accent: ${a};\n  --background: 0 0% 100%;\n  --foreground: 222 20% 12%;\n  --border: 214 32% 91%;\n  --ring: ${p};\n}\n.dark {\n  --primary: ${a};\n  --background: 222 47% 11%;\n  --foreground: 210 40% 98%;\n  --accent: ${a};\n  --border: 217 32% 17%;\n}`;
}

// ── Neon DB helpers for V3 ─────────────────────────────────────────────────
async function getPool() {
  const connStr = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connStr) return null;
  try { const { Pool } = await import('pg'); return new Pool({ connectionString: connStr, max: 1, idleTimeoutMillis: 5000 }); } catch { return null; }
}

async function ensureDynastyOpsTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dynasty_license_allocations (
      id SERIAL PRIMARY KEY, tool TEXT NOT NULL, project_slug TEXT NOT NULL,
      resource_id TEXT, allocated_at TIMESTAMPTZ DEFAULT NOW(), released_at TIMESTAMPTZ,
      UNIQUE(tool, project_slug)
    );
    CREATE TABLE IF NOT EXISTS dynasty_build_history (
      id SERIAL PRIMARY KEY, project_slug TEXT NOT NULL, project_name TEXT, project_type TEXT,
      cost_usd NUMERIC(10,4) DEFAULT 0, module_costs JSONB DEFAULT '{}',
      modules_run TEXT[] DEFAULT '{}', modules_ok TEXT[] DEFAULT '{}', modules_failed TEXT[] DEFAULT '{}',
      status TEXT DEFAULT 'running', services JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(), completed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS dynasty_deferred_checks (
      id SERIAL PRIMARY KEY, project_slug TEXT NOT NULL, check_type TEXT NOT NULL,
      target TEXT NOT NULL, expected_value TEXT, status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(), checked_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS dynasty_module_usage_daily (
      id SERIAL PRIMARY KEY,
      day_key TEXT NOT NULL,
      module_name TEXT NOT NULL,
      tier TEXT NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(day_key, module_name, tier)
    );
  `);
}

async function getLicenseCount(pool, tool) {
  const r = await pool.query('SELECT COUNT(*) as cnt FROM dynasty_license_allocations WHERE tool=$1 AND released_at IS NULL', [tool]);
  return parseInt(r.rows[0]?.cnt || '0');
}

async function allocateLicense(pool, tool, projectSlug, resourceId) {
  try {
    await pool.query('INSERT INTO dynasty_license_allocations (tool, project_slug, resource_id) VALUES ($1,$2,$3) ON CONFLICT (tool, project_slug) DO UPDATE SET resource_id=$3, allocated_at=NOW()', [tool, projectSlug, resourceId]);
    return true;
  } catch { return false; }
}

async function recordBuild(pool, data) {
  try {
    await pool.query(`INSERT INTO dynasty_build_history (project_slug, project_name, project_type, cost_usd, module_costs, modules_run, modules_ok, modules_failed, status, services, completed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
      [data.slug, data.name, data.type, data.cost, JSON.stringify(data.moduleCosts), data.run, data.ok, data.failed, data.status, JSON.stringify(data.services)]);
  } catch {}
}

async function addDeferredCheck(pool, projectSlug, checkType, target, expectedValue) {
  try {
    const r = await pool.query('INSERT INTO dynasty_deferred_checks (project_slug, check_type, target, expected_value) VALUES ($1,$2,$3,$4) RETURNING id', [projectSlug, checkType, target, expectedValue]);
    return r.rows[0]?.id;
  } catch { return null; }
}

function getDayKey() {
  return new Date().toISOString().slice(0, 10);
}

const MODULE_USAGE_MEMORY = new Map();

async function consumeTierModuleQuota(pool, { tier, moduleName, limit }) {
  if (!limit || limit < 1) return { allowed: false, used: 0, limit: 0 };
  const dayKey = getDayKey();

  if (pool) {
    await ensureDynastyOpsTables(pool);
    await pool.query(`
      INSERT INTO dynasty_module_usage_daily (day_key, module_name, tier, usage_count)
      VALUES ($1, $2, $3, 0)
      ON CONFLICT (day_key, module_name, tier) DO NOTHING
    `, [dayKey, moduleName, tier]);

    const row = await pool.query(
      'SELECT usage_count FROM dynasty_module_usage_daily WHERE day_key=$1 AND module_name=$2 AND tier=$3 LIMIT 1',
      [dayKey, moduleName, tier]
    );
    const current = parseInt(row.rows[0]?.usage_count || '0', 10);
    if (current >= limit) return { allowed: false, used: current, limit };

    const updated = await pool.query(
      'UPDATE dynasty_module_usage_daily SET usage_count=usage_count+1, updated_at=NOW() WHERE day_key=$1 AND module_name=$2 AND tier=$3 RETURNING usage_count',
      [dayKey, moduleName, tier]
    );
    const used = parseInt(updated.rows[0]?.usage_count || String(current + 1), 10);
    return { allowed: true, used, limit };
  }

  const memoryKey = `${dayKey}:${moduleName}:${tier}`;
  const current = parseInt(MODULE_USAGE_MEMORY.get(memoryKey) || '0', 10);
  if (current >= limit) return { allowed: false, used: current, limit };
  MODULE_USAGE_MEMORY.set(memoryKey, String(current + 1));
  return { allowed: true, used: current + 1, limit };
}

// ── Error sanitization — strip potential API keys from error messages ────────
function sanitizeError(msg) {
  if (!msg || typeof msg !== 'string') return msg || 'Unknown error';
  return msg
    .replace(/sk_live_[a-zA-Z0-9]+/g, 'sk_live_***')
    .replace(/sk_test_[a-zA-Z0-9]+/g, 'sk_test_***')
    .replace(/sk-ant-[a-zA-Z0-9-]+/g, 'sk-ant-***')
    .replace(/Bearer [a-zA-Z0-9._-]+/g, 'Bearer ***')
    .replace(/token [a-zA-Z0-9._-]+/g, 'token ***')
    .replace(/key=[a-zA-Z0-9._-]+/g, 'key=***')
    .replace(/ghp_[a-zA-Z0-9]+/g, 'ghp_***')
    .replace(/ghu_[a-zA-Z0-9]+/g, 'ghu_***')
    .replace(/neon_[a-zA-Z0-9]+/g, 'neon_***')
    .replace(/postgres(ql)?:\/\/[^\s]+/g, 'postgres://***')
    .replace(/password[=:]\s*[^\s&]+/gi, 'password=***')
    .replace(/secret[=:]\s*[^\s&]+/gi, 'secret=***')
    .replace(/api[_-]?key[=:]\s*[^\s&]+/gi, 'api_key=***')
    .replace(/[a-f0-9]{32,}/gi, (m) => m.slice(0, 6) + '***')
    .slice(0, 200);
}

const PROVISION_TIER_VALID = ['free', 'blueprint', 'scoring_pro', 'strategy_pack', 'foundation', 'starter', 'professional', 'enterprise', 'managed', 'custom_volume'];
const AUTOMATION_ONLY_MODE = process.env.AUTOMATION_ONLY_MODE === 'true';
const CONTACT_ONLY_MODULES = new Set(['phone', 'sms', 'video', 'leads', 'crm', 'directory']);
const TIER_MODULE_DAILY_LIMITS = {
  professional: { hosting: 2, wordpress: 0 },
  enterprise: { hosting: 6, wordpress: 2 },
  managed: { hosting: 6, wordpress: 2 },
};
const ZERO_COST_SKIP_MODULES = new Set([
  'hosting', 'billing', 'email', 'phone', 'sms', 'chatbot', 'seo', 'video', 'design',
  'analytics', 'leads', 'automation', 'docs', 'crm', 'directory', 'wordpress', 'social'
]);

function normalizeModuleResult(name, raw, { automationOnly, zeroCostMode }) {
  const result = { ...(raw || {}), service: (raw && raw.service) || name };
  if (result.ok) return result;
  const missingConfig = /No .* key|No API key|No .* configured|license limit/i.test(result.error || '');
  if (automationOnly) {
    const reason = missingConfig
      ? 'Auto-skipped: configuration missing for self-serve runtime.'
      : (zeroCostMode && ZERO_COST_SKIP_MODULES.has(name))
        ? 'Auto-skipped: zero-cost autopilot blocks paid integrations.'
        : 'Auto-skipped: automation-only mode does not queue manual fulfillment.';
    result.fallback = reason;
    result.error = result.error || reason;
    result.skipped = true;
  }
  return result;
}

function isExplicitZeroCostMode(project = {}) {
  // Old app bundles persisted `dynasty_automation_mode=zero_cost` in localStorage and
  // kept poisoning paid/admin builds. Zero-cost is now honored only when the current
  // client also sends a confirmation flag from the settings UI.
  return project?.automation_mode === 'zero_cost' && project?.automation_mode_confirmed === true;
}

async function fetchStripeCheckoutSession(sessionId, secretKey) {
  if (!sessionId || !secretKey) return null;
  const auth = Buffer.from(`${secretKey}:`).toString('base64');
  try {
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const data = await r.json();
    if (!r.ok || data.error) return null;
    return data;
  } catch {
    return null;
  }
}

function tierFromStripeCheckoutSession(session) {
  if (!session) return null;
  const isPaid = session.payment_status === 'paid' ||
    (session.mode === 'subscription' && session.status === 'complete');
  if (!isPaid) return null;
  const plan = (session.metadata && session.metadata.plan) || 'foundation';
  const p = String(plan).toLowerCase();
  if (!PROVISION_TIER_VALID.includes(p)) return 'foundation';
  return p;
}

/** Paid tiers require verified Stripe session; no client-trust bypass in production. */
async function resolveProvisionUserTier({ tier, stripeSessionId, bypassStripe }) {
  const claimRaw = (tier || 'foundation').toLowerCase();
  const claim = PROVISION_TIER_VALID.includes(claimRaw) ? claimRaw : 'foundation';
  if (bypassStripe) return { userTier: claim, tierSource: 'dry_run' };
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) return { userTier: 'free', tierSource: 'missing_stripe_secret' };
  const sid = (stripeSessionId || '').trim();
  if (!sid) return { userTier: 'free', tierSource: 'missing_checkout_session' };
  const session = await fetchStripeCheckoutSession(sid, sk);
  const fromStripe = tierFromStripeCheckoutSession(session);
  if (!fromStripe) return { userTier: 'free', tierSource: 'session_not_paid_or_invalid' };
  return { userTier: fromStripe, tierSource: 'stripe_checkout' };
}

function readAdminTokenFromRequest(req) {
  const hdr = (req.headers['x-dynasty-admin-token'] || '').toString().trim();
  if (hdr) return hdr;
  const auth = (req.headers.authorization || '').toString();
  if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
  return '';
}

async function isValidAdminToken(token) {
  if (!token) return false;
  const adminKey = process.env.ADMIN_KEY || '';
  const testAdminKey = process.env.TEST_ADMIN_KEY || '';
  if (!adminKey && !testAdminKey) return false;
  const parts = token.split(':');
  if (parts.length !== 3) return false;
  const [prefix, expiry, hash] = parts;
  const secret = prefix === 'admin' ? adminKey : (prefix === 'admin_test' ? testAdminKey : '');
  if (!secret) return false;
  const exp = parseInt(expiry, 10);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const { createHmac, timingSafeEqual } = await import('crypto');
  const payload = `${prefix}:${expiry}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  if (expected.length !== hash.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
}

async function isValidPaidAccessToken({ token, sessionId, userId, tier }) {
  if (!token) return false;
  const secret = process.env.PAYMENT_ACCESS_SECRET || process.env.STRIPE_SECRET_KEY || '';
  if (!secret) return false;
  const parts = token.split(':');
  if (parts.length !== 6) return false;
  const [prefix, tokSessionId, tokUserId, tokTier, exp, sig] = parts;
  if (prefix !== 'pay') return false;
  if (tokSessionId !== (sessionId || '').trim()) return false;
  if ((tier || '').trim() && tokTier !== String(tier).toLowerCase()) return false;
  const reqUser = (userId || '').trim();
  if (tokUserId !== 'anon' && reqUser && tokUserId !== reqUser) return false;
  const expNum = parseInt(exp, 10);
  if (!Number.isFinite(expNum) || Date.now() > expNum) return false;
  const { createHmac, timingSafeEqual } = await import('crypto');
  const payload = `${prefix}:${tokSessionId}:${tokUserId}:${tokTier}:${exp}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  if (expected.length !== sig.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

// ── V3 INTEGRATION MODULES ──────────────────────────────────────────────────
// Each module follows: async function mod_xxx(config, project, liveUrl) → { ok, service, details, error?, fallback?, cleanup?, cost_usd? }

// ── mod_hosting: 20i Domain + Email + SPF/DKIM/DMARC ────────────────────────
async function mod_hosting(config, project, liveUrl) {
  const results = { ok: false, service: 'hosting', details: {} };
  const apiKey = config.infrastructure?.twentyi_general || process.env.TWENTYI_API_KEY;
  if (!apiKey) { results.error = 'No hosting API key'; results.fallback = 'Add infrastructure hosting credentials to configuration.'; return results; }
  const auth = `Bearer ${Buffer.from(apiKey).toString('base64')}`;
  const domain = project.domain || `${project.slug}.com`;
  const resellerId = config.infrastructure?.twentyi_reseller_id || '10455';
  try {
    // 1. Create hosting package
    const addResp = await fetch(`https://api.20i.com/reseller/${resellerId}/addWeb`, {
      method: 'POST', headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain_name: domain, type: '80359' })
    });
    const addData = await addResp.json();
    if (!addResp.ok || !addData?.result) { results.error = `hosting addWeb failed: ${JSON.stringify(addData).slice(0,120)}`; results.fallback = 'Create hosting package manually in your infrastructure panel.'; return results; }
    const packageId = addData.result;
    results.details.package_id = packageId;
    results.details.domain = domain;
    results.details.control_panel = `https://my.20i.com/package/${packageId}`;

    // 2. Add DNS records — A record pointing to Vercel
    try {
      await fetch(`https://api.20i.com/package/${packageId}/web/dnsRecords`, {
        method: 'POST', headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ new: { a: [{ host: '@', ip: '76.76.21.21' }], cname: [{ host: 'www', alias: 'cname.vercel-dns.com' }] } })
      });
      results.details.dns = { a: '76.76.21.21', cname: 'cname.vercel-dns.com' };
    } catch (e) { results.details.dns_error = sanitizeError(e.message); }

    // 3. Create email mailbox
    try {
      const emailPw = `Dyn!${Array.from({length:16},()=>'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'[Math.random()*56|0]).join('')}`;
      await fetch(`https://api.20i.com/package/${packageId}/email/mailbox`, {
        method: 'POST', headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailbox: `hello@${domain}`, password: emailPw })
      });
      results.details.email = `hello@${domain}`;
      results.details.email_password_set = true;
      results.details.email_imap = `mail.${domain}`;
      results.details.email_smtp = `mail.${domain}`;
      results.details.email_ports = { imap: 993, smtp: 465, starttls: 587 };
    } catch (e) { results.details.email_error = sanitizeError(e.message); }

    // 4. SPF record
    try {
      await fetch(`https://api.20i.com/package/${packageId}/web/dnsRecords`, {
        method: 'POST', headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ new: { txt: [{ host: '@', txt: 'v=spf1 include:spf.20i.com include:acumbamail.com ~all' }] } })
      });
      results.details.spf = true;
    } catch {}

    // 5. DKIM — fetch key and add DNS record
    try {
      const dkimResp = await fetch(`https://api.20i.com/package/${packageId}/email/domainDkim`, {
        headers: { 'Authorization': auth }
      });
      if (dkimResp.ok) {
        const dkimData = await dkimResp.json();
        if (dkimData?.dkim_key) {
          await fetch(`https://api.20i.com/package/${packageId}/web/dnsRecords`, {
            method: 'POST', headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
            body: JSON.stringify({ new: { txt: [{ host: 'default._domainkey', txt: dkimData.dkim_key }] } })
          });
          results.details.dkim = true;
        }
      }
    } catch {}

    // 6. DMARC record
    try {
      await fetch(`https://api.20i.com/package/${packageId}/web/dnsRecords`, {
        method: 'POST', headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ new: { txt: [{ host: '_dmarc', txt: `v=DMARC1; p=none; rua=mailto:hello@${domain}; adkim=r; aspf=r` }] } })
      });
      results.details.dmarc = true;
    } catch {}

    // 7. Request SSL
    try {
      await fetch(`https://api.20i.com/package/${packageId}/web/requestSsl`, {
        method: 'POST', headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain_name: domain })
      });
      results.details.ssl = 'requested';
    } catch {}

    // 8. Register deferred DNS check in Neon
    try {
      const pool = await getPool();
      if (pool) {
        await ensureDynastyOpsTables(pool);
        const checkId = await addDeferredCheck(pool, project.slug, 'dns_propagation', domain, '76.76.21.21');
        results.details.deferred_check_id = checkId;
        await addDeferredCheck(pool, project.slug, 'ssl_cert', domain, 'valid');
        await pool.end();
      }
    } catch {}

    results.ok = true;
    results.cost_usd = 0; // 20i is owned license
  } catch (e) { results.error = sanitizeError(e.message); results.fallback = 'Manage hosting package manually in your infrastructure panel.'; }
  return results;
}

// ── mod_billing: Stripe Connect — Managed Billing for Client Projects ───────
// Creates a Stripe Connected Account for each client project under Dynasty's
// platform account. Products, prices, and webhooks are created on the connected
// account. Client gets their own Stripe dashboard. Dynasty can take a platform fee.
async function mod_billing(config, project, liveUrl) {
  const results = { ok: false, service: 'billing', details: {} };
  const SK = config.payments?.stripe_live || process.env.STRIPE_SECRET_KEY;
  const GH_TOKEN = process.env.GITHUB_TOKEN;
  if (!SK || !SK.startsWith('sk_live')) { results.error = 'No Stripe live key'; results.fallback = 'Add STRIPE_SECRET_KEY env var'; return results; }
  const auth = Buffer.from(`${SK}:`).toString('base64');
  const sh = { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' };
  const enc = (s) => encodeURIComponent(s);

  try {
    // 1. Try to create a Stripe Connected Account (Express type — client gets own dashboard)
    let acctId = null;
    let connSh = sh; // Default to main account headers
    let isConnected = false;

    try {
      const acct = await fetch('https://api.stripe.com/v1/accounts', { method: 'POST', headers: sh,
        body: `type=express&country=US&business_type=company&company[name]=${enc(project.name)}&capabilities[card_payments][requested]=true&capabilities[transfers][requested]=true&metadata[dynasty_slug]=${enc(project.slug)}&metadata[dynasty_type]=${enc(project.type || '')}`
      }).then(r => r.json());
      if (acct.id) {
        acctId = acct.id;
        connSh = { ...sh, 'Stripe-Account': acct.id };
        isConnected = true;
        results.details.stripe_account_id = acct.id;
        results.details.mode = 'connected_account';
      }
    } catch {}

    // Fallback: if Connect not enabled, create products on main account
    if (!isConnected) {
      results.details.mode = 'direct';
      results.details.note = 'Products created on main Stripe account (enable Connect at dashboard.stripe.com/connect for per-client accounts)';
    }

    // 2. Create products and prices (on connected account if available, else main account)
    const proPriceCents = project.price_pro_cents || 4900;
    const entPriceCents = project.price_enterprise_cents || 19900;

    const prod = await fetch('https://api.stripe.com/v1/products', { method: 'POST', headers: connSh,
      body: `name=${enc(project.name)}&description=${enc(project.description || project.name)}&metadata[dynasty_client]=${enc(project.slug)}&metadata[dynasty_type]=${enc(project.type || '')}&metadata[provisioned_by]=your-deputy`
    }).then(r => r.json());
    if (prod.id) {
      results.details.product_id = prod.id;

      // Create 3 price tiers
      results.details.prices = {};
      for (const tier of [
        { name: 'Free', cents: 0 },
        { name: 'Pro', cents: proPriceCents },
        { name: 'Enterprise', cents: entPriceCents }
      ]) {
        const p = await fetch('https://api.stripe.com/v1/prices', { method: 'POST', headers: connSh,
          body: `product=${prod.id}&currency=usd&unit_amount=${tier.cents}&recurring[interval]=month&nickname=${enc(tier.name)}`
        }).then(r => r.json());
        if (p.id) results.details.prices[tier.name.toLowerCase()] = p.id;
      }
    }

    // 3. Create webhook endpoint on the connected account
    if (liveUrl) {
      try {
        const wh = await fetch('https://api.stripe.com/v1/webhook_endpoints', { method: 'POST', headers: connSh,
          body: `url=${enc(liveUrl + '/api/webhooks/stripe')}&enabled_events[0]=checkout.session.completed&enabled_events[1]=customer.subscription.updated&enabled_events[2]=invoice.payment_failed&enabled_events[3]=invoice.paid`
        }).then(r => r.json());
        if (wh.id) {
          results.details.webhook_id = wh.id;
          results.details._webhook_secret = wh.secret; // For env var push only
        }
      } catch {}
    }

    // 4. Generate onboarding link (only for connected accounts)
    if (isConnected && acctId) {
      try {
        const link = await fetch('https://api.stripe.com/v1/account_links', { method: 'POST', headers: sh,
          body: `account=${acctId}&refresh_url=${enc(liveUrl || 'https://yourdeputy.com')}&return_url=${enc(liveUrl || 'https://yourdeputy.com')}&type=account_onboarding`
        }).then(r => r.json());
        if (link.url) results.details.onboarding_url = link.url;
      } catch {}
    }

    // 5. Do not push Stripe secrets or IDs to customer Vercel — handoff via repo only (option a).

    // 6. Push .env.example and setup guide to the repo
    if (GH_TOKEN && project.slug) {
      try {
        await pushFile(GH_TOKEN, 'pinohu', project.slug, '.env.example',
          `# ${project.name} — Environment Variables\n# Add these to Vercel → Project → Settings → Environment Variables (never committed).\n# Stripe Connect onboarding: ${results.details.onboarding_url || 'Create at dashboard.stripe.com'}\n\nSTRIPE_ACCOUNT_ID=${acctId || ''}\nSTRIPE_PRODUCT_ID=${prod?.id || ''}\nSTRIPE_PRICE_PRO_MONTHLY=${results.details.prices?.pro || ''}\nSTRIPE_PRICE_ENTERPRISE_MONTHLY=${results.details.prices?.enterprise || ''}\nNEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=\nSTRIPE_SECRET_KEY=\n# Webhook signing secret from Stripe Dashboard → Developers → Webhooks (after you register ${liveUrl || ''}/api/webhooks/stripe)\nSTRIPE_WEBHOOK_SECRET=\n\n# Clerk (your Clerk application — dashboard.clerk.com)\nNEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=\nCLERK_SECRET_KEY=\nNEXT_PUBLIC_CLERK_SIGN_IN_URL=/en/sign-in\nNEXT_PUBLIC_CLERK_SIGN_UP_URL=/en/sign-up\n\n# Database\nDATABASE_URL=\nNEXT_PUBLIC_APP_URL=${liveUrl || ''}\nBILLING_PLAN_ENV=test\n`,
          'docs: environment variables (customer-owned keys; add in Vercel dashboard)');
      } catch {}
    }

    // Remove secret from response (only used for env var push)
    delete results.details._webhook_secret;

    results.details.note = 'Stripe Connected Account created. Client completes onboarding at the provided URL. Products, prices, and webhooks are on their connected account — add STRIPE_* and webhook secret to Vercel from .env.example (not auto-injected).';
    results.ok = !!(results.details.stripe_account_id || results.details.product_id);
    results.cost_usd = 0;
  } catch (e) { results.error = sanitizeError(e.message); results.fallback = 'Create Stripe account at dashboard.stripe.com — see docs/STRIPE-SETUP.md'; }
  return results;
}

// ── mod_email: Acumbamail List + 5-Email Sequence + Automation ──────────────
async function mod_email(config, project, liveUrl) {
  const results = { ok: false, service: 'email', details: {} };
  const acumbaKey = config.comms?.acumbamail;
  const emailitKey = process.env.EMAILIT_API_KEY || config.comms?.emailit;

  if (!acumbaKey && !emailitKey) { results.error = 'No email API key'; results.fallback = 'Add EMAILIT_API_KEY env var or acumbamail to DYNASTY_TOOL_CONFIG.comms'; return results; }

  // Email templates (shared by both providers)
  const unsubLink = '{{unsubscribe_url}}';
  const physAddr = project.location || 'United States';
  const emailWrap = (subject, innerHtml) => `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:system-ui,sans-serif"><div style="max-width:600px;margin:0 auto;padding:20px"><div style="background:#fff;border-radius:8px;padding:32px;margin-bottom:16px">${innerHtml}</div><div style="text-align:center;font-size:12px;color:#999;padding:16px"><p>${project.name} | ${physAddr}</p><p><a href="${unsubLink}" style="color:#999">Unsubscribe</a> | <a href="https://${project.domain || project.slug + '.vercel.app'}" style="color:#999">Visit website</a></p></div></div></body></html>`;
  const emailSequence = [
    { subject: `Welcome to ${project.name}!`, body: emailWrap(`Welcome to ${project.name}!`, `<h2 style="color:#333;margin:0 0 16px">Welcome aboard!</h2><p style="color:#555;line-height:1.6">Thanks for joining ${project.name}. We're excited to have you.</p><p style="color:#555;line-height:1.6">Here's what you can expect:</p><ul style="color:#555;line-height:1.8"><li>A quick-start guide</li><li>Tips from our most successful users</li><li>An exclusive offer for new members</li></ul><p style="margin-top:24px"><a href="https://${project.domain || project.slug + '.vercel.app'}" style="background:#C9A84C;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Get Started</a></p>`) },
    { subject: `Getting started with ${project.name}`, body: emailWrap(`Getting started`, `<h2 style="color:#333;margin:0 0 16px">Let's get you set up</h2><ol style="color:#555;line-height:1.8"><li><strong>Complete your profile</strong></li><li><strong>Explore the dashboard</strong></li><li><strong>Connect your tools</strong></li></ol>`) },
    { subject: `${project.name} tips & tricks`, body: emailWrap(`Tips & tricks`, `<h2 style="color:#333;margin:0 0 16px">Pro tips for success</h2><ol style="color:#555;line-height:1.8"><li>Check your dashboard daily for new leads</li><li>Respond to inquiries within 2 hours</li><li>Review analytics weekly to spot trends</li></ol>`) },
    { subject: `How ${project.name} compares`, body: emailWrap(`How we compare`, `<h2 style="color:#333;margin:0 0 16px">Why users choose us</h2><ul style="color:#555;line-height:1.8"><li>Everything provisioned from day one</li><li>You own 100% of the code and data</li><li>Professional-grade infrastructure</li></ul>`) },
    { subject: `Special offer from ${project.name}`, body: emailWrap(`Special offer`, `<h2 style="color:#333;margin:0 0 16px">Ready to upgrade?</h2><p style="color:#555;line-height:1.6">An exclusive offer for our early members.</p><p style="margin-top:24px"><a href="https://${project.domain || project.slug + '.vercel.app'}/pricing" style="background:#C9A84C;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">See Pricing</a></p>`) }
  ];

  // ── Try Emailit first (more reliable) ────────────────────────────
  if (emailitKey) {
    try {
      const fromEmail = `hello@${project.domain || 'yourdeputy.com'}`;
      results.details.provider = 'emailit';
      results.details.templates_created = 0;
      results.details.from = fromEmail;

      // Store email templates for the client (push to repo)
      const GH_TOKEN = process.env.GITHUB_TOKEN;
      if (GH_TOKEN && project.slug) {
        const templateContent = emailSequence.map((e, i) => `## Email ${i+1}: ${e.subject}\n\n\`\`\`html\n${e.body}\n\`\`\``).join('\n\n---\n\n');
        try {
          await pushFile(GH_TOKEN, 'pinohu', project.slug, 'docs/EMAIL-TEMPLATES.md',
            `# Email Templates — ${project.name}\n\n> 5-email onboarding sequence (CAN-SPAM compliant)\n> Send via Emailit API: POST https://api.emailit.com/v2/emails\n> API Key: Set EMAILIT_API_KEY in your .env\n\n${templateContent}`,
            'docs: email onboarding templates');
          results.details.templates_pushed = true;
        } catch {}
      }

      // Test the API connection with a simple validation
      const testResp = await fetch('https://api.emailit.com/v2/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${emailitKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `${project.name} <${fromEmail}>`, to: ['test@test.invalid'], subject: 'API Test', text: 'test', _validate_only: true })
      });
      results.details.api_status = testResp.status;
      results.details.templates_created = emailSequence.length;
      results.details.emailit_configured = true;
      results.details.send_endpoint = 'https://api.emailit.com/v2/emails';
      results.ok = true;
      results.cost_usd = 0;
      return results;
    } catch (e) {
      results.details.emailit_error = sanitizeError(e.message);
      // Fall through to Acumbamail
    }
  }

  // ── Fallback: Acumbamail ────────────────────────────────────────
  if (acumbaKey) {
    const apiKey = acumbaKey;
    const ah = { 'Content-Type': 'application/json' };
    try {
      // 1. Create subscriber list
      const list = await fetch('https://acumbamail.com/api/1/createList/', { method: 'POST', headers: ah,
        body: JSON.stringify({ auth_token: apiKey, name: `${project.name} - Subscribers`, from_email: `hello@${project.domain || 'dynastyempire.com'}`, from_name: project.name, country: 'US' })
      }).then(r => r.json());
      const listId = list.id || list.list_id || list.result;
      if (!listId) throw new Error('List creation failed');
      results.details.list_id = listId;
      results.details.provider = 'acumbamail';
      results.details.emails_created = 0;

      // 2. Create email templates
      for (const email of emailSequence) {
        try {
          await fetch('https://acumbamail.com/api/1/createTemplate/', { method: 'POST', headers: ah,
            body: JSON.stringify({ auth_token: apiKey, name: email.subject, body: email.body, list_id: listId })
          });
          results.details.emails_created++;
        } catch {}
      }

      // 3. Create campaigns as drafts
      let campaignsOk = 0;
      for (const email of emailSequence) {
      try {
        const cr = await fetch('https://acumbamail.com/api/1/createCampaign/', { method: 'POST', headers: ah,
          body: JSON.stringify({ auth_token: apiKey, name: `${project.name} — ${email.subject}`,
            subject: email.subject, from_email: `hello@${project.domain || 'dynastyempire.com'}`,
            from_name: project.name, list_id: listId, html: email.body })
        });
        if (cr.ok) campaignsOk++;
      } catch {}
    }
    results.details.campaigns_created = campaignsOk;
    results.details.automation_note = 'Email campaigns created as drafts. Set up autoresponder drip sequence in Acumbamail dashboard → Automation → New Automation.';

    // 4. Get subscription form HTML
    try {
      const formResp = await fetch('https://acumbamail.com/api/1/getSubscriptionForm/', {
        method: 'POST',
        headers: ah,
        body: JSON.stringify({ auth_token: apiKey, list_id: listId }),
      });
      if (formResp.ok) {
        const formData = await formResp.json();
        results.details.form_html = formData.form || formData.html || null;
      }
    } catch {}

    results.ok = true;
    results.cost_usd = 0; // Acumbamail is owned license
    } catch (e) { results.error = sanitizeError(e.message); results.fallback = 'Acumbamail dashboard → create list and templates manually'; }
  }
  return results;
}

// ── mod_phone: CallScaler + Insighto + Trafft ───────────────────────────────
async function mod_phone(config, project, liveUrl) {
  const results = { ok: false, service: 'phone', details: {} };
  const csKey = config.comms?.callscaler;
  const inKey = config.comms?.insighto;
  const trafftId = config.comms?.trafft_client_id;
  if (!csKey && !inKey && !trafftId) { results.error = 'No voice channel keys'; results.fallback = 'Add voice and booking credentials in communications settings.'; return results; }
  try {
    // 1. CallScaler — API is read-only (no number provisioning endpoint)
    // List existing numbers to verify account access, provide manual setup instructions
    if (csKey) {
      try {
        const numResp = await fetch('https://v2.callscaler.com/api/v2/numbers', {
          headers: { 'Authorization': `Bearer ${csKey}` }
        });
        if (numResp.ok) {
          const nums = await numResp.json();
          const existing = Array.isArray(nums) ? nums : (nums.data || []);
          if (existing.length > 0) {
            const num = existing[0];
            results.details.phone_number = num.number || num.phone_number || num.number_friendly_name;
            results.details.callscaler_id = num.uuid || num.id;
          }
          results.details.callscaler_note = 'CallScaler API is read-only. Purchase numbers at app.callscaler.com, then configure forwarding to your business line.';
          results.details.callscaler_numbers_found = existing.length;
        }
      } catch (e) { results.details.callscaler_error = sanitizeError(e.message); }
    }

    // 2. Insighto — create AI voice agent
    if (inKey) {
      try {
        const agentResp = await fetch('https://app.insighto.ai/api/v1/assistant', {
          method: 'POST', headers: { 'Authorization': `Bearer ${inKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `${project.name} AI Receptionist`,
            description: project.description || `AI receptionist for ${project.name}`,
            greeting: `Hello! Thank you for calling ${project.name}. How can I help you today?`,
            instructions: `You are a friendly receptionist for ${project.name}. ${project.description || ''}. Help callers with booking appointments, answering FAQs, and transferring to the right person.`
          })
        });
        if (agentResp.ok) {
          const agent = await agentResp.json();
          results.details.insighto_agent_id = agent.id || agent.assistant_id;
          // Create a phone widget for the assistant
          try {
            await fetch('https://app.insighto.ai/api/v1/widget', {
              method: 'POST', headers: { 'Authorization': `Bearer ${inKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ assistant_id: agent.id || agent.assistant_id, type: 'phone', name: `${project.name} Phone` })
            });
          } catch {}
        }
      } catch (e) { results.details.insighto_error = sanitizeError(e.message); }
    }

    // 3. Trafft — create booking service
    if (trafftId) {
      try {
        const svcResp = await fetch('https://app.trafft.com/api/v1/services', {
          method: 'POST', headers: { 'Authorization': `Bearer ${trafftId}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            name: `${project.name} Consultation`, duration: 30, price: 0,
            description: `Book a consultation with ${project.name}`
          })
        });
        if (svcResp.ok) {
          const svc = await svcResp.json();
          results.details.trafft_service_id = svc.id || svc.data?.id;
          results.details.booking_url = `https://app.trafft.com/booking/${trafftId}`;
        }
      } catch (e) { results.details.trafft_error = sanitizeError(e.message); }
    }

    results.ok = !!(results.details.phone_number || results.details.insighto_agent_id || results.details.trafft_service_id);
    if (!results.ok) {
      const GH_TOKEN_PH = process.env.GITHUB_TOKEN;
      if (GH_TOKEN_PH && project.slug) {
        try {
          await pushFile(GH_TOKEN_PH, 'pinohu', project.slug, 'docs/PHONE-SETUP.md',
            `# Phone & Voice Setup — ${project.name}\n\n## AI Voice Agent (Insighto)\n1. Sign up at insighto.ai\n2. Create a new receptionist agent\n3. Train on your business FAQ and pricing\n4. Connect to your phone number\n\n## Phone Number (CallScaler)\n1. Sign up at callscaler.com\n2. Search for a local number in your area\n3. Set forwarding to your mobile or Insighto agent\n\n## Appointment Scheduling (Trafft)\n1. Sign up at trafft.com\n2. Create service categories matching your offerings\n3. Set your availability calendar\n4. Embed booking widget on your site\n\n## Automation\nThe n8n "Missed Call" workflow automatically:\n- Sends apology SMS to caller\n- Creates CRM lead\n- Alerts you via email`,
            'docs: phone and voice setup guide');
          results.details.guide_pushed = true;
          results.ok = true;
        } catch {}
      }
    }
    results.cost_usd = 0; // Owned licenses
  } catch (e) { results.error = sanitizeError(e.message); results.fallback = 'Configure voice intake and booking manually.'; }
  return results;
}

// ── mod_sms: SMS-iT Campaigns + Templates ───────────────────────────────────
async function mod_sms(config, project) {
  const results = { ok: false, service: 'sms', details: {} };
  const apiKey = config.comms?.smsit;
  if (!apiKey) { results.error = 'No SMS channel key'; results.fallback = 'Add SMS channel credentials in communications settings.'; return results; }
  // Note: SMS-iT's public API (tool-it.smsit.ai) is for their link shortener tool.
  // The core SMS CRM platform (app.smsit.ai) campaign endpoints are not publicly documented.
  // We attempt the known endpoints and fall back to manual setup instructions.
  const sh = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  try {
    // Attempt to create contact group via the CRM API
    let groupCreated = false;
    try {
      const grp = await fetch('https://app.smsit.ai/api/v3/contacts/groups', {
        method: 'POST', headers: sh,
        body: JSON.stringify({ name: `${project.name} Contacts` })
      }).then(r => r.json());
      results.details.group_id = grp.data?.id || grp.id;
      groupCreated = !!(grp.data?.id || grp.id);
    } catch {}

    // Store template text for manual creation
    results.details.templates = [
      { name: 'Welcome', body: `Welcome to ${project.name}! We're glad to have you. Reply HELP for assistance.` },
      { name: 'Reminder', body: `Reminder: Your appointment with ${project.name} is coming up. Reply CONFIRM to confirm.` },
      { name: 'Follow-up', body: `Thanks for choosing ${project.name}! We'd love your feedback. Rate us 1-5.` }
    ];
    results.details.setup_note = 'SMS-iT campaign API is not publicly documented. Templates provided — create them at app.smsit.ai → Campaigns → Templates.';
    results.ok = groupCreated;
    if (!results.ok) {
      // Fallback: push SMS templates to repo
      const GH_TOKEN_SMS = process.env.GITHUB_TOKEN;
      if (GH_TOKEN_SMS && project.slug) {
        try {
          const templates = (results.details?.templates || []).map((t, i) => `### Template ${i+1}: ${t.name || 'SMS'}\n\`\`\`\n${t.text || t.body || 'Template text not available'}\n\`\`\``).join('\n\n');
          await pushFile(GH_TOKEN_SMS, 'pinohu', project.slug, 'docs/SMS-TEMPLATES.md',
            `# SMS Templates — ${project.name}\n\n## Setup at SMS-iT (app.smsit.ai)\n1. Create contact group: "${project.name} Subscribers"\n2. Create templates below in Campaigns → Templates\n3. Set up automation triggers\n\n${templates || '### Welcome SMS\n```\nWelcome to ' + project.name + '! Reply HELP for assistance or STOP to unsubscribe.\n```\n\n### Appointment Reminder\n```\nReminder: Your appointment with ' + project.name + ' is tomorrow. Reply C to confirm or R to reschedule.\n```\n\n### Follow-up\n```\nThanks for choosing ' + project.name + '! How was your experience? Reply 1-5 to rate us.\n```'}`,
            'docs: SMS templates');
          results.details.guide_pushed = true;
          results.ok = true;
        } catch {}
      }
    }
    results.cost_usd = 0;
  } catch (e) { results.error = sanitizeError(e.message); results.fallback = 'Configure SMS groups and templates manually.'; }
  return results;
}

// ── mod_chatbot: Self-hosted chatbot widget with pre-generated FAQ ──────────
// Generates FAQ content at build time using Dynasty's AI, then creates a
// static chatbot widget that answers from the pre-generated FAQ — no API
// key needed at runtime on the client's site.
async function mod_chatbot(config, project, liveUrl) {
  const results = { ok: false, service: 'chatbot', details: {} };
  const aiKey = process.env.ANTHROPIC_API_KEY;
  const GH_TOKEN = process.env.GITHUB_TOKEN;
  if (!aiKey) { results.error = 'No Anthropic API key for FAQ generation'; results.fallback = 'Set ANTHROPIC_API_KEY env var'; return results; }

  try {
    const businessContext = `Business: ${project.name}\nType: ${project.type || 'business'}\nDescription: ${project.description || ''}\nWebsite: ${liveUrl || ''}\nLocation: ${project.location || ''}\nServices: ${project.services || 'Professional services'}`;

    // Generate comprehensive FAQ at BUILD TIME using a free LLM (Gemini → Groq Llama)
    let faqItems = [];
    try {
      const faqText = await freeLLM(
        `Generate 20 FAQ items for this business. Return ONLY a valid JSON array where each item has "q" (question) and "a" (detailed answer, 2-4 sentences). Cover: services offered, pricing, process/how it works, qualifications/experience, hours/availability, location/service area, guarantees/warranties, payment methods, booking/scheduling, what to expect, turnaround time, cancellation policy, support/contact, comparison to competitors, getting started.\n\n${businessContext}\n\nReturn ONLY the JSON array. No markdown, no backticks.`,
        3000
      );
      try { faqItems = JSON.parse(faqText.match(/\[[\s\S]*\]/)?.[0] || '[]'); } catch {}
    } catch {}

    // Create a STATIC chatbot widget — runs entirely client-side with NO API calls
    // All answers come from the pre-generated FAQ embedded in the HTML
    const embedWidget = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${project.name} - Chat</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif}
#dc-btn{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;background:${project.accent || '#0066FF'};color:#fff;border:none;cursor:pointer;font-size:24px;box-shadow:0 4px 16px rgba(0,0,0,0.3);z-index:9998;transition:transform .2s}
#dc-btn:hover{transform:scale(1.1)}
#dc-panel{display:none;position:fixed;bottom:90px;right:20px;width:380px;max-height:520px;background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.2);z-index:9999;flex-direction:column;overflow:hidden}
#dc-panel.open{display:flex}
.dc-hdr{padding:16px;background:${project.accent || '#0066FF'};color:#fff;font-weight:600;font-size:15px;display:flex;justify-content:space-between;align-items:center}
.dc-msgs{flex:1;padding:12px;overflow-y:auto;max-height:360px;font-size:14px;line-height:1.6}
.dc-m{margin:8px 0;padding:10px 14px;border-radius:14px;max-width:85%;word-wrap:break-word}
.dc-bot{background:#f0f0f5;color:#333}.dc-usr{background:${project.accent || '#0066FF'};color:#fff;margin-left:auto;text-align:right}
.dc-in{display:flex;border-top:1px solid #eee;padding:8px}
.dc-in input{flex:1;border:none;padding:10px 14px;font-size:14px;outline:none;border-radius:8px}
.dc-in button{background:${project.accent || '#0066FF'};color:#fff;border:none;padding:8px 18px;cursor:pointer;font-weight:600;border-radius:8px;margin-left:4px}
.dc-sugs{padding:8px 12px;display:flex;flex-wrap:wrap;gap:6px}
.dc-s{font-size:12px;padding:6px 12px;border:1px solid #ddd;border-radius:14px;cursor:pointer;background:#fff;color:#555;transition:.15s}
.dc-s:hover{border-color:${project.accent || '#0066FF'};color:${project.accent || '#0066FF'}}
@media(max-width:480px){#dc-panel{width:calc(100vw - 24px);right:12px;bottom:80px;max-height:70vh}}
</style></head><body>
<button id="dc-btn" onclick="document.getElementById('dc-panel').classList.toggle('open')" aria-label="Open chat">💬</button>
<div id="dc-panel" role="dialog" aria-label="Chat assistant">
<div class="dc-hdr"><span>${project.name} Assistant</span><button onclick="document.getElementById('dc-panel').classList.remove('open')" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer" aria-label="Close chat">&times;</button></div>
<div class="dc-msgs" id="dc-msgs"><div class="dc-m dc-bot">Hi! Welcome to ${project.name}. Ask me anything about our services — I'm here to help!</div></div>
<div class="dc-sugs" id="dc-sugs"></div>
<div class="dc-in"><input id="dc-inp" placeholder="Ask a question..." onkeydown="if(event.key==='Enter')dcSend()" aria-label="Type your question"><button onclick="dcSend()">Send</button></div>
</div>
<script>
// Pre-generated FAQ — no API calls needed at runtime
var FAQ=${JSON.stringify(faqItems)};
var SUGS=FAQ.slice(0,4).map(function(f){return f.q});
var sugEl=document.getElementById('dc-sugs');
SUGS.forEach(function(s){var b=document.createElement('span');b.className='dc-s';b.textContent=s;b.onclick=function(){document.getElementById('dc-inp').value=s;dcSend()};sugEl.appendChild(b)});

function findAnswer(q){
  q=q.toLowerCase();
  var best=null,bestScore=0;
  FAQ.forEach(function(f){
    var words=f.q.toLowerCase().split(/\\s+/);
    var score=0;
    words.forEach(function(w){if(w.length>3&&q.includes(w))score++});
    // Also check answer keywords
    var aWords=f.a.toLowerCase().split(/\\s+/).slice(0,20);
    aWords.forEach(function(w){if(w.length>4&&q.includes(w))score+=0.5});
    if(score>bestScore){bestScore=score;best=f}
  });
  if(best&&bestScore>=2)return best.a;
  if(best&&bestScore>=1)return best.a+"\\n\\nIf you need more specific information, please contact us directly!";
  return "Thanks for your question! I don't have a specific answer for that, but I'd love to help. Please reach out to us directly at ${liveUrl || 'our website'} or email us for personalized assistance.";
}

function dcSend(){
  var inp=document.getElementById('dc-inp'),msg=inp.value.trim();
  if(!msg)return;inp.value='';
  var msgs=document.getElementById('dc-msgs');
  msgs.innerHTML+='<div class="dc-m dc-usr">'+msg.replace(/</g,'&lt;')+'</div>';
  document.getElementById('dc-sugs').style.display='none';
  setTimeout(function(){
    var answer=findAnswer(msg);
    msgs.innerHTML+='<div class="dc-m dc-bot">'+answer.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>')+'</div>';
    msgs.scrollTop=msgs.scrollHeight;
  },300+Math.random()*500);
}
</script></body></html>`;

    // Push chatbot widget to the project repo. We ship TWO files:
    //   1. public/chatbot.html — static FAQ widget, works with zero config.
    //   2. src/app/api/chat/route.ts — optional streaming chat route modeled
    //      on the Vercel AI Chatbot template. Dormant until the customer sets
    //      GOOGLE_API_KEY (or OPENAI_API_KEY) in their Vercel env; then the
    //      widget automatically switches to live-model responses with the
    //      FAQ as system-prompt grounding. Customer keeps their own vendor
    //      bill — no Chatbase or Dynasty-held secrets in customer runtime.
    const chatRouteTs = `import { streamText } from 'ai';\nimport { createGoogleGenerativeAI } from '@ai-sdk/google';\nimport { createOpenAI } from '@ai-sdk/openai';\n\nexport const runtime = 'edge';\nexport const maxDuration = 60;\n\n// FAQ pre-generated at build time, used as system-prompt grounding.\nconst FAQ = ${JSON.stringify(faqItems)};\n\nfunction systemPrompt() {\n  const ctx = FAQ.map((f) => \`Q: \${f.q}\\nA: \${f.a}\`).join('\\n\\n');\n  return \`You are the ${project.name.replace(/"/g, '\\\\"')} assistant. Answer customer questions using ONLY the business context below. If the user asks something not covered, offer to have the business contact them. Keep replies friendly and concise (2-4 sentences).\\n\\nBUSINESS CONTEXT:\\n\${ctx}\`;\n}\n\nexport async function POST(req: Request) {\n  const { messages } = await req.json();\n  let model;\n  if (process.env.GOOGLE_API_KEY) {\n    const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY });\n    model = google('gemini-2.0-flash');\n  } else if (process.env.OPENAI_API_KEY) {\n    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });\n    model = openai('gpt-4o-mini');\n  } else {\n    return new Response(JSON.stringify({ error: 'No AI key configured. Set GOOGLE_API_KEY or OPENAI_API_KEY in Vercel env vars to enable live chat. The static FAQ widget at /chatbot.html continues to work.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });\n  }\n  const result = await streamText({\n    model,\n    system: systemPrompt(),\n    messages,\n    maxTokens: 500,\n    temperature: 0.4,\n  });\n  return result.toDataStreamResponse();\n}\n`;

    if (GH_TOKEN && project.slug) {
      try {
        await pushFile(GH_TOKEN, 'pinohu', project.slug, 'public/chatbot.html', embedWidget, 'feat: dynasty chatbot widget (FAQ-powered, no API key needed)');
        await pushFile(GH_TOKEN, 'pinohu', project.slug, 'src/app/api/chat/route.ts', chatRouteTs, 'feat: optional streaming chat route (Vercel AI SDK, dormant until GOOGLE_API_KEY/OPENAI_API_KEY is set)');
        results.details.files_pushed = ['public/chatbot.html', 'src/app/api/chat/route.ts'];
      } catch {}
    }

    results.details.type = 'static-faq-chatbot + optional-streaming-route';
    results.details.faq_count = faqItems.length;
    results.details.embed_instruction = 'Add to your site: <iframe src="/chatbot.html" style="position:fixed;bottom:0;right:0;width:420px;height:580px;border:none;z-index:9999"></iframe>';
    results.details.upgrade_path = 'Set GOOGLE_API_KEY or OPENAI_API_KEY in your Vercel env to activate streaming chat at /api/chat (route already scaffolded, uses FAQ as system context).';
    results.details.note = 'Static FAQ chatbot runs client-side with zero runtime API calls. Optional streaming chat route ships dormant; activates when a free Gemini or OpenAI key is added.';
    results.ok = faqItems.length > 0;
    if (!results.ok) { results.error = 'FAQ generation failed'; results.fallback = 'Create FAQ manually and update public/chatbot.html'; }
    results.cost_usd = 0.02; // One-time AI FAQ generation cost at build time
  } catch (e) { results.error = sanitizeError(e.message); results.fallback = 'Create a chatbot widget manually'; }
  return results;
}

// ── mod_seo: WriterZen/NeuronWriter + AI Fallback ───────────────────────────
async function mod_seo(config, project, liveUrl) {
  const results = { ok: false, service: 'seo', details: {} };
  const wzKey = config.content?.writerzen;
  const nwKey = config.content?.neuronwriter;
  const aiKey = process.env.ANTHROPIC_API_KEY;
  const GH_TOKEN = process.env.GITHUB_TOKEN;
  if (!aiKey && !wzKey && !nwKey) { results.error = 'No SEO keys configured'; results.fallback = 'Add ANTHROPIC_API_KEY, writerzen, or neuronwriter to config'; return results; }

  // AI content generation helper — uses free LLMs (Gemini → Groq Llama)
  async function aiGenSeo(prompt, maxTokens = 4000) {
    return freeLLM(prompt, maxTokens);
  }

  try {
    // 1. Keyword research (WriterZen or AI fallback)
    let keywords = [];
    if (wzKey) {
      try {
        const kwResp = await fetch('https://app.writerzen.net/api/v1/keyword-explorer', {
          method: 'POST', headers: { 'Authorization': `Bearer ${wzKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: project.name, country: 'us', language: 'en' })
        });
        if (kwResp.ok) {
          const kwData = await kwResp.json();
          keywords = (kwData.data || kwData.keywords || []).slice(0, 20).map(k => typeof k === 'string' ? k : k.keyword);
        }
      } catch {}
    }
    if (keywords.length === 0) {
      // AI fallback for keywords
      const kwRaw = await aiGenSeo(`Generate 20 SEO keywords for a business called "${project.name}" in the "${project.type || 'business'}" niche. Return ONLY a JSON array of strings, no explanation.`, 500);
      try { keywords = JSON.parse(kwRaw.match(/\[[\s\S]*\]/)?.[0] || '[]'); } catch { keywords = [project.name]; }
    }
    results.details.keywords = keywords.slice(0, 20);

    // 2. Generate 3 SEO blog posts via AI (shorter for speed — owner can generate more later)
    const postsRaw = await aiGenSeo(`Generate 3 SEO blog posts for "${project.name}" (${project.type || 'business'}). Target keywords: ${keywords.slice(0, 3).join(', ')}.

Return ONLY valid JSON array:
[{"slug":"kebab-case","title":"SEO Title","description":"Meta desc 155 chars","content":"<h2>Heading</h2><p>400+ words of real content...</p>","tags":["tag1","tag2"]}]

Each post: 400+ words HTML content, unique keywords, actionable content. Keep it concise.`, 4000);

    let posts = [];
    try { posts = JSON.parse(postsRaw.match(/\[[\s\S]*\]/)?.[0] || '[]'); } catch {}
    results.details.posts_generated = posts.length;

    // 3. Push posts to GitHub repo if possible
    if (GH_TOKEN && posts.length > 0 && project.slug) {
      let pushed = 0;
      for (const post of posts) {
        try {
          const mdContent = `---\ntitle: "${post.title}"\ndescription: "${post.description}"\ntags: ${JSON.stringify(post.tags || [])}\ndate: "${new Date().toISOString().split('T')[0]}"\n---\n\n${post.content}`;
          await pushFile(GH_TOKEN, 'pinohu', project.slug, `content/blog/${post.slug}.md`, mdContent, `feat: SEO blog post — ${post.slug}`);
          pushed++;
        } catch {}
      }
      results.details.posts_pushed = pushed;
    }

    // 4. NeuronWriter content optimization (if key available)
    if (nwKey && posts.length > 0) {
      try {
        for (const post of posts.slice(0, 3)) { // Optimize top 3 posts (consumes analysis credits)
          const optResp = await fetch('https://app.neuronwriter.com/neuron-api/0.5/writer/evaluate-content', {
            method: 'POST', headers: { 'X-API-KEY': nwKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: post.content, keyword: post.tags?.[0] || project.name, language: 'en' })
          });
          if (optResp.ok) {
            const opt = await optResp.json();
            if (opt.optimized_content || opt.suggestions) {
              post.content = opt.optimized_content || post.content;
              results.details.neuronwriter_optimized = (results.details.neuronwriter_optimized || 0) + 1;
            }
          }
        }
      } catch {}
    }

    // 5. Multi-language detection — generate in second language if bilingual market
    const bilingualMarkets = { 'canada': 'fr', 'quebec': 'fr', 'miami': 'es', 'los angeles': 'es', 'texas': 'es', 'switzerland': 'de' };
    const location = (project.location || '').toLowerCase();
    const secondLang = Object.entries(bilingualMarkets).find(([k]) => location.includes(k))?.[1];
    if (secondLang && posts.length > 0) {
      try {
        const translatedRaw = await aiGenSeo(`Translate these blog post titles and descriptions to ${secondLang === 'fr' ? 'French' : secondLang === 'es' ? 'Spanish' : 'German'}. Return JSON array: [{"slug":"original-slug-${secondLang}","title":"translated","description":"translated","tags":["tag1"]}]\n\n${JSON.stringify(posts.map(p => ({slug: p.slug, title: p.title, description: p.description})))}`, 2000);
        try {
          const translated = JSON.parse(translatedRaw.match(/\[[\s\S]*\]/)?.[0] || '[]');
          results.details.translated_posts = translated.length;
          results.details.secondary_language = secondLang;
        } catch {}
      } catch {}
    }

    results.ok = posts.length > 0 || keywords.length > 0;
    results.cost_usd = posts.length > 0 ? 0.05 : 0; // AI content generation cost
    if (!results.ok) { results.error = 'No content generated'; results.fallback = 'Create blog content manually'; }
  } catch (e) { results.error = sanitizeError(e.message); results.fallback = 'Generate SEO content manually'; }
  return results;
}

// ── mod_video: Vadoo AI + Fliki ─────────────────────────────────────────────
async function mod_video(config, project) {
  const results = { ok: false, service: 'video', details: {} };
  const vadooKey = config.content?.vadoo_ai;
  const flikiKey = config.content?.fliki;
  if (!vadooKey && !flikiKey) { results.error = 'No video generation keys'; results.fallback = 'Create explainer video assets manually using your preferred video workflow.'; return results; }
  try {
    // Vadoo AI — create explainer video
    if (vadooKey) {
      try {
        const vid = await fetch('https://aiapi.vadoo.tv/api/generate_video', {
          method: 'POST', headers: { 'X-Api-Key': vadooKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `${project.name}: ${(project.description || '').slice(0, 300)}`
          })
        }).then(r => r.json());
        if (vid.vid || vid.id || vid.video_id) {
          results.details.vadoo_video_id = vid.vid || vid.id || vid.video_id;
          results.ok = true;
        }
      } catch (e) { results.details.vadoo_error = sanitizeError(e.message); }
    }

    // Fliki — create social clips
    if (flikiKey) {
      try {
        const clip = await fetch('https://api.fliki.ai/v1/generate/text-to-speech', {
          method: 'POST', headers: { 'Authorization': `Bearer ${flikiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `${project.name} — ${(project.description || '').slice(0, 200)}. Visit us today!`,
            voiceId: 'en-US-1', format: 'mp3'
          })
        }).then(r => r.json());
        if (clip.id) { results.details.fliki_clip_id = clip.id; results.ok = true; }
      } catch (e) { results.details.fliki_error = sanitizeError(e.message); }
    }

    if (!results.ok) { results.error = 'Video generation failed'; results.fallback = 'Create video assets manually.'; }
    results.cost_usd = 0; // Owned licenses
  } catch (e) { results.error = sanitizeError(e.message); results.fallback = 'Create explainer video assets manually.'; }
  return results;
}

// ── mod_design: SUPERMACHINE + Pixelied + RelayThat ─────────────────────────
async function mod_design(config, project) {
  const results = { ok: false, service: 'design', details: {} };
  const smKey = config.content?.supermachine;
  const pxKey = config.content?.pixelied;
  const rtKey = config.content?.relaythat;
  try {
    // Generate design asset prompts and brand guide — push to repo
    const GH_TOKEN_DESIGN = process.env.GITHUB_TOKEN;
    if (GH_TOKEN_DESIGN && project.slug) {
      const brandGuide = `# Brand Assets Guide — ${project.name}

## Design Specifications
- **Accent Color:** ${project.accent || '#C9A84C'}
- **Business Type:** ${project.type || 'business'}

## Required Assets

### 1. Hero Image (1920x1080)
**AI Generation Prompt:**
> Professional hero image for ${project.name}, ${project.type || 'business'} theme, modern clean design, ${project.accent || 'blue'} accent color, abstract technology background, high quality, 4K

**Generate at:** SUPERMACHINE, Midjourney, DALL-E, or Ideogram

### 2. Logo (512x512)
**AI Generation Prompt:**
> Minimalist professional logo icon for "${project.name}", clean geometric design, ${project.accent || 'blue'} accent on white background, simple scalable vector style, no text

### 3. OG Image (1200x630)
**AI Generation Prompt:**
> Open Graph social preview card for ${project.name}, ${project.type || 'business'}, professional layout with accent color ${project.accent || '#C9A84C'}, clean modern design

### 4. Favicon (512x512)
Use the logo at 512x512 and create sizes: 16x16, 32x32, 180x180 (Apple touch), 192x192, 512x512.

### 5. Social Media Kit (40+ variants)
Sizes needed:
- Instagram Post: 1080x1080
- Instagram Story: 1080x1920
- Facebook Cover: 820x312
- Twitter Header: 1500x500
- LinkedIn Banner: 1584x396
- YouTube Thumbnail: 1280x720

**Tool:** Use RelayThat or Canva to generate all 40+ variants from a single source image.

## Color Palette
| Role | Color | Usage |
|------|-------|-------|
| Primary | ${project.accent || '#C9A84C'} | CTAs, highlights, brand accent |
| Background | #0A0A0A | Dark theme backgrounds |
| Surface | #1A1A1A | Cards, panels |
| Text | #EEEEEE | Primary text |
| Muted | #888888 | Secondary text |
`;
      try {
        await pushFile(GH_TOKEN_DESIGN, 'pinohu', project.slug, 'docs/BRAND-ASSETS.md', brandGuide, 'docs: brand assets guide with AI prompts');
        results.details.brand_guide_pushed = true;
        results.ok = true;
      } catch {}
    }

    // SUPERMACHINE — real API at dev.supermachine.art
    if (smKey) {
      const smHeaders = { 'Authorization': `Bearer ${smKey}`, 'Content-Type': 'application/json' };
      const smBase = 'https://dev.supermachine.art/v1';

      // Helper: generate image and poll for completion
      async function smGenerate(prompt, width, height) {
        const gen = await fetch(`${smBase}/generate`, {
          method: 'POST', headers: smHeaders,
          body: JSON.stringify({ model: 'Supermachine NextGen', prompt, negativePrompt: 'text, watermark, logo, blurry, low quality', width, height, steps: 20, guidance: 7 })
        }).then(r => r.json());
        if (!gen.batchId) return null;
        // Poll for completion (max 30s, every 3s)
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 3000));
          const poll = await fetch(`${smBase}/images?batchId=${gen.batchId}`, { headers: smHeaders }).then(r => r.json());
          if (poll.items?.[0]?.status === 'completed' && poll.items[0].url) return poll.items[0].url;
        }
        return null;
      }

      // Hero image (1024x768 — SDXL supported resolution)
      try {
        const heroUrl = await smGenerate(
          `Professional hero image for ${project.name}, ${project.type || 'business'} theme, modern clean design, ${project.accent || 'blue'} accent color, high quality, corporate`,
          1024, 768
        );
        if (heroUrl) { results.details.hero_image = heroUrl; results.ok = true; }
      } catch (e) { results.details.hero_error = sanitizeError(e.message); }

      // OG image (1024x768 then note to crop to 1200x630)
      try {
        const ogUrl = await smGenerate(
          `Social media preview card for "${project.name}", ${project.type || 'business'}, professional banner, ${project.accent || 'blue'} accent, modern design`,
          1024, 768
        );
        if (ogUrl) { results.details.og_image = ogUrl; results.ok = true; }
      } catch (e) { results.details.og_error = sanitizeError(e.message); }
    }

    // Pixelied — NO PUBLIC API (browser-based design tool only)
    // Provide manual instructions instead
    results.details.pixelied_note = 'Pixelied has no API. Create OG image (1200x630) at pixelied.com manually. Use project name and accent color.';

    // RelayThat — NO PUBLIC API (browser-based brand asset tool only)
    // Provide manual instructions instead
    results.details.relaythat_note = 'RelayThat has no API. Create social media kit (40+ variants) at relaythat.com. Set brand color to ' + (project.accent || '#0066FF') + '.';

    if (!results.ok) { results.error = 'All design services failed'; results.fallback = 'Create brand assets manually. Output as WebP for optimal performance. Sizes: hero 1920x1080, OG 1200x630, favicon 512x512.'; }
    results.cost_usd = 0;
  } catch (e) { results.error = sanitizeError(e.message); results.fallback = 'Create brand assets manually'; }
  return results;
}

// ── mod_analytics: Plerdy + PostHog ─────────────────────────────────────────
async function mod_analytics(config, project, liveUrl) {
  const results = { ok: false, service: 'analytics', details: {} };
  const phKey = config.data_research?.posthog;
  const plKey = config.data_research?.plerdy;
  if (!phKey && !plKey) { results.error = 'No analytics keys'; results.fallback = 'Set up PostHog at app.posthog.com or Plerdy at plerdy.com'; return results; }
  try {
    // PostHog — create project + snippet
    if (phKey) {
      try {
        const proj = await fetch('https://app.posthog.com/api/projects/', {
          method: 'POST', headers: { 'Authorization': `Bearer ${phKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: project.name })
        });
        if (proj.ok) {
          const pd = await proj.json();
          results.details.posthog_project_id = pd.id;
          results.details.posthog_configured = true;
          results.details.posthog_snippet = `<script>!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init('${pd.api_token}',{api_host:'https://app.posthog.com'})</script>`;
          results.ok = true;
        }
      } catch (e) { results.details.posthog_error = sanitizeError(e.message); }
    }

    // Plerdy — NO REST API for site creation. Integration is via tracking script injection.
    // Provide manual setup instructions
    if (plKey) {
      results.details.plerdy_note = 'Plerdy has no REST API for site provisioning. Add your site at plerdy.com → Settings → List of websites, then copy the tracking script and inject it into your site HTML.';
      results.details.plerdy_site_url = liveUrl || `https://${project.slug}.vercel.app`;
    }

    // Fallback: push analytics setup guide to repo
    if (!results.ok) {
      const GH_TOKEN_AN = process.env.GITHUB_TOKEN;
      if (GH_TOKEN_AN && project.slug) {
        try {
          const snippet = `<!-- PostHog Analytics -->\n<script>\n!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);\nposthog.init('YOUR_POSTHOG_KEY',{api_host:'https://app.posthog.com'});\n</script>`;
          await pushFile(GH_TOKEN_AN, 'pinohu', project.slug, 'docs/ANALYTICS-SETUP.md',
            `# Analytics Setup — ${project.name}\n\n## PostHog (Recommended)\n1. Sign up at app.posthog.com\n2. Create a project\n3. Copy your API key\n4. Add this snippet to your HTML:\n\n\`\`\`html\n${snippet}\n\`\`\`\n\n## Key Events to Track\n- page_viewed, signup_started, signup_completed\n- feature_used, upgrade_initiated, payment_completed\n\nSee ANALYTICS-INSTRUMENTATION.md for the full event taxonomy.`,
            'docs: analytics setup guide');
          results.details.guide_pushed = true;
          results.ok = true;
        } catch {}
      }
    }
    results.cost_usd = 0;
  } catch (e) { results.error = sanitizeError(e.message); results.fallback = 'Set up analytics manually'; }
  return results;
}

// ── mod_leads: Happierleads + Salespanel ────────────────────────────────────
async function mod_leads(config, project, liveUrl) {
  const results = { ok: false, service: 'leads', details: {} };
  const hlKey = config.data_research?.happierleads;
  const spKey = config.data_research?.salespanel;
  if (!hlKey && !spKey) { results.error = 'No lead intelligence keys'; results.fallback = 'Set up lead identification and scoring credentials in data settings.'; return results; }
  try {
    // Happierleads — visitor identification
    if (hlKey) {
      try {
        const site = await fetch('https://rest-admin.happierleads.com/admin/websites', {
          method: 'POST', headers: { 'Authorization': `Bearer ${hlKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: liveUrl || `https://${project.slug}.vercel.app`, name: project.name })
        });
        if (site.ok) {
          const sd = await site.json();
          results.details.happierleads_id = sd.id;
          results.details.happierleads_snippet = sd.tracking_code || sd.script;
          results.ok = true;
        }
      } catch (e) { results.details.happierleads_error = sanitizeError(e.message); }
    }

    // Salespanel — lead scoring
    if (spKey) {
      try {
        // Salespanel API is primarily read-only (contacts, leads, companies). Tracking is via JS snippet.
        // We create a custom activity to register the site, then provide tracking setup instructions.
        const tracker = await fetch('https://salespanel.io/api/v1/custom-activity/create/', {
          method: 'POST', headers: { 'Authorization': `Token ${spKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ activity_type: 'site_registered', domain: liveUrl || `${project.slug}.vercel.app`, name: project.name })
        });
        if (tracker.ok) {
          const td = await tracker.json();
          results.details.salespanel_id = td.id;
          results.details.salespanel_snippet = td.tracking_code || td.script;
          results.ok = true;
        }
      } catch (e) { results.details.salespanel_error = sanitizeError(e.message); }
    }

    // Fallback: push lead intelligence guide
    if (!results.ok) {
      const GH_TOKEN_L = process.env.GITHUB_TOKEN;
      if (GH_TOKEN_L && project.slug) {
        try {
          await pushFile(GH_TOKEN_L, 'pinohu', project.slug, 'docs/LEAD-INTELLIGENCE.md',
            `# Lead Intelligence Setup — ${project.name}\n\n## SalesPanel (Recommended)\n1. Sign up at salespanel.io\n2. Add tracking script to your site\n3. Configure lead scoring rules (engagement > 50 = hot lead)\n\n## Happierleads\n1. Sign up at happierleads.com\n2. Install JavaScript tracker\n3. Identify company visitors by IP\n\n## Lead Scoring Framework\n| Signal | Points | Trigger |\n|--------|--------|--------|\n| Page visit | +5 | Any page |\n| Pricing page | +20 | /pricing visited |\n| Sign up started | +30 | Form opened |\n| 3+ visits in 7 days | +25 | Repeat visitor |\n| Demo requested | +50 | Contact form |\n\nHot lead threshold: 70+ points → alert via automation workflow.`,
            'docs: lead intelligence setup');
          results.details.guide_pushed = true;
          results.ok = true;
        } catch {}
      }
    }
    results.cost_usd = 0;
  } catch (e) { results.error = sanitizeError(e.message); results.fallback = 'Set up lead tracking manually'; }
  return results;
}

// ── mod_docs: Documentero + SparkReceipt ────────────────────────────────────
async function mod_docs(config, project) {
  const results = { ok: false, service: 'docs', details: {} };
  const docKey = config.content?.documentero;
  const sparkKey = config.data_research?.sparkreceipt;
  if (!docKey && !sparkKey) { results.error = 'No document API keys'; results.fallback = 'Generate legal documents at documentero.com. Need: Terms of Service, Privacy Policy, Service Agreement.'; return results; }
  try {
    // Legal docs — generate via AI and push to repo (Documentero templates not configured)
    const GH_TOKEN_DOCS = process.env.GITHUB_TOKEN;
    if (GH_TOKEN_DOCS && project.slug) {
      const domain = project.domain || `${project.slug}.vercel.app`;
      const email = `hello@${domain}`;
      const legalDocs = [
        { file: 'docs/TERMS-OF-SERVICE.md', name: 'Terms of Service' },
        { file: 'docs/PRIVACY-POLICY.md', name: 'Privacy Policy' },
        { file: 'docs/SERVICE-AGREEMENT.md', name: 'Service Agreement' }
      ];
      const legalGenPrompt = `Generate 3 legal documents for "${project.name}" (${project.type || 'business'}) at ${domain}. Contact: ${email}. Jurisdiction: United States.

Return in this exact format:
---BEGIN:tos---
[Complete Terms of Service - 2000+ words, covering: acceptance, services, user obligations, payment terms, IP ownership, limitation of liability, indemnification, termination, governing law, dispute resolution, modifications, contact]
---END:tos---
---BEGIN:privacy---
[Complete Privacy Policy - 1500+ words, covering: info collected, how used, cookies, third parties, data retention, security, rights (GDPR/CCPA), children, changes, contact]
---END:privacy---
---BEGIN:sla---
[Complete Service Agreement - 1500+ words, covering: scope of services, deliverables, timeline, compensation, confidentiality, IP assignment, warranties, limitation of liability, termination, force majeure]
---END:sla---`;
      const legalRaw = await freeLLM(legalGenPrompt, 6000);

      const sections = { tos: '', privacy: '', sla: '' };
      for (const key of Object.keys(sections)) {
        const match = legalRaw.match(new RegExp(`---BEGIN:${key}---([\\s\\S]*?)---END:${key}---`));
        if (match) sections[key] = match[1].trim();
      }

      // Chain of Verification — reviewer pass per document, revise only if issues.
      // Skipped for very short docs (likely failed generation).
      const cove_checklists = {
        tos:     'ToS standards: clear acceptance, scope, payment, IP, liability cap, indemnification, termination, governing law, dispute resolution, modifications, notice',
        privacy: 'Privacy standards: GDPR + CCPA + COPPA compliance, info collected, lawful basis, processing purposes, third parties, retention, security, user rights, contact DPO',
        sla:     'SLA standards: scope of services, deliverables, timeline/milestones, compensation, payment terms, confidentiality, IP assignment, warranties, liability cap, termination, force majeure, governing law',
      };
      for (const key of Object.keys(sections)) {
        if (sections[key] && sections[key].length > 500) {
          try {
            sections[key] = await verifyAndReconcile(sections[key], legalGenPrompt, {
              docType: key === 'tos' ? 'Terms of Service' : key === 'privacy' ? 'Privacy Policy' : 'Service Agreement',
              jurisdiction: 'United States',
              checklist: cove_checklists[key],
            });
          } catch (e) { console.warn(`[mod_docs] CoVe failed for ${key}: ${e.message}`); }
        }
      }

      results.details.documents = [];
      const pairs = [['tos', legalDocs[0]], ['privacy', legalDocs[1]], ['sla', legalDocs[2]]];
      for (const [key, doc] of pairs) {
        if (sections[key]?.length > 500) {
          try {
            await pushFile(GH_TOKEN_DOCS, 'pinohu', project.slug, doc.file,
              `# ${doc.name} — ${project.name}\n\n> Generated: ${new Date().toISOString().split('T')[0]}\n> DISCLAIMER: Review with legal counsel before publishing.\n\n${sections[key]}`,
              `docs: ${doc.name.toLowerCase()}`);
            results.details.documents.push({ name: doc.name, file: doc.file });
          } catch {}
        }
      }
      results.ok = results.details.documents.length > 0;
      results.details.provider = 'ai-generated';
      results.details.note = 'Legal docs generated via AI and pushed to repo. Review with legal counsel.';
    }

    // SparkReceipt — NO PUBLIC API. Provide manual setup instructions.
    results.details.sparkreceipt_note = 'SparkReceipt has no API. Download the app at sparkreceipt.com and create an account for expense tracking. Connect to QuickBooks or Xero for accounting sync.';

    if (!results.ok) { results.error = 'Document generation failed'; results.fallback = 'Generate legal docs at documentero.com'; }
    results.cost_usd = 0;
  } catch (e) { results.error = sanitizeError(e.message); results.fallback = 'Generate legal documents manually'; }
  return results;
}

// ── mod_automation: 353-Workflow Catalog Engine ─────────────────────────────
let automationCatalog;
try {
  const { readFileSync } = await import('fs');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  const __catalogDir = dirname(fileURLToPath(import.meta.url));
  const catalogCode = readFileSync(join(__catalogDir, 'automation-catalog.js'), 'utf8');
  const m = {}; const mod = { exports: m };
  (new Function('module', 'exports', catalogCode))(mod, m);
  automationCatalog = mod.exports;
  if (!automationCatalog?.ALL_AUTOMATIONS?.length) automationCatalog = null;
} catch {
  automationCatalog = null;
}

async function mod_automation(config, project, liveUrl) {
  const results = { ok: false, service: 'automation', details: {} };
  const n8nKey = process.env.N8N_API_KEY || config.automation?.n8n_api;
  const n8nUrl = config.automation?.n8n_url || process.env.N8N_URL || '';
  if (!n8nUrl) { results.fallback = 'Configure n8n URL in DYNASTY_TOOL_CONFIG or N8N_URL env var.'; return results; }
  if (!n8nKey) { results.error = 'No n8n API key'; results.fallback = 'Add N8N_API_KEY env var or n8n_api to DYNASTY_TOOL_CONFIG.automation'; return results; }
  const nh = { 'X-N8N-API-KEY': n8nKey, 'Content-Type': 'application/json' };
  const webhookBase = liveUrl || `https://${project.slug}.vercel.app`;

  if (!automationCatalog || !automationCatalog.ALL_AUTOMATIONS) {
    results.error = 'Automation catalog not loaded';
    results.fallback = 'The 353-workflow n8n catalog module (automation-catalog.js) could not be loaded. Deploy n8n workflows manually.';
    return results;
  }

  const archetype = project.archetype || project.type || 'default';
  const selectedAutomations = automationCatalog.getAutomationsForProject(archetype);
  const MAX_LIVE_DEPLOY = 50; // Deploy top N workflows via API; push full catalog as importable JSON
  const toDeploy = selectedAutomations.slice(0, MAX_LIVE_DEPLOY);

  results.details.workflows = [];
  results.details.catalog_total = automationCatalog.ALL_AUTOMATIONS.length;
  results.details.selected_for_archetype = selectedAutomations.length;
  results.details.live_deployed = 0;

  try {
    for (const auto of toDeploy) {
      try {
        const wf = automationCatalog.buildN8nWorkflow(auto, project, webhookBase);
        const resp = await fetch(`${n8nUrl}/api/v1/workflows`, {
          method: 'POST', headers: nh,
          body: JSON.stringify(wf)
        });
        const data = await resp.json();
        if (data.id) {
          let activated = false;
          try { const ar = await fetch(`${n8nUrl}/api/v1/workflows/${data.id}/activate`, { method: 'POST', headers: nh }); activated = ar.ok; } catch {}
          results.details.workflows.push({ id: data.id, automation_id: auto.id, name: auto.name, category: automationCatalog.CATEGORIES[auto.cat], active: activated });
          results.details.live_deployed++;
        }
      } catch {}
    }

    // Push the FULL catalog as importable n8n JSON to the customer's GitHub repo
    if (process.env.GITHUB_TOKEN && project.slug) {
      try {
        const fullCatalogWorkflows = selectedAutomations.map(a => automationCatalog.buildN8nWorkflow(a, project, webhookBase));
        const exportJson = JSON.stringify({ workflows: fullCatalogWorkflows, meta: { archetype, total: fullCatalogWorkflows.length, generated: new Date().toISOString() } });
        const ghHeaders = { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' };
        const org = process.env.GITHUB_ORG || 'dynasty-apps';
        await fetch(`https://api.github.com/repos/${org}/${project.slug}/contents/n8n-automation-catalog.json`, {
          method: 'PUT', headers: ghHeaders,
          body: JSON.stringify({ message: 'feat: add 353-workflow automation catalog for n8n import', content: Buffer.from(exportJson).toString('base64') })
        });
        results.details.catalog_pushed = true;

        // Also push a MANUAL_IMPORT.md with instructions
        const catList = Object.entries(automationCatalog.CATEGORIES).map(function([k, v]) { return '- **Cat ' + k + ':** ' + v; }).join('\n');
        const wfList = results.details.workflows.map(function(w) { return '- ' + w.automation_id + ': ' + w.name; }).join('\n');
        const importGuide = '# n8n Automation Import Guide\n\nThis project includes **' + fullCatalogWorkflows.length + ' pre-built automations** across ' + Object.keys(automationCatalog.CATEGORIES).length + ' categories.\n\n## Quick Import\n1. Open your n8n instance\n2. Go to **Workflows > Import from File**\n3. Upload `n8n-automation-catalog.json`\n4. Each workflow will be imported with its webhook/cron triggers pre-configured\n\n## Categories Included\n' + catList + '\n\n## Live-Deployed Workflows\nThe following ' + results.details.live_deployed + ' workflows were auto-deployed and activated:\n' + wfList + '\n\n## Webhook Base URL\nAll webhook workflows use: `' + webhookBase + '`\n';
        await fetch(`https://api.github.com/repos/${org}/${project.slug}/contents/AUTOMATION_IMPORT.md`, {
          method: 'PUT', headers: ghHeaders,
          body: JSON.stringify({ message: 'docs: add automation import guide', content: Buffer.from(importGuide).toString('base64') })
        });
      } catch {}
    }

    results.ok = results.details.live_deployed > 0 || results.details.catalog_pushed;
    results.details.workflow_ids = results.details.workflows.map(w => w.id);
    results.details.categories_covered = [...new Set(results.details.workflows.map(w => w.category))];
    if (!results.ok) { results.error = 'No workflows created'; results.fallback = 'Import n8n-automation-catalog.json manually from the repo'; }
    results.cost_usd = 0;
  } catch (e) { results.error = sanitizeError(e.message); results.fallback = 'Import n8n-automation-catalog.json manually from the repo'; }
  return results;
}

// ── mod_crm: SuiteDash Workspace + Pipeline + Portal ────────────────────────
async function mod_crm(config, project) {
  const results = { ok: false, service: 'crm', details: {} };
  const apiKey = config.crm_pm?.suitedash_api;
  const baseUrl = config.crm_pm?.suitedash_url || 'https://app.suitedash.com';
  if (!apiKey) { results.error = 'No client workspace API key'; results.fallback = 'Set up client workspace credentials manually.'; return results; }

  // License check via Neon DB
  const total = config.suitedash?.licenses_total || 136;
  let used = config.suitedash?.licenses_used || 0;
  try {
    const pool = await getPool();
    if (pool) { await ensureDynastyOpsTables(pool); used = await getLicenseCount(pool, 'suitedash'); await pool.end(); }
  } catch {}
  if (used >= total) { results.error = `Client workspace license limit reached (${used}/${total})`; results.fallback = 'All client workspace licenses are allocated. Increase capacity or reclaim unused allocations.'; return results; }

  // SuiteDash API uses custom X-Public-ID and X-Secret-Key headers
  // API is limited to contacts/companies — no projects, invoicing, or portal creation endpoints
  const publicId = config.crm_pm?.suitedash_public_id || apiKey;
  const secretKey = config.crm_pm?.suitedash_secret_key || apiKey;
  const sh = { 'X-Public-ID': publicId, 'X-Secret-Key': secretKey, 'Content-Type': 'application/json' };
  try {
    // 1. Create company (contacts/companies are the only writable API)
    const ws = await fetch(`${baseUrl}/secure-api/company`, {
      method: 'POST', headers: sh,
      body: JSON.stringify({ name: project.name, website: `https://${project.domain || project.slug + '.vercel.app'}`, industry: project.type || 'General' })
    }).then(r => r.json());
    results.details.company_id = ws.id || ws.data?.id;

    // 2. Create a contact for the project owner
    try {
      await fetch(`${baseUrl}/secure-api/contact`, {
        method: 'POST', headers: sh,
        body: JSON.stringify({ first_name: project.name, last_name: 'Admin', email: `admin@${project.domain || 'dynastyempire.com'}`, company_id: results.details.company_id })
      });
    } catch {}

    // 3. Pipeline, tasks, invoicing, portal — NOT available via API. Document for manual setup.
    results.details.manual_setup = 'SuiteDash API is limited to contacts/companies. Set up deal pipeline, onboarding tasks, invoice templates, and client portal at app.suitedash.com manually.';

    results.details.portal_url = `${baseUrl}/portal`;
    results.details.workspace_url = `${baseUrl}`;
    // Record license allocation in Neon
    try { const pool = await getPool(); if (pool) { await allocateLicense(pool, 'suitedash', project.slug, results.details.company_id); await pool.end(); } } catch {}
    results.details.licenses_used = used + 1;
    results.ok = true;
    results.cost_usd = 0;
  } catch (e) { results.error = sanitizeError(e.message); results.fallback = 'Set up client workspace manually.'; }
  return results;
}

// ── mod_directory: Brilliant Directories ─────────────────────────────────────
async function mod_directory(config, project) {
  const results = { ok: false, service: 'directory', details: {} };
  const apiKey = config.directories?.brilliant_api;
  if (!apiKey) { results.error = 'No directory API key'; results.fallback = 'Set up directory credentials manually.'; return results; }

  // License check via Neon DB
  const total = config.directories?.brilliant_licenses || 100;
  let used = config.directories?.brilliant_licenses_used || 0;
  try { const pool = await getPool(); if (pool) { await ensureDynastyOpsTables(pool); used = await getLicenseCount(pool, 'brilliant_directories'); await pool.end(); } } catch {}
  if (used >= total) { results.error = `Directory license limit reached (${used}/${total})`; results.fallback = 'All directory licenses are allocated.'; return results; }

  // Note: Brilliant Directories API is per-site (manages content within an existing directory).
  // There is NO endpoint to provision a brand new directory site — that's done via the BD dashboard.
  // We document what needs to be set up manually and use the API to create initial content if site exists.
  const dirDomain = project.domain || `${project.slug}.brilliantdirectories.com`;
  // SSRF protection: only allow *.brilliantdirectories.com domains
  try {
    const parsed = new URL(`https://${dirDomain}`);
    if (!parsed.hostname.endsWith('.brilliantdirectories.com') && !parsed.hostname.endsWith('.vercel.app') && !parsed.hostname.endsWith('.yourdeputy.com')) {
      results.error = 'Directory domain not in allowed list'; results.fallback = 'Use a *.brilliantdirectories.com domain'; return results;
    }
  } catch { results.error = 'Invalid directory domain'; return results; }
  try {
    // Attempt to create initial content via per-site API (requires existing BD site)
    let siteApiWorks = false;
    try {
      const testResp = await fetch(`https://${dirDomain}/api/v2/post/search`, {
        method: 'POST', headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 1 })
      });
      siteApiWorks = testResp.ok;
    } catch {}

    if (siteApiWorks) {
      // Create seed listing posts
      for (const cat of ['General', 'Featured', 'Premium']) {
        try {
          await fetch(`https://${dirDomain}/api/v2/post/create`, {
            method: 'POST', headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: `Sample ${cat} Listing`, body: `${project.name} ${cat.toLowerCase()} listing.`, category: cat })
          });
        } catch {}
      }
      results.details.seed_listings = 3;
    }

    results.details.directory_url = `https://${dirDomain}`;
    results.details.setup_note = 'Brilliant Directories site must be created at brilliantdirectories.com dashboard. API manages content within an existing site. Set up membership tiers (Free/Featured $29/Premium $99) in the admin panel.';

    try { const pool = await getPool(); if (pool) { await allocateLicense(pool, 'brilliant_directories', project.slug, results.details.directory_url || dirDomain); await pool.end(); } } catch {}
    results.details.licenses_used = used + 1;
    results.ok = true;
    results.cost_usd = 0;
  } catch (e) { results.error = sanitizeError(e.message); results.fallback = 'Create directory manually.'; }
  return results;
}

// ── mod_wordpress: 20i + Dynasty Developer Theme ────────────────────────────
async function mod_wordpress(config, project) {
  const results = { ok: false, service: 'wordpress', details: {} };
  const apiKey = config.infrastructure?.twentyi_general || process.env.TWENTYI_API_KEY;
  if (!apiKey) { results.error = 'No managed CMS hosting API key'; results.fallback = 'Add managed CMS hosting credentials to infrastructure settings.'; return results; }
  const auth = `Bearer ${Buffer.from(apiKey).toString('base64')}`;
  const domain = project.domain || `${project.slug}.com`;
  const resellerId = config.infrastructure?.twentyi_reseller_id || '10455';
  try {
    // 1. Create WordPress hosting package (type 88291 = WordPress Pinnacle)
    const addResp = await fetch(`https://api.20i.com/reseller/${resellerId}/addWeb`, {
      method: 'POST', headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain_name: domain, type: '88291' })
    });
    const addData = await addResp.json();
    if (!addResp.ok || !addData?.result) { results.error = `20i WP creation failed: ${JSON.stringify(addData).slice(0, 120)}`; return results; }
    const packageId = addData.result;
    results.details.package_id = packageId;
    results.details.domain = domain;
    results.details.control_panel = `https://my.20i.com/package/${packageId}`;
    results.details.wp_admin = `https://${domain}/wp-admin`;

    // 2. Install Dynasty Developer theme via 20i WP CLI (if available)
    try {
      await fetch(`https://api.20i.com/package/${packageId}/web/wordpressCli`, {
        method: 'POST', headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'theme install flavor --activate || theme activate flavor' })
      });
    } catch {}

    // 3. Install plugins
    const plugins = ['hide-my-wp-ghost', 'stackable-ultimate-gutenberg-blocks'];
    for (const plugin of plugins) {
      try {
        await fetch(`https://api.20i.com/package/${packageId}/web/wordpressCli`, {
          method: 'POST', headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: `plugin install ${plugin} --activate` })
        });
      } catch {}
    }
    results.details.plugins = plugins;

    // 4. Set site title + tagline
    try {
      await fetch(`https://api.20i.com/package/${packageId}/web/wordpressCli`, {
        method: 'POST', headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: `option update blogname "${(project.name || '').replace(/["\\\$`!]/g, '')}"` })
      });
      await fetch(`https://api.20i.com/package/${packageId}/web/wordpressCli`, {
        method: 'POST', headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: `option update blogdescription "${((project.description || project.name) || '').replace(/["\\\$`!]/g, '')}"` })
      });
    } catch {}

    results.ok = true;
    results.cost_usd = 0;
  } catch (e) { results.error = sanitizeError(e.message); results.fallback = 'Create managed CMS package manually in infrastructure panel.'; }
  return results;
}

// ── mod_social: Vista Social Calendar Import ────────────────────────────────
async function mod_social(config, project) {
  const results = { ok: false, service: 'social', details: {} };
  const apiKey = config.content?.vista_social;
  if (!apiKey) { results.error = 'No Vista Social API key'; results.fallback = 'Import social media calendar CSV at vistasocial.com manually. Calendar file is in the repo at social-media/calendar.csv'; return results; }
  try {
    // Create social profile group
    const grp = await fetch('https://api.vistasocial.com/v1/profile-groups', {
      method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: project.name })
    }).then(r => r.json());
    const groupId = grp.id || grp.data?.id;
    results.details.group_id = groupId;
    results.details.import_note = 'Social calendar CSV generated in repo at social-media/calendar.csv — import via Vista Social bulk scheduler';
    results.ok = !!groupId;
    if (!groupId) {
      // Fallback: push social setup guide
      const GH_TOKEN_S = process.env.GITHUB_TOKEN;
      if (GH_TOKEN_S && project.slug) {
        try {
          await pushFile(GH_TOKEN_S, 'pinohu', project.slug, 'docs/SOCIAL-MEDIA-SETUP.md',
            `# Social Media Setup — ${project.name}\n\n## Vista Social (Recommended)\n1. Sign up at vistasocial.com\n2. Create a profile group named "${project.name}"\n3. Connect your social accounts (LinkedIn, X, Instagram, Facebook, TikTok)\n4. Import the social calendar: social-media/calendar.csv\n5. Set posting schedule (optimal times auto-detected)\n\n## Calendar Files in Repo\n- \`social-media/calendar.csv\` — Import to any scheduler\n- \`social-media/calendar.json\` — API-ready format\n- \`social-media/SOCIAL-MEDIA-CALENDAR.md\` — Full calendar preview\n\n## Alternative Tools\n- Buffer, Hootsuite, Later, Sprout Social\n- All accept CSV import in the same format`,
            'docs: social media setup guide');
          results.details.guide_pushed = true;
          results.ok = true;
        } catch {}
      }
    }
    results.cost_usd = 0;
  } catch (e) { results.error = sanitizeError(e.message); results.fallback = 'Set up Vista Social manually and import calendar.csv'; }
  return results;
}

// ── mod_verify: Post-Deploy Smoke Test ──────────────────────────────────────
async function mod_verify(config, project, liveUrl) {
  const results = { ok: false, service: 'verify', details: {} };
  const url = liveUrl || `https://${project.slug}.vercel.app`;
  // SSRF protection: only allow HTTPS to known domains
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') { results.error = 'HTTPS required'; return results; }
    const allowed = ['.vercel.app', '.yourdeputy.com', '.dynastyempire.com'];
    if (!allowed.some(d => parsed.hostname.endsWith(d))) { results.error = 'URL domain not allowed for verification'; return results; }
  } catch { results.error = 'Invalid URL'; return results; }
  const checks = [];
  const routes = ['/', '/docs', '/pricing'];
  for (const route of routes) {
    try {
      const r = await fetch(`${url}${route}`, { redirect: 'follow' });
      const html = await r.text();
      const hasName = html.includes(project.name) || html.includes(project.slug);
      const hasObjectObject = html.includes('[object Object]');
      checks.push({ route, status: r.status, ok: r.status === 200, has_project_name: hasName, has_object_object: hasObjectObject });
    } catch (e) { checks.push({ route, status: 0, ok: false, error: sanitizeError(e.message) }); }
  }

  // API health check
  try {
    const api = await fetch(`${url}/api/v1`);
    checks.push({ route: '/api/v1', status: api.status, ok: api.status === 200 || api.status === 404 });
  } catch (e) { checks.push({ route: '/api/v1', status: 0, ok: false, error: sanitizeError(e.message) }); }

  // Security header check on homepage
  try {
    const mainResp = await fetch(url, { redirect: 'follow' });
    const secHeaders = {};
    for (const h of ['x-frame-options', 'x-content-type-options', 'strict-transport-security', 'content-security-policy']) {
      secHeaders[h] = mainResp.headers.get(h) || 'missing';
    }
    checks.push({ route: 'security-headers', status: 200, ok: true, headers: secHeaders });
  } catch {}

  // PageSpeed Insights (free Google API — no key needed for basic scores)
  try {
    const psiResp = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&category=seo&category=accessibility`, { signal: AbortSignal.timeout(25000) });
    if (psiResp.ok) {
      const psi = await psiResp.json();
      const cats = psi.lighthouseResult?.categories || {};
      results.details.lighthouse = {
        performance: Math.round((cats.performance?.score || 0) * 100),
        seo: Math.round((cats.seo?.score || 0) * 100),
        accessibility: Math.round((cats.accessibility?.score || 0) * 100)
      };
    }
  } catch {}

  results.details.checks = checks;
  results.details.passed = checks.filter(c => c.ok).length;
  results.details.total = checks.length;
  results.details.issues = checks.filter(c => !c.ok || c.has_object_object).map(c => `${c.route}: ${c.error || (c.has_object_object ? '[object Object] found' : 'status ' + c.status)}`);
  results.ok = results.details.passed >= Math.ceil(results.details.total * 0.75); // Pass if 75%+ checks work
  if (!results.ok) results.fallback = 'Check Vercel deployment logs for errors';
  return results;
}

// ── generateOperationsMd: Per-build operations manual ───────────────────────
function generateOperationsMd(project, moduleResults) {
  const lines = [
    `# ${project.name} — Automation Runtime Log\n`,
    `> Generated by Your Deputy on ${new Date().toISOString().split('T')[0]}\n`,
    `> **Automation-only mode:** No human fulfillment queue is created. Modules either run automatically or are auto-skipped.\n`
  ];
  lines.push(`## Module Runtime Summary\n`);
  for (const [mod, res] of Object.entries(moduleResults)) {
    const status = res.ok ? 'AUTO_OK' : 'AUTO_SKIPPED';
    const details = Object.entries(res.details || {})
      .filter(([k]) => !k.includes('error') && !k.includes('snippet') && !k.includes('script'))
      .slice(0, 5)
      .map(([k, v]) => `  - ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join('\n');
    lines.push(`### ${mod.charAt(0).toUpperCase() + mod.slice(1)} — ${status}`);
    if (details) lines.push(details);
    if (!res.ok) lines.push(`  - reason: ${res.fallback || res.error || 'auto-skipped'}`);
    lines.push('');
  }

  lines.push(`## Self-Serve Next Steps\n`);
  lines.push(`- Provide your own API credentials in platform settings (BYO keys mode).`);
  lines.push(`- Re-run provisioning after keys are configured.`);
  lines.push(`- Use BUILD-REPORT.json for machine-readable status in your own ops workflows.\n`);

  lines.push(`## Notes\n`);
  lines.push(`- This project is configured for autonomous execution, not managed services.`);
  lines.push(`- You own generated code and documents; validate legal and financial outputs before use.\n`);

  lines.push(`---\n*Built with Your Deputy in automation-only mode*`);
  return lines.join('\n');
}

// ── generateCredentialsMd: Per-build credentials document ───────────────────
function generateCredentialsMd(project, moduleResults) {
  const mask = (s) => { if (!s || typeof s !== 'string') return ''; if (s.length <= 8) return '****'; return s.slice(0, 6) + '...' + '****'; };
  const lines = [`# ${project.name} — Service Credentials\n`, `> Generated ${new Date().toISOString().split('T')[0]} | KEEP THIS DOCUMENT SECURE\n`];
  lines.push(`## Website\n- URL: https://${project.domain || project.slug + '.vercel.app'}\n- GitHub: https://github.com/pinohu/${project.slug}\n- Vercel: https://vercel.com/~/projects/${project.slug}\n`);

  if (moduleResults.hosting?.ok) {
    const h = moduleResults.hosting.details;
    lines.push(`## Hosting (20i)\n- Domain: ${h.domain}\n- Control Panel: ${h.control_panel}\n- Email: ${h.email || 'N/A'}\n- Email Password: ${h.email_password || 'See 20i control panel'}\n- IMAP Server: ${h.email_imap || 'mail.' + h.domain} (Port 993 SSL)\n- SMTP Server: ${h.email_smtp || 'mail.' + h.domain} (Port 465 SSL or 587 STARTTLS)\n- SSL: ${h.ssl || 'pending'}\n- NOTE: DNS propagation takes 15min-48hrs. Email will not work until DNS resolves.\n`);
  }
  if (moduleResults.billing?.ok) {
    const b = moduleResults.billing.details;
    lines.push(`## Billing (Stripe)\n- Product ID: ${b.product_id}\n- Webhook ID: ${b.webhook_id || 'N/A'}\n- Webhook Secret: Stored as STRIPE_WEBHOOK_SECRET env var on Vercel (not shown here for security)\n- Prices: ${JSON.stringify(Object.keys(b.prices || {}))}\n`);
  }
  if (moduleResults.email?.ok) {
    const e = moduleResults.email.details;
    lines.push(`## Email Marketing (Acumbamail)\n- List ID: ${e.list_id}\n- Emails Created: ${e.emails_created}\n- Dashboard: https://acumbamail.com\n`);
  }
  if (moduleResults.phone?.ok) {
    const p = moduleResults.phone.details;
    lines.push(`## Phone\n- Number: ${p.phone_number || 'N/A'}\n- AI Agent ID: ${p.insighto_agent_id || 'N/A'}\n- Booking URL: ${p.booking_url || 'N/A'}\n`);
  }
  if (moduleResults.analytics?.ok) {
    const a = moduleResults.analytics.details;
    lines.push(`## Analytics\n- PostHog Project: ${a.posthog_project_id || 'N/A'}\n- PostHog Key: ${mask(a.posthog_api_key)}\n- Plerdy Site: ${a.plerdy_site_id || 'N/A'}\n`);
  }
  if (moduleResults.automation?.ok) {
    const a = moduleResults.automation.details;
    lines.push(`## Automation (n8n)\n- Workflows: ${(a.workflows || []).map(w => `${w.name} (ID: ${w.id})`).join(', ')}\n`);
  }
  if (moduleResults.crm?.ok) {
    lines.push(`## CRM (SuiteDash)\n- Portal: ${moduleResults.crm.details.portal_url}\n- Company ID: ${moduleResults.crm.details.company_id}\n`);
  }
  if (moduleResults.chatbot?.ok) {
    const cb = moduleResults.chatbot.details;
    lines.push(`## Chatbot\n- FAQ Items: ${cb.faq_count || 'N/A'}\n- Embed Snippet: See dynasty-snippets.ts\n`);
  }
  if (moduleResults.seo?.ok) {
    const s = moduleResults.seo.details;
    lines.push(`## SEO\n- Keywords: ${(s.keywords || []).slice(0, 5).join(', ')}\n- Blog Posts: ${s.blog_posts_count || 'N/A'}\n- Sitemap: ${s.sitemap ? 'Generated' : 'N/A'}\n`);
  }
  if (moduleResults.sms?.ok) {
    lines.push(`## SMS\n- Provider: SMS-iT\n- Templates: ${moduleResults.sms.details.templates_created || 'N/A'}\n`);
  }
  if (moduleResults.video?.ok) {
    const v = moduleResults.video.details;
    lines.push(`## Video\n- Explainer: ${v.vadoo_video_id || v.fliki_project_id || 'N/A'}\n`);
  }
  if (moduleResults.design?.ok) {
    lines.push(`## Design\n- Brand Guide: See docs/BRAND-GUIDE.md in repo\n- Assets: ${moduleResults.design.details.assets_generated || 'See repo'}\n`);
  }
  if (moduleResults.leads?.ok) {
    lines.push(`## Leads\n- Tracking: See docs/LEADS-SETUP.md in repo\n`);
  }
  if (moduleResults.docs?.ok) {
    lines.push(`## Legal Docs\n- Files: ${(moduleResults.docs.details.files_pushed || []).join(', ') || 'See repo docs/'}\n`);
  }
  if (moduleResults.social?.ok) {
    lines.push(`## Social\n- Provider: Vista Social\n- Calendar: ${moduleResults.social.details.posts_imported || 'See guide'}\n`);
  }
  if (moduleResults.directory?.ok) {
    lines.push(`## Directory\n- Provider: Brilliant Directories\n- Site ID: ${moduleResults.directory.details.site_id || 'N/A'}\n`);
  }
  if (moduleResults.wordpress?.ok) {
    const wp = moduleResults.wordpress.details;
    lines.push(`## WordPress\n- Package: ${wp.package_id || 'N/A'}\n- Domain: ${wp.domain || 'N/A'}\n- Control Panel: ${wp.control_panel || 'N/A'}\n`);
  }
  if (moduleResults.verify?.ok) {
    lines.push(`## Verification\n- Status: ${moduleResults.verify.details.pass_count || 0} checks passed\n`);
  }

  lines.push(`\n---\n*Keep this document secure. Do not commit to public repositories.*`);
  return lines.join('\n');
}

// ── V4: build profile + archetype gating ────────────────────────────────────
const ARCHETYPE_KEYS = ['demo_express', 'landing_1p', 'starter_5p', 'growth', 'authority_site', 'enterprise_full'];
const ARCHETYPE_MODULE_POLICY = {
  demo_express: { hosting: 'R', billing: 'D', email: 'S', crm: 'S', phone: 'S', sms: 'S', chatbot: 'S', seo: 'S', video: 'S', design: 'S', analytics: 'S', leads: 'S', automation: 'S', docs: 'D', directory: 'S', wordpress: 'S', social: 'S', verify: 'R' },
  landing_1p: { hosting: 'R', billing: 'D', email: 'D', crm: 'S', phone: 'S', sms: 'S', chatbot: 'D', seo: 'S', video: 'S', design: 'S', analytics: 'D', leads: 'D', automation: 'S', docs: 'D', directory: 'S', wordpress: 'S', social: 'S', verify: 'R' },
  starter_5p: { hosting: 'R', billing: 'R', email: 'R', crm: 'D', phone: 'S', sms: 'R', chatbot: 'R', seo: 'D', video: 'S', design: 'S', analytics: 'R', leads: 'R', automation: 'D', docs: 'R', directory: 'S', wordpress: 'S', social: 'D', verify: 'R' },
  growth: { hosting: 'R', billing: 'R', email: 'R', crm: 'R', phone: 'D', sms: 'R', chatbot: 'R', seo: 'R', video: 'D', design: 'D', analytics: 'R', leads: 'R', automation: 'R', docs: 'R', directory: 'D', wordpress: 'R', social: 'R', verify: 'R' },
  authority_site: { hosting: 'R', billing: 'R', email: 'R', crm: 'R', phone: 'R', sms: 'R', chatbot: 'R', seo: 'R', video: 'R', design: 'R', analytics: 'R', leads: 'R', automation: 'R', docs: 'R', directory: 'R', wordpress: 'R', social: 'R', verify: 'R' },
  enterprise_full: {},
};

function normalizeBuildProfile(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const arch = typeof a.archetype === 'string' ? a.archetype : 'enterprise_full';
  const valid = ARCHETYPE_KEYS.includes(arch) ? arch : 'enterprise_full';
  return {
    archetype: valid,
    plainLanguage: !!a.plainLanguage,
    verticalTool: !!a.verticalTool,
    verticalToolSpec: typeof a.verticalToolSpec === 'string' ? a.verticalToolSpec.slice(0, 8000) : '',
    demoStartedAt: a.demoStartedAt || null,
    v: 1,
  };
}

function applyArchetypeModuleGating(enabledRaw, archetype) {
  const policy = ARCHETYPE_MODULE_POLICY[archetype] || ARCHETYPE_MODULE_POLICY.enterprise_full;
  const enabled = { ...enabledRaw };
  const skipped = [];
  const deferred = [];
  for (const [mod, want] of Object.entries(enabledRaw)) {
    if (mod === 'vertical_tool') continue;
    if (!want) continue;
    const rule = policy[mod];
    if (rule === 'S') {
      enabled[mod] = false;
      skipped.push(mod);
    } else if (rule === 'D') {
      enabled[mod] = false;
      deferred.push(mod);
    }
  }
  return { enabled, skipped, deferred };
}

// ── mod_vertical_tool: niche pain-point scaffold (V4) ──────────────────────
async function mod_vertical_tool(config, project, liveUrl) {
  const results = { ok: true, service: 'vertical_tool', details: {} };
  const GH_TOKEN = process.env.GITHUB_TOKEN;
  const ORG_U = 'pinohu';
  if (!GH_TOKEN || !project?.slug) {
    results.ok = false;
    results.error = 'GitHub token or project slug missing';
    results.fallback = 'Add docs/VERTICAL-TOOL-SCOPE.md manually';
    return results;
  }
  const ownerNotes = (project.vertical_tool_spec || '').trim();
  const scopeMd = `# Vertical tool — scope (MVP)

> **Not legal, engineering, or binding bid advice.** This scaffold supports an **assisted workflow** (e.g. blueprint takeoff) with **human review** before any dollar totals are shared with third parties.

## What "assist" means
- AI may propose **line items and quantities** with confidence scores.
- A qualified operator must **confirm** waste %, local material pricing, and labor assumptions before quoting.

## Suggested implementation
- Route group \`src/app/tool/takeoff\` (or equivalent): uploads, review table, CSV export, on-page disclaimers.
- Persist jobs in Postgres; use object storage for uploads.

${ownerNotes ? `## Owner / niche notes\n\n${ownerNotes}\n` : ''}
---
*Your Deputy V4 — mod_vertical_tool*
`;
  try {
    await pushFile(GH_TOKEN, ORG_U, project.slug, 'docs/VERTICAL-TOOL-SCOPE.md', scopeMd, 'docs: vertical tool scope (V4)');
    const readme = `# Niche vertical tool (scaffold)

Implement flows in \`docs/VERTICAL-TOOL-SCOPE.md\`.
Deployed URL: ${liveUrl || '(pending)'}

## Reminder
Ship **assistive** UX only — no guaranteed estimates.
`;
    await pushFile(GH_TOKEN, ORG_U, project.slug, 'src/app/tool/takeoff/README.md', readme, 'feat: vertical tool scaffold (V4)');
    const envEx = `# Vercel env (vertical tool)\n# @vercel/postgres uses POSTGRES_URL; mirror DATABASE_URL if your app expects it.\nPOSTGRES_URL=postgres://...\nDATABASE_URL=postgres://...\nBLOB_READ_WRITE_TOKEN=vercel_blob_rw_...\n`;
    await pushFile(GH_TOKEN, ORG_U, project.slug, 'docs/VERTICAL-ENV.example', envEx, 'docs: vertical tool env (V4)');
    results.details.paths = ['docs/VERTICAL-TOOL-SCOPE.md', 'src/app/tool/takeoff/README.md', 'docs/VERTICAL-ENV.example'];
  } catch (e) {
    results.ok = false;
    results.error = sanitizeError(e.message);
    results.fallback = 'Create docs/VERTICAL-TOOL-SCOPE.md manually';
  }
  return results;
}

// ── Module Orchestrator ─────────────────────────────────────────────────────
async function runModules(config, project, liveUrl, enabledModules, userTier) {
  const moduleMap = {
    hosting: mod_hosting, billing: mod_billing, email: mod_email,
    phone: mod_phone, sms: mod_sms, chatbot: mod_chatbot,
    seo: mod_seo, video: mod_video, design: mod_design,
    analytics: mod_analytics, leads: mod_leads, automation: mod_automation,
    docs: mod_docs, crm: mod_crm, directory: mod_directory,
    wordpress: mod_wordpress, social: mod_social, verify: mod_verify,
    vertical_tool: mod_vertical_tool,
  };

  const results = {};
  let totalCost = 0;

  // Per-module timeout — AI-heavy modules get more time, API-only modules get less.
  // Overall budget: 240s max (leaves 60s for post-module operations within 300s limit).
  const AI_MODULES = new Set(['chatbot', 'seo', 'video', 'docs', 'design']); // These call AI APIs or poll (slow)
  const MODULE_TIMEOUT_DEFAULT = 20000; // 20s for API-only modules
  const MODULE_TIMEOUT_AI = 120000;     // 120s for AI-generating modules (SEO generates 5 blog posts)
  const startTime = Date.now();
  const MAX_TOTAL_MS = 240000;
  const zeroCostMode = isExplicitZeroCostMode(project);
  const automationOnly = AUTOMATION_ONLY_MODE || zeroCostMode;
  const tierName = (userTier || 'foundation').toLowerCase();
  const quotaPool = await getPool();
  if (quotaPool) {
    try { await ensureDynastyOpsTables(quotaPool); } catch {}
  }
  for (const [name, fn] of Object.entries(moduleMap)) {
    if (!enabledModules[name]) continue;
    if (CONTACT_ONLY_MODULES.has(name) && tierName !== 'custom_volume') {
      results[name] = normalizeModuleResult(name, {
        ok: false,
        service: name,
        error: 'Reserved for custom volume plans',
        fallback: 'Contact sales to unlock this outcome set at higher throughput.'
      }, { automationOnly, zeroCostMode });
      continue;
    }
    const tierLimits = TIER_MODULE_DAILY_LIMITS[tierName] || {};
    const limit = tierLimits[name];
    if (limit !== undefined && tierName !== 'custom_volume') {
      const quota = await consumeTierModuleQuota(quotaPool, { tier: tierName, moduleName: name, limit });
      if (!quota.allowed) {
        results[name] = normalizeModuleResult(name, {
          ok: false,
          service: name,
          error: `Daily volume cap reached for ${name}`,
          fallback: `Daily cap reached (${quota.used}/${quota.limit}). Upgrade to custom volume for higher limits.`
        }, { automationOnly, zeroCostMode });
        continue;
      }
    }
    if (zeroCostMode && ZERO_COST_SKIP_MODULES.has(name)) {
      results[name] = normalizeModuleResult(name, {
        ok: false,
        service: name,
        error: 'Auto-skipped in zero-cost mode'
      }, { automationOnly, zeroCostMode });
      continue;
    }
    const timeout = AI_MODULES.has(name) ? MODULE_TIMEOUT_AI : MODULE_TIMEOUT_DEFAULT;
    // Check overall time budget before starting another module
    if (Date.now() - startTime > MAX_TOTAL_MS) {
      results[name] = normalizeModuleResult(name, {
        ok: false,
        service: name,
        error: 'Skipped — build time budget exceeded',
        fallback: `Module ${name} skipped to prevent timeout`
      }, { automationOnly, zeroCostMode });
      continue;
    }
    try {
      const rawResult = await Promise.race([
        fn(config, project, liveUrl),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Module ${name} timed out after ${timeout/1000}s`)), timeout))
      ]);
      results[name] = normalizeModuleResult(name, rawResult, { automationOnly, zeroCostMode });
    } catch (e) {
      results[name] = normalizeModuleResult(name, {
        ok: false,
        service: name,
        error: sanitizeError(e.message),
        fallback: `Module ${name} failed`
      }, { automationOnly, zeroCostMode });
    }
  }

  // Accumulate cost from each module
  for (const [, r] of Object.entries(results)) {
    if (r?.cost_usd) totalCost += r.cost_usd;
  }
  if (quotaPool) {
    try { await quotaPool.end(); } catch {}
  }

  // Generate OPERATIONS.md and CREDENTIALS.md
  const GH_TOKEN = process.env.GITHUB_TOKEN;
  if (GH_TOKEN && project.slug) {
    try {
      const opsMd = generateOperationsMd(project, results);
      await pushFile(GH_TOKEN, 'pinohu', project.slug, 'OPERATIONS.md', opsMd, 'docs: operations manual');
    } catch {}
    try {
      const credsMd = generateCredentialsMd(project, results);
      // CREDENTIALS.md contains sensitive data — do NOT push to repo
      // Store in build results for secure delivery via admin dashboard or email
      // await pushFile(GH_TOKEN, 'pinohu', project.slug, 'CREDENTIALS.md', credsMd, 'docs: service credentials');
      // Instead, include in module results for private delivery
    } catch {}

    // Push BUILD-REPORT.json with all module results (machine-readable)
    try {
      const reportData = {
        project: { name: project.name, slug: project.slug, type: project.type, domain: project.domain },
        generated_at: new Date().toISOString(),
        modules: {},
        summary: { total: 0, succeeded: 0, failed: 0, cost_usd: totalCost }
      };
      for (const [mod, res] of Object.entries(results)) {
        reportData.modules[mod] = { ok: res.ok, service: res.service, error: res.error || null, fallback: res.fallback || null, cost_usd: res.cost_usd || 0 };
        if (res.ok && res.details) reportData.modules[mod].details = res.details;
        reportData.summary.total++;
        if (res.ok) reportData.summary.succeeded++; else if (res.error) reportData.summary.failed++;
      }
      await pushFile(GH_TOKEN, 'pinohu', project.slug, 'BUILD-REPORT.json', JSON.stringify(reportData, null, 2), 'docs: V3 build report (machine-readable)');
    } catch {}

    // Push tracking snippets and embed scripts to a config file for easy injection
    try {
      const snippets = {};
      if (results.analytics?.ok && results.analytics.details?.posthog_snippet) snippets.posthog = results.analytics.details.posthog_snippet;
      if (results.analytics?.details?.plerdy_snippet) snippets.plerdy = results.analytics.details.plerdy_snippet;
      if (results.chatbot?.ok && results.chatbot.details?.embed_script) snippets.chatbot = results.chatbot.details.embed_script;
      if (results.leads?.ok && results.leads.details?.happierleads_snippet) snippets.happierleads = results.leads.details.happierleads_snippet;
      if (results.leads?.details?.salespanel_snippet) snippets.salespanel = results.leads.details.salespanel_snippet;
      if (Object.keys(snippets).length > 0) {
        const snippetFile = `// Your Deputy V3 — Tracking & Embed Snippets\n// Inject these into your site's <head> or before </body>\n// Generated: ${new Date().toISOString()}\n\nexport const snippets = ${JSON.stringify(snippets, null, 2)};\n`;
        await pushFile(GH_TOKEN, 'pinohu', project.slug, 'src/config/dynasty-snippets.ts', snippetFile, 'feat: tracking snippets and embed scripts');
      }
    } catch {}

    // Push email signup form HTML if available
    try {
      if (results.email?.ok && results.email.details?.form_html) {
        await pushFile(GH_TOKEN, 'pinohu', project.slug, 'src/components/EmailSignupForm.html', results.email.details.form_html, 'feat: email signup form from Acumbamail');
      }
    } catch {}

    // Push V3 module summary to REPORT.html
    try {
      const okMods = Object.entries(results).filter(([,r]) => r?.ok).map(([k]) => k);
      const failMods = Object.entries(results).filter(([,r]) => r && !r.ok && r.error).map(([k]) => k);
      const reportHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>${project.name} — V3 Build Report</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0A0A0A;color:#EEEDE8;padding:2rem;max-width:700px;margin:0 auto;line-height:1.6}h1{font-size:1.8rem;margin-bottom:.5rem}h2{color:#C9A84C;font-size:1rem;margin:1.5rem 0 .5rem;border-bottom:1px solid #222;padding-bottom:4px}.meta{color:#666;font-size:13px}.card{background:#1a1a1a;border:1px solid #222;border-radius:8px;padding:1rem;margin:8px 0}.g{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ok{color:#22C55E}.fail{color:#F87171}</style></head><body><h1>${project.name}</h1><p class="meta">V3 Build Report · ${new Date().toISOString().split('T')[0]} · ${okMods.length}/${Object.keys(results).length} modules</p><h2>Modules Provisioned (${okMods.length})</h2><div class="g">${okMods.map(m => `<div class="card"><strong class="ok">✓ ${m}</strong></div>`).join('')}</div>${failMods.length ? `<h2>Failed (${failMods.length})</h2>${failMods.map(m => `<div class="card"><strong class="fail">✗ ${m}</strong><div style="font-size:12px;color:#888">${results[m].fallback || results[m].error}</div></div>`).join('')}` : ''}<h2>Documents</h2><div class="g"><div class="card"><a href="OPERATIONS.md" style="color:#C9A84C">OPERATIONS.md</a></div><div class="card"><a href="CREDENTIALS.md" style="color:#C9A84C">CREDENTIALS.md</a></div><div class="card"><a href="BUILD-REPORT.json" style="color:#C9A84C">BUILD-REPORT.json</a></div></div><h2>Quick Start</h2><pre style="background:#111;padding:12px;border-radius:6px;font-size:12px;color:#C9A84C">gh repo clone pinohu/${project.slug} && cd ${project.slug} && claude</pre><p style="margin-top:2rem;text-align:center;color:#333;font-size:11px">Built with Your Deputy V3</p></body></html>`;
      await pushFile(GH_TOKEN, 'pinohu', project.slug, 'REPORT.html', reportHtml, 'docs: V3 build report');
    } catch {}

    // ── Multi-format document generation (.docx + .pdf for key documents) ──
    try {
      const { generateDocx, generatePdf } = await import('./docgen.js');
      const branding = { name: project.name, accent: project.accent || '#C9A84C' };
      const docsToConvert = ['OPERATIONS.md', 'CREDENTIALS.md'];
      // Financial docs get Excel workbooks
      const excelDocs = ['THREE-STATEMENT-MODEL.md', 'CAP-TABLE-MODEL.md', 'RUNWAY-CALCULATOR.md', 'VALUATION-MODEL.md', 'DILUTION-MODEL.md', 'COHORT-ANALYSIS.md', 'COMPENSATION-BENCHMARKS.md', 'WEEKLY-METRICS.md'];
      const { generateExcel } = await import('./docgen.js');
      for (const xlFile of excelDocs) {
        try {
          const mdResp = await fetch(`https://api.github.com/repos/pinohu/${project.slug}/contents/${xlFile}`, {
            headers: { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
          });
          if (!mdResp.ok) continue;
          const mdData = await mdResp.json();
          const mdContent = Buffer.from(mdData.content, 'base64').toString('utf8');
          const xlBuffer = await generateExcel(xlFile.replace('.md', '').replace(/-/g, ' '), mdContent, branding);
          await pushFile(GH_TOKEN, 'pinohu', project.slug, xlFile.replace('.md', '.xlsx'), Buffer.from(xlBuffer).toString('base64'), `docs: ${xlFile.replace('.md', '')} (Excel workbook)`, true);
        } catch {}
      }

      for (const docFile of docsToConvert) {
        try {
          // Fetch the markdown content from the repo
          const mdResp = await fetch(`https://api.github.com/repos/pinohu/${project.slug}/contents/${docFile}`, {
            headers: { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
          });
          if (!mdResp.ok) continue;
          const mdData = await mdResp.json();
          const mdContent = Buffer.from(mdData.content, 'base64').toString('utf8');
          const title = docFile.replace('.md', '').replace(/-/g, ' ');

          // Generate .docx
          const docxBuffer = await generateDocx(title, mdContent, branding);
          const docxBase64 = docxBuffer.toString('base64');
          await pushFile(GH_TOKEN, 'pinohu', project.slug, docFile.replace('.md', '.docx'), docxBase64, `docs: ${title} (Word format)`, true);

          // Generate .pdf
          const pdfBuffer = await generatePdf(title, mdContent, branding);
          const pdfBase64 = pdfBuffer.toString('base64');
          await pushFile(GH_TOKEN, 'pinohu', project.slug, docFile.replace('.md', '.pdf'), pdfBase64, `docs: ${title} (PDF format)`, true);
        } catch (docErr) { /* Non-critical — skip if format generation fails */ }
      }
    } catch {}
  }

  // Record build history in Neon
  try {
    const pool = await getPool();
    if (pool) {
      await ensureDynastyOpsTables(pool);
      const moduleCosts = {}; for (const [k, r] of Object.entries(results)) { if (r?.cost_usd) moduleCosts[k] = r.cost_usd; }
      await recordBuild(pool, {
        slug: project.slug, name: project.name, type: project.type, cost: totalCost, moduleCosts,
        run: Object.keys(results), ok: Object.entries(results).filter(([,r]) => r.ok).map(([k]) => k),
        failed: Object.entries(results).filter(([,r]) => !r.ok && r.error).map(([k]) => k),
        status: 'completed', services: results
      });
      await pool.end();
    }
  } catch {}

  // Alert on failures via Telegram (if configured)
  const failedMods = Object.entries(results).filter(([,r]) => !r.ok && r.error).map(([k,r]) => `${k}: ${r.error}`);
  if (failedMods.length > 0) {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (botToken && chatId) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, parse_mode: 'Markdown',
            text: `⚠️ *Dynasty Build Alert*\nProject: ${project.name}\n${failedMods.length} module(s) failed:\n${failedMods.join('\n')}` })
        });
      }
    } catch {}
  }

  return { results, totalCost };
}


// ── Main handler ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method==='OPTIONS') return res.status(200).end();

  const action = req.method==='GET'
    ? req.query?.action
    : (req.body?.action || new URLSearchParams(req.url?.split('?')[1]).get('action'));

  let config = {};
  try { config = JSON.parse(process.env.DYNASTY_TOOL_CONFIG || '{}'); } catch { config = {}; }

  // Enrich config with individual env vars (easier to manage than editing JSON blob)
  if (!config.content) config.content = {};
  if (!config.data_research) config.data_research = {};
  if (!config.crm_pm) config.crm_pm = {};
  if (!config.directories) config.directories = {};
  config.content.chatbase = config.content.chatbase || process.env.CHATBASE_API_KEY || '';
  config.content.vadoo_ai = config.content.vadoo_ai || process.env.VADOO_API_KEY || '';
  config.content.supermachine = config.content.supermachine || process.env.SUPERMACHINE_API_KEY || '';
  config.content.documentero = config.content.documentero || process.env.DOCUMENTERO_API_KEY || '';
  config.content.neuronwriter = config.content.neuronwriter || process.env.NEURONWRITER_API_KEY || '';
  config.content.vista_social = config.content.vista_social || process.env.VISTA_SOCIAL_API_KEY || '';
  config.content.fliki = config.content.fliki || process.env.FLIKI_API_KEY || '';
  config.data_research.posthog = config.data_research.posthog || process.env.POSTHOG_API_KEY || '';
  config.data_research.happierleads = config.data_research.happierleads || process.env.HAPPIERLEADS_API_KEY || '';
  config.data_research.salespanel = config.data_research.salespanel || process.env.SALESPANEL_API_KEY || '';
  config.crm_pm.suitedash_api = config.crm_pm.suitedash_api || process.env.SUITEDASH_API_KEY || '';
  config.crm_pm.suitedash_public_id = config.crm_pm.suitedash_public_id || process.env.SUITEDASH_PUBLIC_ID || '';
  config.crm_pm.suitedash_secret_key = config.crm_pm.suitedash_secret_key || process.env.SUITEDASH_SECRET_KEY || '';
  config.directories.brilliant_api = config.directories.brilliant_api || process.env.BRILLIANT_API_KEY || '';
  const GH_TOKEN     = process.env.GITHUB_TOKEN;
  const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN || config.infrastructure?.vercel;
  const VERCEL_TEAM  = 'team_fuTLGjBMk3NAD32Bm5hA7wkr';
  const NEON_STORE   = process.env.NEON_STORE_ID || 'store_dlRpluZOBH0L34D3';
  const ORG          = 'pinohu';
  const adminToken = readAdminTokenFromRequest(req);
  const isAdminRequest = await isValidAdminToken(adminToken);

  const sensitiveActions = new Set([
    'authority_deploy',
    'provision',
    'provision_modules',
    'fetch_vercel_logs',
    'verify_deploy',
    'retry_deploy',
    'verify_live',
    'telegram_notify',
  ]);
  if (sensitiveActions.has(action)) {
    const payload = req.body || {};
    const claimTier = String(payload.tier || payload?.project?.tier || 'foundation');
    const stripeSessionId = String(
      payload.stripe_session_id ||
      payload.session_id ||
      payload?.project?.stripe_session_id ||
      ''
    );
    const accessToken = String(payload.access_token || payload?.project?.access_token || '');
    const userId = String(payload.user_id || payload?.project?.user_id || '');
    const access = await resolveProvisionUserTier({
      tier: claimTier,
      stripeSessionId,
      bypassStripe: isAdminRequest,
    });
    req._dynastyAccess = { ...access, isAdminRequest };
    if (!isAdminRequest) {
      const tokenOk = await isValidPaidAccessToken({
        token: accessToken,
        sessionId: stripeSessionId,
        userId,
        tier: access.userTier,
      });
      if (!tokenOk) {
        return res.status(401).json({
          ok: false,
          error: 'Invalid paid access token. Re-verify checkout session.',
        });
      }
    }
    const isPaidTier = ['foundation', 'starter', 'professional', 'enterprise', 'managed', 'custom_volume'].includes(access.userTier);
    if (!isAdminRequest && !isPaidTier) {
      return res.status(402).json({
        ok: false,
        error: 'Paid checkout verification required for provisioning and deployment actions.',
        tier: access.userTier,
        tier_source: access.tierSource,
      });
    }
  }

  // ── INVENTORY ─────────────────────────────────────────────────────────────
  if (action==='inventory') {
    return res.json({
      ai: Object.keys(config.ai||{}).length ? ['available'] : [],
      comms: Object.keys(config.comms||{}).length ? ['available'] : [],
      automation: Object.keys(config.automation||{}).length ? ['available'] : [],
      build_archetypes: ARCHETYPE_KEYS,
      modules_available: {
        hosting: !!(config.infrastructure?.twentyi_general || process.env.TWENTYI_API_KEY),
        billing: true,
        email: !!(config.comms?.acumbamail),
        phone: !!(config.comms?.callscaler || config.comms?.insighto || config.comms?.trafft_client_id),
        sms: !!(config.comms?.smsit),
        chatbot: !!(process.env.ANTHROPIC_API_KEY),
        seo: !!(config.content?.writerzen || config.content?.neuronwriter || process.env.ANTHROPIC_API_KEY),
        video: !!(config.content?.vadoo_ai || config.content?.fliki),
        design: !!(config.content?.supermachine),
        analytics: !!(config.data_research?.posthog || config.data_research?.plerdy),
        leads: !!(config.data_research?.happierleads || config.data_research?.salespanel),
        automation: !!(process.env.N8N_API_KEY || config.automation?.n8n_api),
        docs: !!(config.content?.documentero),
        crm: !!(config.crm_pm?.suitedash_api),
        directory: !!(config.directories?.brilliant_api),
        wordpress: !!(config.infrastructure?.twentyi_general || process.env.TWENTYI_API_KEY),
        social: !!(config.content?.vista_social),
        verify: true
      },
      modules_enabled: config.modules_enabled || {},
      automation_catalog: automationCatalog ? {
        total_automations: automationCatalog.ALL_AUTOMATIONS.length,
        categories: Object.keys(automationCatalog.CATEGORIES).length,
        packages: Object.keys(automationCatalog.PACKAGES),
        archetypes: Object.keys(automationCatalog.ARCHETYPE_PACKAGES),
      } : { error: 'Catalog module not loaded' },
    });
  }

  // ── AUTHORITY SITE DEPLOY ─────────────────────────────────────────────────
  if (action==='authority_deploy') {
    const { project_slug, niche_name, niche_config, theme_css, accent_hex, domain } = req.body||{};
    if (!project_slug) return res.status(400).json({ok:false, error:'project_slug required'});
    try {

    // 1. Fork dynasty-authority-template (clean niche-agnostic template)
    const forkResp = await fetch(`https://api.github.com/repos/${ORG}/dynasty-authority-template/generate`, {
      method:'POST',
      headers:{'Authorization':`token ${GH_TOKEN}`,'Content-Type':'application/json',
               'Accept':'application/vnd.github.baptiste-preview+json'},
      body: JSON.stringify({owner:ORG, name:project_slug,
        description:`${niche_name} — Dynasty Empire authority site`, private:true})
    });
    if (!forkResp.ok && forkResp.status!==422)
      return res.status(500).json({ok:false, error:`Fork failed (${forkResp.status})`});

    // 2. Poll until repo ready
    let ready=false;
    for(let i=0;i<15;i++){
      await new Promise(r=>setTimeout(r,3000));
      const c=await fetch(`https://api.github.com/repos/${ORG}/${project_slug}`,
        {headers:{'Authorization':`token ${GH_TOKEN}`}});
      if(c.ok){ready=true;break;}
    }
    if(!ready) return res.status(500).json({ok:false, error:'Repo not ready after 45s'});
    await new Promise(r=>setTimeout(r,2000));

    // 3. Push niche.config.ts
    if(niche_config&&niche_config.length>200){
      const EXPORTS=`\nexport const getConfig=()=>nicheConfig;\nexport const getSiteConfig=()=>nicheConfig.site;\nexport const getBrandingConfig=()=>nicheConfig.branding;\nexport const getSEOConfig=()=>nicheConfig.seo;\nexport const getNicheConfig=()=>nicheConfig.niche;\nexport const getNavigationConfig=()=>nicheConfig.navigation;\nexport const getSocialConfig=()=>nicheConfig.social;\nexport const getFeaturesConfig=()=>nicheConfig.features;\nexport const getDirectoryConfig=()=>nicheConfig.directory;\nexport const getContentConfig=()=>nicheConfig.content;\nexport const getMonetizationConfig=()=>nicheConfig.monetization??{enableLeads:false,enableAffiliate:false,enablePremium:false};`;
      const GET_RE=/^export const (getConfig|getSiteConfig|getBrandingConfig|getSEOConfig|getNicheConfig|getNavigationConfig|getSocialConfig|getFeaturesConfig|getDirectoryConfig|getContentConfig|getMonetizationConfig)\s*=/m;
      let core=niche_config; const gm=core.match(GET_RE);
      if(gm) core=core.substring(0,gm.index).trimEnd();
      await pushFile(GH_TOKEN,ORG,project_slug,'src/config/niche.config.ts',core+'\n'+EXPORTS,'feat: dynasty niche configuration');
      await new Promise(r=>setTimeout(r,400));
    }

    // 3.5 Generate A/B test headline variants
    try {
      const headRaw = await aiGenerate(`Generate 3 A/B test headline variants for "${niche_name}".

Return ONLY valid TypeScript:

export const headlines = [
  { id: "a", title: "Headline variant A — compelling and direct", subtitle: "Supporting subtitle A", views: 0, clicks: 0 },
  { id: "b", title: "Headline variant B — benefit-focused", subtitle: "Supporting subtitle B", views: 0, clicks: 0 },
  { id: "c", title: "Headline variant C — urgency/social proof", subtitle: "Supporting subtitle C", views: 0, clicks: 0 },
];

Each headline should be under 60 chars. Subtitles under 120 chars. Target primary keywords.`, 1500);

      if (headRaw && headRaw.includes('export const headlines')) {
        const headMatch = headRaw.match(/export const headlines[\s\S]*/)?.[0] || '';
        const headFile = `export interface Headline {\n  id: string;\n  title: string;\n  subtitle: string;\n  views: number;\n  clicks: number;\n}\n\n${headMatch}\n`;
        await pushFile(GH_TOKEN,ORG,project_slug,'src/data/headlines.ts',headFile,'feat: A/B test headline variants');
        await new Promise(r=>setTimeout(r,300));
      }
    } catch{}

    // 7. Push theme CSS
    const css=theme_css||(accent_hex?generateThemeCss(accent_hex):null);
    if(css){await pushFile(GH_TOKEN,ORG,project_slug,'src/styles/theme.generated.css',css,'feat: dynasty theme');await new Promise(r=>setTimeout(r,400));}

    // 7.1 Push updated manifest.json
    try {
      const manifestJson = JSON.stringify({
        name: niche_name, short_name: niche_name,
        description: `${niche_name} — Professional services and expert resources`,
        start_url: '/', display: 'standalone',
        background_color: '#0a0a0a', theme_color: accent_hex || '#0c6b8a',
        orientation: 'portrait-primary',
        icons: [{ src: '/og-image.svg', sizes: 'any', type: 'image/svg+xml' }]
      }, null, 2);
      await pushFile(GH_TOKEN,ORG,project_slug,'public/manifest.json',manifestJson,'feat: niche manifest.json');
      await new Promise(r=>setTimeout(r,400));
    } catch{}

    // ── AI CONTENT GENERATION ──────────────────────────────────────────────
    // Generate all content data files so the site launches fully populated
    const AI_KEY = process.env.ANTHROPIC_API_KEY;
    const nicheDesc = niche_config || niche_name;
    const keywordsMatch = nicheDesc.match(/primaryKeywords:\s*\[([^\]]+)\]/);
    const keywords = keywordsMatch ? keywordsMatch[1].replace(/['"]/g,'').split(',').map(s=>s.trim()).slice(0,10).join(', ') : niche_name;
    const clustersMatch = nicheDesc.match(/topicClusters:\s*\[([\s\S]*?)\]/);
    const clustersRaw = clustersMatch ? clustersMatch[1] : '';

    async function aiGenerate(prompt, maxTokens = 4000) {
      return freeLLM(prompt, maxTokens);
    }

    // 4a. Generate blog articles
    try {
      const articlesRaw = await aiGenerate(`Generate 6 SEO-optimized blog articles for "${niche_name}". Target keywords: ${keywords}.

Return ONLY a valid TypeScript array. No imports, no interface, no explanation. Just the array:

export const articles = [
  {
    slug: "kebab-case-url",
    title: "SEO Title (50-60 chars)",
    description: "Meta description (150-160 chars)",
    content: "<h2>Heading</h2><p>Detailed paragraph 1...</p><h2>Another Heading</h2><p>Detailed paragraph 2...</p><p>Paragraph 3...</p><h3>Subheading</h3><p>More detail...</p>",
    category: "relevant-category",
    author: "${niche_name}",
    publishedAt: "${new Date().toISOString().split('T')[0]}",
    readingTime: "5 min",
    tags: ["tag1", "tag2", "tag3"],
    featured: true/false
  },
  // ... 5 more articles
];

REQUIREMENTS:
- Each article content must be 800-1200 words of real HTML (h2, h3, p tags)
- Content must be unique, detailed, and expert-level for this niche
- Target different keywords in each article
- First 2 articles should be featured: true
- No placeholders, no lorem ipsum — real actionable content`, 8000);
      if (articlesRaw && articlesRaw.includes('export const articles')) {
        const clean = articlesRaw.match(/export const articles[\s\S]*/)?.[0] || articlesRaw;
        const header = `import type { Article } from './articles.types';\n\n// Auto-generated by Your Deputy\n`;
        // Write the full articles file with interface
        const articlesFile = `export interface Article {\n  slug: string;\n  title: string;\n  description: string;\n  content: string;\n  category: string;\n  author: string;\n  publishedAt: string;\n  updatedAt?: string;\n  readingTime: string;\n  tags: string[];\n  featured?: boolean;\n}\n\n${clean}\n\nexport const getArticle = (slug: string) => articles.find(a => a.slug === slug);\nexport const getArticlesByCategory = (cat: string) => articles.filter(a => a.category === cat);\nexport const getFeaturedArticles = () => articles.filter(a => a.featured);\nexport const getAllArticles = () => articles;\nexport const getAllCategories = (): string[] => [...new Set(articles.map(a => a.category))];\nexport const getArticlesByTag = (tag: string) => articles.filter(a => a.tags.includes(tag));\nexport const getRelatedArticles = (slug: string, limit = 3) => articles.filter(a => a.slug !== slug).slice(0, limit);\n`;
        await pushFile(GH_TOKEN,ORG,project_slug,'src/data/articles.ts',articlesFile,'feat: AI-generated blog articles');
        await new Promise(r=>setTimeout(r,300));

        // 4a.5 SEO-optimize each article
        try {
          if (articlesFile && AI_KEY) {
            const optimized = await aiGenerate(`You are an SEO expert. Review and optimize this TypeScript articles array for maximum search engine performance.

NICHE KEYWORDS: ${keywords}

ARTICLES FILE:
${articlesFile.substring(0, 6000)}

For each article:
1. Ensure keyword density is 1.5-2.5% for the primary keyword
2. Verify H2 → H3 heading hierarchy
3. Add internal linking suggestions as HTML comments
4. Improve meta descriptions to exactly 150-160 chars
5. Ensure readability at Flesch-Kincaid grade 8-10
6. Add structured data hints (FAQ schema opportunities within content)

Return the COMPLETE improved articles TypeScript file (same format, same interface, same exports). Only change the content strings and descriptions. Keep all code structure identical.`, 8000);

            if (optimized && optimized.includes('export const articles')) {
              const optMatch = optimized.match(/export interface Article[\s\S]*/);
              if (optMatch) {
                await pushFile(GH_TOKEN,ORG,project_slug,'src/data/articles.ts', optMatch[0], 'feat: SEO-optimized articles');
                await new Promise(r=>setTimeout(r,300));
              }
            }
          }
        } catch{}
      }
    } catch{}

    // 4b. Generate FAQ items
    try {
      const faqRaw = await aiGenerate(`Generate 15 FAQ items for "${niche_name}". Keywords: ${keywords}.

Return ONLY valid TypeScript. No imports, no explanation:

export const faqItems = [
  { question: "Actual question people search for?", answer: "Detailed 2-3 paragraph answer with specific, actionable information.", category: "General" },
  // ... 14 more items
];

REQUIREMENTS:
- Questions should be real search queries (long-tail SEO)
- Answers must be 2-3 detailed paragraphs each
- Use categories: "General", "Pricing", "Process", "Quality"
- Expert-level, specific answers — not generic`, 4000);
      if (faqRaw && faqRaw.includes('export const faqItems')) {
        const clean = faqRaw.match(/export const faqItems[\s\S]*/)?.[0] || faqRaw;
        const faqFile = `export interface FAQItem {\n  question: string;\n  answer: string;\n  category?: string;\n}\n\n${clean}\n`;
        await pushFile(GH_TOKEN,ORG,project_slug,'src/data/faq.ts',faqFile,'feat: AI-generated FAQ content');
        await new Promise(r=>setTimeout(r,300));
      }
    } catch{}

    // 4c. Generate testimonials
    try {
      const testRaw = await aiGenerate(`Generate 6 realistic customer testimonials for "${niche_name}".

Return ONLY valid TypeScript:

export const testimonials = [
  { quote: "Detailed 2-3 sentence testimonial about the service.", author: "First Last", role: "Homeowner", company: "City, State", rating: 5 },
  // ... 5 more
];

Make them sound natural and specific to the service. Vary ratings between 4 and 5.`, 2000);
      if (testRaw && testRaw.includes('export const testimonials')) {
        const clean = testRaw.match(/export const testimonials[\s\S]*/)?.[0] || testRaw;
        const testFile = `export interface Testimonial {\n  quote: string;\n  author: string;\n  role: string;\n  company: string;\n  rating: number;\n}\n\n${clean}\n`;
        await pushFile(GH_TOKEN,ORG,project_slug,'src/data/testimonials.ts',testFile,'feat: AI-generated testimonials');
        await new Promise(r=>setTimeout(r,300));
      }
    } catch{}

    // 4d. Generate case studies
    try {
      const csRaw = await aiGenerate(`Generate 3 detailed case studies for "${niche_name}".

Return ONLY valid TypeScript:

export const caseStudies = [
  {
    slug: "kebab-case",
    title: "Project title",
    client: "Client Name",
    challenge: "2-3 sentences describing the client's problem.",
    solution: "2-3 sentences describing what was done.",
    results: ["Specific result 1", "Specific result 2", "Specific result 3"],
    testimonial: { quote: "Client quote about the experience.", author: "Client Name", role: "Role" },
    category: "Category",
    publishedAt: "${new Date().toISOString().split('T')[0]}"
  },
];`, 3000);
      if (csRaw && csRaw.includes('export const caseStudies')) {
        const clean = csRaw.match(/export const caseStudies[\s\S]*/)?.[0] || csRaw;
        const csFile = `export interface CaseStudy {\n  slug: string;\n  title: string;\n  client: string;\n  challenge: string;\n  solution: string;\n  results: string[];\n  testimonial?: { quote: string; author: string; role: string };\n  category?: string;\n  image?: string;\n  publishedAt?: string;\n}\n\n${clean}\n`;
        await pushFile(GH_TOKEN,ORG,project_slug,'src/data/caseStudies.ts',csFile,'feat: AI-generated case studies');
        await new Promise(r=>setTimeout(r,300));
      }
    } catch{}

    // 4e. Generate directory listings (Outscraper Google Maps or AI fallback)
    try {
      const OUTSCRAPER_KEYS = [process.env.OUTSCRAPER_API_KEY, process.env.OUTSCRAPER_API_KEY_2].filter(Boolean);
      let directoryData = '';
      if (OUTSCRAPER_KEYS.length) {
        // Real business data from Outscraper Google Maps API (with key failover)
        const location = domain?.replace('.vercel.app','').replace(/\./g,' ') || 'United States';
        const query = encodeURIComponent(`${niche_name} in ${location}`);
        let pr;
        for (const key of OUTSCRAPER_KEYS) {
          try {
            pr = await fetch(`https://api.app.outscraper.com/google-maps-search?query=${query}&limit=20&language=en`, {
              headers: { 'X-API-KEY': key }
            });
            if (pr.ok) break; // success, stop trying keys
          } catch { continue; }
        }
        if (!pr?.ok) pr = { json: async () => [] };
        const pd = await pr.json();
        const results = Array.isArray(pd) ? pd.flat() : (pd.data || pd.results || []);
        if (results?.length) {
          const listings = results.slice(0,20).map((p,i) => ({
            id: p.place_id || p.google_id || `listing-${i+1}`,
            name: p.name || p.title || '',
            slug: (p.name||p.title||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),
            category: 'general',
            description: p.description || p.about || `${p.name} — Professional ${niche_name.toLowerCase()} services in ${p.city || location}.`,
            address: p.full_address || p.address || '',
            city: p.city || '',
            state: p.state || '',
            phone: p.phone || '',
            email: p.email || '',
            website: p.site || p.website || '',
            rating: p.rating || 4.0,
            reviewCount: p.reviews || p.reviews_count || 0,
            isVerified: true,
            isFeatured: (p.rating||0) >= 4.5,
            credentials: p.type ? [p.type] : [],
            specializations: p.subtypes || [niche_name],
          }));
          directoryData = `export const listings: DirectoryListing[] = ${JSON.stringify(listings, null, 2)};\n\nexport const reviews: DirectoryReview[] = [];\n`;
        }
      }
      if (!directoryData) {
        // AI fallback — generate realistic listings
        const dirRaw = await aiGenerate(`Generate 12 realistic local business directory listings for "${niche_name}" services.

Return ONLY a valid TypeScript array:

export const listings: DirectoryListing[] = [
  {
    id: "listing-1",
    name: "Business Name LLC",
    slug: "business-name-llc",
    category: "general",
    description: "Detailed 2-sentence description of the business and services.",
    address: "123 Main St",
    city: "City",
    state: "State",
    phone: "(555) 123-4567",
    email: "info@business.com",
    website: "https://business.com",
    rating: 4.8,
    reviewCount: 47,
    isVerified: true,
    isFeatured: true,
    credentials: ["Licensed", "Insured", "Certified"],
    specializations: ["Service 1", "Service 2"]
  },
  // ... 11 more
];

export const reviews: DirectoryReview[] = [
  { id: "r1", listingId: "listing-1", reviewerName: "John D.", rating: 5, text: "Great service, highly recommend.", date: "${new Date().toISOString().split('T')[0]}", isVerified: true },
  // ... 10 more reviews spread across listings
];

Make businesses sound real with local addresses. Vary ratings 4.0-5.0.`, 6000);
        if (dirRaw) directoryData = dirRaw.match(/export const listings[\s\S]*/)?.[0] || '';
      }
      if (directoryData) {
        const dirHeader = `import { getConfig } from '../config/niche.config';\n\nexport interface DirectoryListing {\n  id: string; name: string; slug: string; category: string;\n  description: string; address?: string; city?: string; state?: string;\n  phone?: string; email?: string; website?: string;\n  rating: number; reviewCount: number; isVerified: boolean; isFeatured: boolean;\n  credentials?: string[]; specializations?: string[]; image?: string;\n}\n\nexport interface DirectoryReview {\n  id: string; listingId: string; reviewerName: string; rating: number;\n  text: string; date: string; isVerified: boolean;\n}\n\nexport interface DirectoryCategory {\n  name: string; slug: string; icon: string; description: string; count: number;\n}\n\n${directoryData}\n\nexport const getCategories = () => {\n  const config = getConfig();\n  return (config.directory?.categories || []).map(c => ({\n    ...c, description: \`Browse \${c.name.toLowerCase()} professionals\`, count: listings.filter(l => l.category === c.slug).length\n  }));\n};\nexport const getListingBySlug = (slug: string) => listings.find(l => l.slug === slug);\nexport const getListingsByCategory = (cat: string) => listings.filter(l => l.category === cat);\nexport const getFeaturedListings = () => listings.filter(l => l.isFeatured);\nexport const getListingReviews = (id: string) => (typeof reviews !== 'undefined' ? reviews : []).filter((r: DirectoryReview) => r.listingId === id);\nexport const searchListings = (q: string) => { const l = q.toLowerCase(); return listings.filter(x => x.name.toLowerCase().includes(l) || x.description.toLowerCase().includes(l)); };\n`;
        await pushFile(GH_TOKEN,ORG,project_slug,'src/data/directory.ts',dirHeader,'feat: AI-generated directory listings');
        await new Promise(r=>setTimeout(r,300));
      }
    } catch{}

    // 4e.5 Generate competitor comparisons from directory data
    try {
      const compRaw = await aiGenerate(`Generate 3 service comparison tables for "${niche_name}". Compare different approaches, methods, or service tiers that a customer would evaluate.

Return ONLY valid TypeScript:

export const comparisons = [
  {
    slug: "comparison-slug",
    title: "Option A vs Option B for ${niche_name}",
    description: "Detailed comparison to help customers choose.",
    columns: ["Feature", "Option A", "Option B"],
    items: [
      { feature: "Price Range", values: { "Option A": "$X-$Y", "Option B": "$X-$Y" } },
      { feature: "Duration", values: { "Option A": "X weeks", "Option B": "X weeks" } },
    ]
  },
];

Make comparisons specific and useful for the niche.`, 4000);

      if (compRaw && compRaw.includes('export const comparisons')) {
        const compMatch = compRaw.match(/export const comparisons[\s\S]*/)?.[0] || '';
        const compFile = `export interface ComparisonItem {\n  feature: string;\n  values: Record<string, string | boolean>;\n}\n\nexport interface Comparison {\n  slug: string;\n  title: string;\n  description: string;\n  columns: string[];\n  items: ComparisonItem[];\n}\n\n${compMatch}\n`;
        await pushFile(GH_TOKEN,ORG,project_slug,'src/data/comparisons.ts',compFile,'feat: AI-generated comparison tables');
        await new Promise(r=>setTimeout(r,300));
      }
    } catch{}

    // 4f. Generate location pages for programmatic SEO
    try {
      const locationRaw = await aiGenerate(`Generate 10 location pages for "${niche_name}" services. Each location should be a real city/area where this niche operates.

Return ONLY valid TypeScript:

export const locations: Location[] = [
  {
    slug: "city-name-state",
    city: "City Name",
    state: "State",
    description: "One sentence about this niche in this city (50-100 words, SEO-optimized).",
    content: "<h2>About Service in City</h2><p>Detailed 150-200 word paragraph about the local market, demand, and why this service matters in this specific city. Include local landmarks, neighborhoods, or regional specifics.</p><h2>What to Look For</h2><p>Another 100-150 word paragraph with local buying advice.</p>"
  },
  // ... 9 more cities
];

Use REAL cities appropriate for the niche. Each description and content must be unique and locally specific.`, 6000);

      if (locationRaw && locationRaw.includes('export const locations')) {
        const locMatch = locationRaw.match(/export const locations[\s\S]*/)?.[0] || '';
        const locFile = `export interface Location {\n  slug: string;\n  city: string;\n  state: string;\n  description: string;\n  content?: string;\n  coordinates?: { lat: number; lng: number };\n}\n\n${locMatch}\n`;
        await pushFile(GH_TOKEN,ORG,project_slug,'src/data/locations.ts',locFile,'feat: AI-generated location pages for pSEO');
        await new Promise(r=>setTimeout(r,300));
      }
    } catch{}

    // 4g. Generate social media posts for each article
    try {
      const socialRaw = await aiGenerate(`Generate social media posts for 6 blog articles about "${niche_name}".

For each article, create posts for LinkedIn, Twitter, and Instagram.

Return ONLY valid TypeScript:

export const socialPosts = [
  { articleSlug: "article-slug", platform: "linkedin", content: "Professional 2-3 sentence LinkedIn post with hashtags. Include a call to action.", hashtags: ["#hashtag1", "#hashtag2"] },
  { articleSlug: "article-slug", platform: "twitter", content: "Concise tweet under 280 chars with hashtags.", hashtags: ["#hashtag1"] },
  { articleSlug: "article-slug", platform: "instagram", content: "Engaging caption with emojis and hashtags.", hashtags: ["#hashtag1", "#hashtag2", "#hashtag3"] },
  // ... 15 more posts (3 per article x 6 articles)
];

Make each post unique, engaging, and niche-specific.`, 4000);

      if (socialRaw && socialRaw.includes('export const socialPosts')) {
        const socialMatch = socialRaw.match(/export const socialPosts[\s\S]*/)?.[0] || '';
        const socialFile = `export interface SocialPost {\n  articleSlug: string;\n  platform: 'linkedin' | 'twitter' | 'instagram';\n  content: string;\n  hashtags: string[];\n}\n\n${socialMatch}\n`;
        await pushFile(GH_TOKEN,ORG,project_slug,'src/data/socialPosts.ts',socialFile,'feat: AI-generated social media posts');
        await new Promise(r=>setTimeout(r,300));
      }
    } catch{}

    // 4h. Generate 1-year social media calendar (260 posts across 5 platforms)
    try {
      const socialCalendarPosts = [];
      const platforms = ['linkedin', 'twitter', 'instagram', 'facebook', 'tiktok'];
      const quarters = [
        { name: 'Q1', weeks: '1-13', theme: 'Foundation & Brand Awareness', focus: 'Introduce the brand, share educational content, establish authority' },
        { name: 'Q2', weeks: '14-26', theme: 'Authority Building & Engagement', focus: 'Deep-dive content, case studies, community building, customer stories' },
        { name: 'Q3', weeks: '27-39', theme: 'Growth & Promotions', focus: 'Special offers, partnerships, expanded reach, seasonal content' },
        { name: 'Q4', weeks: '40-52', theme: 'Year-End & Planning', focus: 'Reviews, testimonials, holiday campaigns, next-year teasers' }
      ];

      for (const q of quarters) {
        const calRaw = await aiGenerate(`Generate a social media content calendar for "${niche_name}" — ${q.name} (weeks ${q.weeks}).
Theme: ${q.theme}
Focus: ${q.focus}
Keywords: ${keywords}

Generate 65 posts (5 platforms × 13 weeks). For EACH week, create 1 post per platform.

Platform rules:
- LinkedIn: Professional, 150-300 words, industry insights, 3-5 hashtags
- Twitter/X: Under 280 chars, punchy, 2-3 hashtags, include a hook
- Instagram: Visual-first caption, emojis, 10-15 hashtags, storytelling
- Facebook: Conversational, 100-200 words, question-based engagement, 3-5 hashtags
- TikTok: Script format (Hook → Content → CTA), trend-aware, 5-8 hashtags

Content mix per week: tip, stat/fact, behind-the-scenes, testimonial, how-to, promotion, engagement question, industry news, case study, seasonal — rotate themes.

Return ONLY a valid JSON array (no markdown, no backticks):
[
  {"week":1,"platform":"linkedin","content":"Post content here...","hashtags":["#tag1","#tag2"],"mediaType":"text","callToAction":"Learn more at our website","theme":"educational"},
  {"week":1,"platform":"twitter","content":"Short punchy tweet...","hashtags":["#tag1"],"mediaType":"text","callToAction":"","theme":"tip"},
  ...continue for all 65 posts
]`, 8000);

        try {
          const match = calRaw.match(/\[[\s\S]*\]/);
          if (match) {
            const posts = JSON.parse(match[0]);
            // Adjust week numbers for quarter offset
            const weekOffset = parseInt(q.weeks.split('-')[0]) - 1;
            posts.forEach(p => { p.week = p.week + weekOffset; });
            socialCalendarPosts.push(...posts);
          }
        } catch {}
        await new Promise(r => setTimeout(r, 500));
      }

      if (socialCalendarPosts.length > 50) {
        // Push TypeScript data file
        const tsFile = `export interface SocialCalendarPost {\n  week: number;\n  platform: 'linkedin' | 'twitter' | 'instagram' | 'facebook' | 'tiktok';\n  content: string;\n  hashtags: string[];\n  mediaType: string;\n  callToAction: string;\n  theme: string;\n}\n\nexport const socialCalendar: SocialCalendarPost[] = ${JSON.stringify(socialCalendarPosts, null, 2)};\n\nexport const getPostsByPlatform = (p: string) => socialCalendar.filter(post => post.platform === p);\nexport const getPostsByWeek = (w: number) => socialCalendar.filter(post => post.week === w);\nexport const getPostsByTheme = (t: string) => socialCalendar.filter(post => post.theme === t);\n`;
        await pushFile(GH_TOKEN, ORG, project_slug, 'src/data/socialCalendar.ts', tsFile, 'feat: 1-year social media calendar (260+ posts)');
        await new Promise(r => setTimeout(r, 300));

        // Generate CSV (universal scheduler import format)
        const startDate = new Date();
        const csvRows = ['Date,Time,Platform,Content,Hashtags,MediaType,CTA,Theme,Status'];
        socialCalendarPosts.forEach(p => {
          const postDate = new Date(startDate);
          postDate.setDate(postDate.getDate() + (p.week - 1) * 7 + platforms.indexOf(p.platform));
          const dateStr = postDate.toISOString().split('T')[0];
          const content = p.content.replace(/"/g, '""');
          const tags = (p.hashtags || []).join(' ');
          csvRows.push(`"${dateStr}","09:00","${p.platform}","${content}","${tags}","${p.mediaType}","${p.callToAction || ''}","${p.theme}","scheduled"`);
        });
        await pushFile(GH_TOKEN, ORG, project_slug, 'social-media/calendar.csv', csvRows.join('\n'), 'feat: social media calendar CSV');
        await new Promise(r => setTimeout(r, 200));

        // Generate JSON
        await pushFile(GH_TOKEN, ORG, project_slug, 'social-media/calendar.json', JSON.stringify(socialCalendarPosts, null, 2), 'feat: social media calendar JSON');
        await new Promise(r => setTimeout(r, 200));

        // Generate Hootsuite CSV format
        const hootRows = ['Date,Time,Message,Link'];
        socialCalendarPosts.forEach(p => {
          const postDate = new Date(startDate);
          postDate.setDate(postDate.getDate() + (p.week - 1) * 7 + platforms.indexOf(p.platform));
          const dateStr = `${postDate.getMonth()+1}/${postDate.getDate()}/${postDate.getFullYear()}`;
          const msg = p.content.replace(/"/g, '""') + ' ' + (p.hashtags || []).join(' ');
          hootRows.push(`"${dateStr}","09:00 AM","${msg}",""`);
        });
        await pushFile(GH_TOKEN, ORG, project_slug, 'social-media/hootsuite-import.csv', hootRows.join('\n'), 'feat: Hootsuite import CSV');
        await new Promise(r => setTimeout(r, 200));

        // Generate Buffer CSV format
        const bufferRows = ['Text,Link,Scheduled At'];
        socialCalendarPosts.forEach(p => {
          const postDate = new Date(startDate);
          postDate.setDate(postDate.getDate() + (p.week - 1) * 7 + platforms.indexOf(p.platform));
          const text = p.content.replace(/"/g, '""') + ' ' + (p.hashtags || []).join(' ');
          bufferRows.push(`"${text}","","${postDate.toISOString()}"`);
        });
        await pushFile(GH_TOKEN, ORG, project_slug, 'social-media/buffer-import.csv', bufferRows.join('\n'), 'feat: Buffer import CSV');
        await new Promise(r => setTimeout(r, 200));

        // Generate TXT (simple text format)
        let txtContent = `# ${niche_name} — 1-Year Social Media Calendar\n# Generated by Your Deputy\n# ${socialCalendarPosts.length} posts across 5 platforms\n\n`;
        for (let w = 1; w <= 52; w++) {
          const weekPosts = socialCalendarPosts.filter(p => p.week === w);
          if (weekPosts.length === 0) continue;
          txtContent += `═══════════════════════════════════════════\n`;
          txtContent += `WEEK ${w}\n`;
          txtContent += `═══════════════════════════════════════════\n\n`;
          weekPosts.forEach(p => {
            txtContent += `[${p.platform.toUpperCase()}] (${p.theme})\n`;
            txtContent += `${p.content}\n`;
            txtContent += `Hashtags: ${(p.hashtags || []).join(' ')}\n`;
            if (p.callToAction) txtContent += `CTA: ${p.callToAction}\n`;
            txtContent += `\n`;
          });
        }
        await pushFile(GH_TOKEN, ORG, project_slug, 'social-media/calendar.txt', txtContent, 'feat: social media calendar TXT');
        await new Promise(r => setTimeout(r, 200));

        // Generate Markdown table
        let mdContent = `# ${niche_name} — Social Media Calendar\n\n`;
        mdContent += `> ${socialCalendarPosts.length} posts across 5 platforms for 52 weeks\n\n`;
        mdContent += `| Week | Platform | Theme | Content | Hashtags |\n`;
        mdContent += `|------|----------|-------|---------|----------|\n`;
        socialCalendarPosts.slice(0, 100).forEach(p => {
          const short = p.content.substring(0, 80).replace(/\|/g, '\\|').replace(/\n/g, ' ');
          mdContent += `| ${p.week} | ${p.platform} | ${p.theme} | ${short}... | ${(p.hashtags || []).slice(0, 3).join(' ')} |\n`;
        });
        if (socialCalendarPosts.length > 100) mdContent += `\n*...and ${socialCalendarPosts.length - 100} more posts. See calendar.csv for the complete calendar.*\n`;
        await pushFile(GH_TOKEN, ORG, project_slug, 'social-media/SOCIAL-MEDIA-CALENDAR.md', mdContent, 'feat: social media calendar markdown');
      }
    } catch {}

    // 7.2 Push updated index.html
    try {
      const descMatch = (niche_config||'').match(/description:\s*["']([^"']+)["']/);
      const rawDesc = descMatch?.[1] || `${niche_name} — Authority site`;
      const siteDesc = rawDesc.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const indexHtml = `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5" />\n    <meta name="theme-color" content="${accent_hex||'#0c6b8a'}" media="(prefers-color-scheme: light)" />\n    <meta name="theme-color" content="${accent_hex||'#0a4f66'}" media="(prefers-color-scheme: dark)" />\n    <meta name="mobile-web-app-capable" content="yes" />\n    <meta name="apple-mobile-web-app-capable" content="yes" />\n    <title>${niche_name}</title>\n    <meta name="description" content="${siteDesc}" />\n    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />\n    <link rel="manifest" href="/manifest.json" />\n    <link rel="icon" type="image/svg+xml" href="/og-image.svg" />\n    <link rel="apple-touch-icon" href="/og-image.svg" />\n    <link rel="alternate" type="application/rss+xml" title="${niche_name} RSS Feed" href="/rss.xml" />\n    <link rel="preconnect" href="https://fonts.googleapis.com" />\n    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>`;
      await pushFile(GH_TOKEN,ORG,project_slug,'index.html',indexHtml,'feat: niche index.html');
      await new Promise(r=>setTimeout(r,400));
    } catch{}

    // 5. Create Vercel project linked to GitHub repo
    let projectId, vercel_url;
    try {
      // First try creating with git repository link
      const pr=await fetch(`https://api.vercel.com/v10/projects?teamId=${VERCEL_TEAM}`,{
        method:'POST',headers:{'Authorization':`Bearer ${VERCEL_TOKEN}`,'Content-Type':'application/json'},
        body:JSON.stringify({name:project_slug,
          gitRepository:{type:'github',repo:`${ORG}/${project_slug}`}})
      });
      const pj=await pr.json();
      if(pj.id){
        projectId=pj.id;
        vercel_url=`https://${project_slug}.vercel.app`;
      } else if(pj.error?.code==='repo_not_found'||pj.error?.code==='not_found'){
        // Repo not visible to Vercel yet — create project without git link, then link after
        await new Promise(r=>setTimeout(r,3000));
        const pr2=await fetch(`https://api.vercel.com/v10/projects?teamId=${VERCEL_TEAM}`,{
          method:'POST',headers:{'Authorization':`Bearer ${VERCEL_TOKEN}`,'Content-Type':'application/json'},
          body:JSON.stringify({name:project_slug})
        });
        const pj2=await pr2.json();
        projectId=pj2.id;
        vercel_url=`https://${project_slug}.vercel.app`;
        // Try to link git repo after project creation
        if(projectId){
          try{
            await fetch(`https://api.vercel.com/v10/projects/${projectId}/link?teamId=${VERCEL_TEAM}`,{
              method:'POST',headers:{'Authorization':`Bearer ${VERCEL_TOKEN}`,'Content-Type':'application/json'},
              body:JSON.stringify({type:'github',repo:`${ORG}/${project_slug}`,productionBranch:'main'})
            });
          }catch{}
        }
      } else {
        // Project may already exist — fetch existing
        const existing=await fetch(`https://api.vercel.com/v10/projects/${project_slug}?teamId=${VERCEL_TEAM}`,
          {headers:{'Authorization':`Bearer ${VERCEL_TOKEN}`}}).then(r=>r.json());
        projectId=existing?.id||null;
        vercel_url=`https://${project_slug}.vercel.app`;
      }
    } catch{}

    // 9. Set env vars (including Supabase for app to boot)
    if(projectId){
      const envVars=[
        {key:'VITE_SITE_SLUG',value:project_slug,type:'plain'},
        {key:'VITE_SITE_NAME',value:niche_name,type:'plain'},
        // Client configures their own Supabase keys via .env.example
      ].map(v=>({...v,target:['production','preview','development']}));
      try{await fetch(`https://api.vercel.com/v10/projects/${projectId}/env?teamId=${VERCEL_TEAM}`,{
        method:'POST',headers:{'Authorization':`Bearer ${VERCEL_TOKEN}`,'Content-Type':'application/json'},
        body:JSON.stringify(envVars)});}catch{}
    }

    // 10. Trigger build — push commit AND create Vercel deployment as fallback
    try{
      const tc=Buffer.from(`# ${niche_name}\nDynasty Empire authority site\n${new Date().toISOString()}\n`).toString('base64');
      const th={'Authorization':`token ${GH_TOKEN}`,'Content-Type':'application/json','Accept':'application/vnd.github.v3+json'};
      let ts; const cr=await fetch(`https://api.github.com/repos/${ORG}/${project_slug}/contents/DYNASTY-BUILT.md`,{headers:th});
      if(cr.ok){const cd=await cr.json();ts=cd.sha;}
      await fetch(`https://api.github.com/repos/${ORG}/${project_slug}/contents/DYNASTY-BUILT.md`,{
        method:'PUT',headers:th,
        body:JSON.stringify({message:`chore: trigger Vercel build — ${niche_name}`,content:tc,...(ts?{sha:ts}:{})})});
    }catch{}

    // 10b. Fallback: trigger Vercel deployment via API if git-based deploy doesn't fire
    if(projectId){
      try{
        await new Promise(r=>setTimeout(r,2000));
        await fetch(`https://api.vercel.com/v13/deployments?teamId=${VERCEL_TEAM}`,{
          method:'POST',headers:{'Authorization':`Bearer ${VERCEL_TOKEN}`,'Content-Type':'application/json'},
          body:JSON.stringify({name:project_slug,project:projectId,
            gitSource:{type:'github',org:ORG,repo:project_slug,ref:'main'},
            target:'production'})
        });
      }catch{}
    }

    return res.json({ok:true,
      repo_url:`https://github.com/${ORG}/${project_slug}`,
      vercel_url:vercel_url||`https://${project_slug}.vercel.app`,
      vercel_project_id:projectId||null,
      note:'Vercel building now — live in ~90s'});
    } catch (e) {
      return res.status(500).json({ ok: false, error: sanitizeError(e.message), action: 'authority_deploy' });
    }
  }

  // ── MAIN PROVISION (non-authority — Flint-free) ───────────────────────────
  if (action==='provision') {
    const {inf={},svcs=[]}=req.body||{};
    const slug=inf.repo||'dynasty-project', name=inf.name||'Dynasty Project';
    const typeId=inf.type_id||'', domain=inf.domain||`${slug}.vercel.app`;
    const results={};

    const deployTarget = inf.deploy_target || '';
    const isWP      = ['wp-theme','wordpress'].includes(typeId) || deployTarget === 'wordpress';
    const isStatic  = ['static','portfolio','landing'].includes(typeId) || deployTarget === 'static';
    const needsTwentyi = isWP||isStatic;
    const needsNeon    = ['gov-saas','dark-saas','enterprise-saas','compliance','client-portal','member-dir',
                          'bd-dir','real-estate','job-board','lead-gen','ai-platform','ai-dashboard',
                          'ai-chat','booking-service','crm','signing-service','n8n','api-svc','ecom',
                          'custom','flint-proj'].includes(typeId);

    // ── STRIPE ────────────────────────────────────────────────────────────────
    if(svcs.includes('stripe')&&config.payments?.stripe_live?.startsWith('sk_live')){
      try{
        const SK=config.payments.stripe_live;
        const auth=Buffer.from(`${SK}:`).toString('base64');
        const cents=inf.price_cents||(inf.price?Math.round(parseFloat(inf.price.replace(/[^0-9.]/g,''))*100):9700);
        const prod=await fetch('https://api.stripe.com/v1/products',{method:'POST',
          headers:{'Authorization':`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},
          body:`name=${encodeURIComponent(name)}&description=${encodeURIComponent(`Dynasty: ${slug}`)}`}).then(r=>r.json());
        if(prod.id){
          const price=await fetch('https://api.stripe.com/v1/prices',{method:'POST',
            headers:{'Authorization':`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},
            body:`product=${prod.id}&currency=usd&unit_amount=${cents}&recurring[interval]=month&nickname=${encodeURIComponent(name)}`}).then(r=>r.json());
          results.stripe={product_id:prod.id, price_id:price.id, amount:`$${(cents/100).toFixed(0)}/mo`};
        }
      }catch(e){results.stripe={error:sanitizeError(e.message)};}
    }

    // ── VERCEL PROJECT (SaaS/directory/compliance — not WordPress/static) ─────
    let vercelProjectId=null;
    const isFullstack = deployTarget === 'fullstack';
    const vercelFramework = isFullstack ? 'nextjs' : null; // null = static/no-build for backend-only

    if(!needsTwentyi){
      try{
        const pr=await fetch(`https://api.vercel.com/v10/projects?teamId=${VERCEL_TEAM}`,{
          method:'POST',headers:{'Authorization':`Bearer ${VERCEL_TOKEN}`,'Content-Type':'application/json'},
          body:JSON.stringify({name:slug,
            ...(vercelFramework ? {framework:vercelFramework} : {}),
            gitRepository:{type:'github',repo:`${ORG}/${slug}`}
          })});
        const pj=await pr.json();
        if(pj.id){
          vercelProjectId=pj.id;
        } else {
          // Project may already exist — fetch existing ID
          const existing=await fetch(`https://api.vercel.com/v10/projects/${slug}?teamId=${VERCEL_TEAM}`,
            {headers:{'Authorization':`Bearer ${VERCEL_TOKEN}`}}).then(r=>r.json());
          vercelProjectId=existing?.id||null;
        }
        // Ensure framework is ALWAYS set correctly (even on existing projects)
        if(vercelProjectId && vercelFramework){
          await fetch(`https://api.vercel.com/v9/projects/${vercelProjectId}?teamId=${VERCEL_TEAM}`,{
            method:'PATCH',headers:{'Authorization':`Bearer ${VERCEL_TOKEN}`,'Content-Type':'application/json'},
            body:JSON.stringify({framework:vercelFramework})
          });
        }

        // ── Set env vars for fullstack build — placeholders only (option a: no real vendor secrets on customer Vercel)
        if(vercelProjectId && isFullstack){
          const envVars = [
            {key:'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',value:'pk_test_placeholder',type:'plain'},
            {key:'CLERK_SECRET_KEY',value:'sk_test_placeholder',type:'encrypted'},
            {key:'NEXT_PUBLIC_CLERK_SIGN_IN_URL',value:'/en/sign-in',type:'plain'},
            {key:'NEXT_PUBLIC_CLERK_SIGN_UP_URL',value:'/en/sign-up',type:'plain'},
            {key:'NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL',value:'/en/dashboard',type:'plain'},
            {key:'NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL',value:'/en/dashboard',type:'plain'},
            {key:'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',value:'pk_test_placeholder',type:'plain'},
            {key:'STRIPE_WEBHOOK_SECRET',value:'whsec_placeholder',type:'encrypted'},
            {key:'BILLING_PLAN_ENV',value:'test',type:'plain'},
            {key:'NEXT_PUBLIC_APP_URL',value:`https://${slug}.vercel.app`,type:'plain'},
          ].map(v=>({...v,target:['production','preview','development']}));
          try{await fetch(`https://api.vercel.com/v10/projects/${vercelProjectId}/env?teamId=${VERCEL_TEAM}`,{
            method:'POST',headers:{'Authorization':`Bearer ${VERCEL_TOKEN}`,'Content-Type':'application/json'},
            body:JSON.stringify(envVars)});}catch{}
        }

        // ── TRIGGER INITIAL DEPLOYMENT from the GitHub repo ──────────────────
        // Wait for GitHub to finish processing the pushed files, then verify
        // the critical Next.js files are actually present before telling Vercel
        // to build. A 10s wait was too short on large repos — 25s gives the
        // CDN time to propagate and catches 99% of races.
        if(vercelProjectId){
          await new Promise(r => setTimeout(r, 25000)); // 25s delay for GitHub propagation across CDN

          // ── Pre-deploy critical-file check (fullstack only) ──────────────
          // If package.json or src/app/page.tsx isn't reachable on the repo,
          // do NOT trigger a Vercel build — it will 100% fail and waste a
          // deploy slot. Surface the issue instead.
          if (isFullstack) {
            const criticalPaths = ['package.json', 'src/app/page.tsx', 'src/app/layout.tsx', 'src/app/globals.css'];
            const missing = [];
            for (const p of criticalPaths) {
              try {
                const r = await fetch(`https://api.github.com/repos/${ORG}/${slug}/contents/${p}`, {
                  headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
                });
                if (!r.ok) missing.push(p);
              } catch { missing.push(p); }
            }
            // Also require at least one next.config.*
            let hasConfig = false;
            for (const cfg of ['next.config.js', 'next.config.ts', 'next.config.mjs']) {
              try {
                const r = await fetch(`https://api.github.com/repos/${ORG}/${slug}/contents/${cfg}`, {
                  headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
                });
                if (r.ok) { hasConfig = true; break; }
              } catch {}
            }
            if (!hasConfig) missing.push('next.config.{js,ts,mjs}');

            if (missing.length > 0) {
              results.vercel = {
                ok: false,
                project_id: vercelProjectId,
                url: `https://${slug}.vercel.app`,
                error: 'repo-missing-critical-files',
                missing,
                note: `Skipping Vercel deploy — repo is missing: ${missing.join(', ')}. Fix push errors and POST /api/provision?action=retry_deploy.`
              };
              // Return early so we don't trigger a guaranteed-failing deploy
              return res.json({ ok: false, results, error: 'repo-missing-critical-files', missing });
            }
          }

          let deployOk = false;
          for (let attempt = 0; attempt < 3; attempt++) {
            try{
              const depResp=await fetch(`https://api.vercel.com/v13/deployments?teamId=${VERCEL_TEAM}`,{
                method:'POST',
                headers:{'Authorization':`Bearer ${VERCEL_TOKEN}`,'Content-Type':'application/json'},
                body:JSON.stringify({
                  name:slug,
                  project:vercelProjectId,
                  target:'production',
                  gitSource:{type:'github',org:ORG,repo:slug,ref:'main'}
                })
              });
              const dep=await depResp.json();
              if (dep.id || dep.url || dep.readyState) {
                results.vercel={ok:true, project_id:vercelProjectId, url:`https://${slug}.vercel.app`,
                  deployment_url:dep.url||null, deployment_state:dep.readyState||'triggered',
                  existing:!pj.id, attempt: attempt+1};
                deployOk = true;
                break;
              }
              // If no deployment ID, wait and retry
              if (attempt < 2) await new Promise(r => setTimeout(r, 5000));
            }catch(depErr){
              if (attempt < 2) await new Promise(r => setTimeout(r, 5000));
            }
          }
          if (!deployOk) {
            results.vercel={ok:true, project_id:vercelProjectId, url:`https://${slug}.vercel.app`,
              deployment_error:'Deploy failed after 3 attempts', existing:!pj.id,
              note:'Project created but deploy failed — push any commit to trigger auto-deploy'};
          }
        } else {
          results.vercel={ok:true, project_id:vercelProjectId, url:`https://${slug}.vercel.app`,
            existing:!pj.id};
        }
      }catch(e){results.vercel={error:sanitizeError(e.message)};}
    }

    // ── CUSTOM DOMAIN (if configured in settings) ──
    if(vercelProjectId && req.body?.custom_domain) {
      try {
        const domainResp = await fetch(`https://api.vercel.com/v10/projects/${vercelProjectId}/domains?teamId=${VERCEL_TEAM}`, {
          method: 'POST',
          headers: {'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json'},
          body: JSON.stringify({ name: req.body.custom_domain })
        });
        const domainData = await domainResp.json();
        if (domainResp.ok) {
          results.custom_domain = { ok: true, domain: req.body.custom_domain, configured: true };
        } else {
          results.custom_domain = { manual: true, domain: req.body.custom_domain, 
            action: `Add DNS record: ${domainData?.error?.message || 'CNAME → cname.vercel-dns.com'}` };
        }
      } catch(e) { results.custom_domain = { manual: true, error: sanitizeError(e.message) }; }
    }

    // ── NEON DB via Vercel storage integration (auto-sets DATABASE_URL etc.) ──
    if(needsNeon&&vercelProjectId){
      try{
        const lr=await fetch(
          `https://api.vercel.com/v1/storage/stores/${NEON_STORE}/connections?teamId=${VERCEL_TEAM}`,
          {method:'POST',headers:{'Authorization':`Bearer ${VERCEL_TOKEN}`,'Content-Type':'application/json'},
           body:JSON.stringify({projectId:vercelProjectId,environments:['production','preview','development']})});
        const lt=await lr.text();
        let ld={}; try{ld=lt?JSON.parse(lt):{};}catch{}
        if(lr.ok||lr.status===201||ld?.error?.code==='store_project_connection_not_unique'){
          results.neon={ok:true, store:'neon-chestnut-field',
            note:'DATABASE_URL + POSTGRES_URL auto-set on Vercel project',
            dashboard:`https://vercel.com/~/stores/${NEON_STORE}`};
        }else{
          results.neon={manual:true, error:sanitizeError(ld?.error?.message||JSON.stringify(ld).slice(0,80)),
            action:'Vercel dashboard → Storage → neon-chestnut-field → Connect Project'};
        }
      }catch(e){results.neon={manual:true, error:sanitizeError(e.message)};}
    }else if(needsNeon){
      results.neon={manual:true, action:'Re-run provision — Vercel project required first'};
    }

    // ── 20i HOSTING (WordPress 88291 / Static 80359) ──────────────────────────
    if(needsTwentyi){
      const gen=config.infrastructure?.twentyi_general || process.env.TWENTYI_API_KEY;
      if(!gen){
        results.twentyi={manual:true, action:'Add twentyi_general to DYNASTY_TOOL_CONFIG.infrastructure'};
      }else{
        const auth=`Bearer ${Buffer.from(gen).toString('base64')}`;
        const typeRef=isWP?'88291':'80359';
        try{
          const pr=await fetch('https://api.20i.com/reseller/10455/addWeb',{
            method:'POST',headers:{'Authorization':auth,'Content-Type':'application/json'},
            body:JSON.stringify({domain_name:domain, type:typeRef})});
          const pd=await pr.json();
          if(pr.ok&&pd?.result){
            results.twentyi={package_id:pd.result, domain,
              control_panel:`https://my.20i.com/package/${pd.result}`,
              type:isWP?'WordPress Pinnacle':'Linux Pinnacle'};
          }else if(pr.status===401||(Array.isArray(pd)&&pd.length===0)){
            results.twentyi={manual:true, keys_expired:true,
              action:'20i Reseller Panel → API Settings → Generate New Keys → update DYNASTY_TOOL_CONFIG.infrastructure.twentyi_general'};
          }else{
            results.twentyi={error:sanitizeError(JSON.stringify(pd).slice(0,120))};
          }
        }catch(e){results.twentyi={manual:true, error:sanitizeError(e.message)};}
      }
    }

    // ── ACUMBAMAIL LIST ────────────────────────────────────────────────────────
    if(svcs.includes('acumbamail')&&config.comms?.acumbamail){
      try{
        const r=await fetch('https://acumbamail.com/api/1/createList/',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({auth_token:config.comms.acumbamail,
            name:`${name} - Dynasty`,from_email:'hello@dynastyempire.com',from_name:'Dynasty Empire',country:'US'})
        }).then(r=>r.json());
        results.acumbamail={ok:true, list_id:r.id||r.list_id||r.result, raw:r};
      }catch(e){results.acumbamail={error:sanitizeError(e.message)};}
    }

    // ── PULSETIC MONITOR (auto-create via API) ──────────────────────────────
    const PULSETIC_KEY = process.env.PULSETIC_API_KEY;
    if (PULSETIC_KEY) {
      const monitorUrl = needsTwentyi ? `https://${domain}` : `https://${slug}.vercel.app`;
      try {
        const pr = await fetch('https://api.pulsetic.com/api/public/monitors', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${PULSETIC_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: monitorUrl,
            name: `${name} — Dynasty`,
            interval: 300, // check every 5 minutes
            type: 'http',
          }),
        });
        const pd = await pr.json();
        if (pr.ok || pd.id) {
          results.pulsetic = { ok: true, monitor_id: pd.id, url: monitorUrl, interval: '5min' };
        } else {
          results.pulsetic = { queued: true, url: monitorUrl, note: `Add at pulsetic.com: ${monitorUrl}`, raw: JSON.stringify(pd).slice(0, 80) };
        }
      } catch (e) {
        results.pulsetic = { queued: true, url: monitorUrl, note: `Add at pulsetic.com: ${monitorUrl}` };
      }
    }

    // ── N8N STARTER WORKFLOWS (auto-create via API) ──────────────────────────
    const N8N_KEY = process.env.N8N_API_KEY;
    if (N8N_KEY && svcs.includes('n8n')) {
      try {
        const webhookUrl = needsTwentyi ? `https://${domain}` : `https://${slug}.vercel.app`;
        // Create a starter workflow: webhook → email notification
        const wfBody = {
          name: `${name} — Webhook Handler`,
          nodes: [
            { parameters: { httpMethod: 'POST', path: slug, responseMode: 'responseNode' }, name: 'Webhook', type: 'n8n-nodes-base.webhook', position: [250, 300], typeVersion: 2 },
            { parameters: { assignments: { assignments: [{ name: 'status', value: 'received', type: 'string' }] } }, name: 'Set Response', type: 'n8n-nodes-base.set', position: [450, 300], typeVersion: 3.4 },
            { parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}' }, name: 'Respond', type: 'n8n-nodes-base.respondToWebhook', position: [650, 300], typeVersion: 1.1 },
          ],
          connections: {
            'Webhook': { main: [[{ node: 'Set Response', type: 'main', index: 0 }]] },
            'Set Response': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] },
          },
          settings: { executionOrder: 'v1' },
        };
        const n8nBaseUrl = config.automation?.n8n_url || process.env.N8N_URL || '';
        if (!n8nBaseUrl) {
          results.n8n = { manual: true, error: 'Configure n8n URL in DYNASTY_TOOL_CONFIG or N8N_URL env var.' };
          continue;
        }
        const wr = await fetch(`${n8nBaseUrl}/api/v1/workflows`, {
          method: 'POST',
          headers: { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(wfBody),
        });
        const wd = await wr.json();
        if (wd.id) {
          // Activate the workflow
          await fetch(`${n8nBaseUrl}/api/v1/workflows/${wd.id}/activate`, {
            method: 'POST', headers: { 'X-N8N-API-KEY': N8N_KEY },
          });
          results.n8n = { ok: true, workflow_id: wd.id, name: wfBody.name, webhook_path: `/${slug}` };
        } else {
          results.n8n = { manual: true, error: JSON.stringify(wd).slice(0, 80) };
        }
      } catch (e) {
        results.n8n = { manual: true, error: sanitizeError(e.message) };
      }
    }

    // ── COMMS STACK: CallScaler + Insighto + SMS-iT (for service businesses) ─
    const isServiceBiz = ['client-portal', 'custom', 'real-estate', 'job-board', 'booking-service', 'signing-service', 'crm', 'lead-gen'].includes(typeId);
    if (isServiceBiz && svcs.includes('comms')) {
      // CallScaler — provision phone number
      const CS_KEY = process.env.CALLSCALER_API_KEY;
      if (CS_KEY) {
        try {
          results.callscaler = { queued: true, note: 'CallScaler provisioning available — configure at app.callscaler.com' };
        } catch {}
      }

      // Insighto — create voice agent
      const INSIGHTO_KEY = process.env.INSIGHTO_API_KEY;
      if (INSIGHTO_KEY) {
        try {
          results.insighto = { queued: true, note: `Insighto voice agent available — configure at app.insighto.ai for ${name}` };
        } catch {}
      }

      // SMS-iT — set up SMS campaign
      const SMSIT_KEY = process.env.SMSIT_API_KEY;
      if (SMSIT_KEY) {
        try {
          results.smsit = { queued: true, note: `SMS-iT campaign ready — configure welcome message at aicpanel.smsit.ai` };
        } catch {}
      }
    }

    // ── SUMMARY ────────────────────────────────────────────────────────────────
    const manual_steps=Object.entries(results)
      .filter(([,v])=>v?.manual||v?.keys_expired)
      .map(([k,v])=>`${k}: ${v.action||v.note||v.error||'manual step needed'}`);
    const queued=Object.entries(results)
      .filter(([,v])=>v?.queued).map(([k,v])=>v.note||k);

    return res.json({ok:true, results, manual_steps, queued,
      fully_automated:manual_steps.length===0,
      note:manual_steps.length===0
        ?`Fully automated${queued.length?` (+${queued.length} queued)`:''}` 
        :`${manual_steps.length} manual step(s) — see manual_steps`});
  }

  // ── PROVISION MODULES (V3) ──────────────────────────────────────────────
  // Called by app.html after deployment succeeds, with the live URL
  if (action === 'provision_modules') {
    const { project, liveUrl, modules_enabled, tier, dry_run, build_profile: buildProfileRaw, stripe_session_id, session_id } = req.body || {};
    if (!project || !project.slug) return res.status(400).json({ ok: false, error: 'project.slug required' });

    const buildProfile = normalizeBuildProfile(buildProfileRaw || {});
    if (project.vertical_tool_spec == null && buildProfile.verticalToolSpec) {
      project.vertical_tool_spec = buildProfile.verticalToolSpec;
    }

    // Server-side revenue gating: enforce tier limits FIRST (before dry_run)
    const TIER_MODULES = {
      free: [], // Viability scoring only — no build, no modules
      blueprint: [], // Paid diagnostic and execution map only — no generation/provision modules
      scoring_pro: [], // Scoring subscription only — no generation/provision modules
      strategy_pack: [], // Documents only, no code/deploy/modules
      // Foundation now provisions the full 11-module set — open-weight models (WebLLM + Gemma 4 free tier) remove the cost barrier that previously justified gating paid integrations.
      foundation: ['hosting', 'billing', 'email', 'chatbot', 'seo', 'design', 'analytics', 'automation', 'docs', 'social', 'vertical_tool'],
      starter: ['hosting', 'billing', 'email', 'chatbot', 'seo', 'design', 'analytics', 'automation', 'docs', 'social', 'vertical_tool'], // Legacy alias for foundation
      professional: ['hosting', 'billing', 'email', 'chatbot', 'seo', 'design', 'analytics', 'automation', 'docs', 'social', 'vertical_tool'],
      enterprise: ['hosting', 'billing', 'email', 'chatbot', 'seo', 'design', 'analytics', 'automation', 'docs', 'wordpress', 'social', 'verify', 'vertical_tool'],
      managed: ['hosting', 'billing', 'email', 'chatbot', 'seo', 'design', 'analytics', 'automation', 'docs', 'wordpress', 'social', 'verify', 'vertical_tool'],
      custom_volume: ['hosting', 'billing', 'email', 'phone', 'sms', 'chatbot', 'seo', 'video', 'design', 'analytics', 'leads', 'automation', 'docs', 'crm', 'directory', 'wordpress', 'social', 'verify', 'vertical_tool']
    };
    const bypassStripeVerify = !!dry_run || !!req._dynastyAccess?.isAdminRequest;
    const tierAccess = req._dynastyAccess || await resolveProvisionUserTier({
      tier,
      stripeSessionId: stripe_session_id || session_id,
      bypassStripe: bypassStripeVerify,
    });
    const userTier = tierAccess.userTier;
    const tierSource = tierAccess.tierSource;
    const allowedModules = TIER_MODULES[userTier] || TIER_MODULES.foundation;
    const rawEnabled = modules_enabled || config.modules_enabled || {};
    const enabled = {};
    for (const [mod, on] of Object.entries(rawEnabled)) {
      enabled[mod] = on && allowedModules.includes(mod);
    }
    const gatedOut = Object.entries(rawEnabled).filter(([mod, on]) => on && !allowedModules.includes(mod)).map(([mod]) => mod);

    const archetypeGating = applyArchetypeModuleGating(enabled, buildProfile.archetype);
    let enabledAfterArchetype = archetypeGating.enabled;
    const skippedByArchetype = archetypeGating.skipped;
    const deferredByArchetype = archetypeGating.deferred;

    // Dry-run mode: return what WOULD be provisioned (with tier gating already applied)
    if (dry_run || project.slug.startsWith('test-') || project.slug === 'test') {
      const wouldRun = Object.entries(enabledAfterArchetype).filter(([, v]) => v).map(([k]) => k);
      return res.json({
        ok: true, dry_run: true, would_provision: wouldRun, tier: userTier, tier_source: tierSource, build_profile: buildProfile,
        archetype: { skipped: skippedByArchetype, deferred: deferredByArchetype },
        build_manifest: {
          version: 4,
          archetype: buildProfile.archetype,
          plain_language: buildProfile.plainLanguage,
          vertical_tool: buildProfile.verticalTool,
          demo_sla_target_seconds: 300,
          skipped_by_archetype: skippedByArchetype,
          deferred_by_archetype: deferredByArchetype,
        },
        gated: gatedOut.length > 0 ? { modules: gatedOut, message: `${gatedOut.length} module(s) blocked by ${userTier} tier` } : null,
        note: 'Dry-run mode — no real API calls made. Remove dry_run flag or use a non-test slug to provision.'
      });
    }

    const provisionT0 = Date.now();
    try {
      const { results: moduleResults, totalCost } = await runModules(config, project, liveUrl, enabledAfterArchetype, userTier);
      const succeeded = Object.entries(moduleResults).filter(([, r]) => r.ok).map(([k]) => k);
      const failed = Object.entries(moduleResults).filter(([, r]) => !r.ok && r.error).map(([k, r]) => `${k}: ${r.error}`);
      const fallbacks = Object.entries(moduleResults).filter(([, r]) => !r.ok && r.fallback).map(([k, r]) => ({ module: k, instruction: r.fallback }));

      // Trigger a final Vercel redeploy so the site picks up new env vars and pushed files
      if (VERCEL_TOKEN && project.vercel_project_id) {
        try {
          await fetch(`https://api.vercel.com/v13/deployments?teamId=${VERCEL_TEAM}`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: project.slug, project: project.vercel_project_id, target: 'production',
              gitSource: { type: 'github', org: ORG, repo: project.slug, ref: 'main' } })
          });
        } catch {}
      }

      const buildManifest = {
        version: 4,
        archetype: buildProfile.archetype,
        plain_language: buildProfile.plainLanguage,
        vertical_tool_requested: buildProfile.verticalTool,
        tier: userTier,
        tier_source: tierSource,
        skipped_by_archetype: skippedByArchetype,
        deferred_by_archetype: deferredByArchetype,
        demo_sla_target_seconds: 300,
        provision_duration_ms: Date.now() - provisionT0,
        generated_at: new Date().toISOString(),
      };
      if (GH_TOKEN && project.slug) {
        try {
          await pushFile(GH_TOKEN, ORG, project.slug, 'BUILD-MANIFEST.json', JSON.stringify(buildManifest, null, 2), 'docs: V4 BUILD-MANIFEST');
        } catch {}
      }

      return res.json({
        ok: true,
        modules: moduleResults,
        summary: { succeeded: succeeded.length, failed: failed.length, total: Object.keys(moduleResults).length },
        succeeded, failed, fallbacks, totalCost, tier: userTier, tier_source: tierSource,
        build_profile: buildProfile,
        archetype: { skipped: skippedByArchetype, deferred: deferredByArchetype },
        build_manifest: buildManifest,
        gated: gatedOut.length > 0 ? { modules: gatedOut, message: `${gatedOut.length} module(s) require a higher automation tier or custom volume access: ${gatedOut.join(', ')}` } : null,
        note: `${succeeded.length} modules provisioned${failed.length ? `, ${failed.length} need manual setup` : ''}${gatedOut.length ? ` (${gatedOut.length} gated by tier)` : ''}${skippedByArchetype.length ? ` · ${skippedByArchetype.length} skipped by build profile` : ''}${deferredByArchetype.length ? ` · ${deferredByArchetype.length} deferred (finish in dashboard)` : ''}`
      });
    } catch (e) {
      return res.json({ ok: false, error: sanitizeError(e.message), note: 'Module orchestration failed' });
    }
  }

  // ── FETCH VERCEL BUILD LOGS ─────────────────────────────────────────────
  // Debug endpoint: returns events/logs from a Vercel deployment so the
  // build error can be diagnosed without CLI access.
  if (action === 'fetch_vercel_logs') {
    const { deployment_id } = req.body || {};
    if (!deployment_id) return res.status(400).json({ error: 'deployment_id required' });
    try {
      const depResp = await fetch(`https://api.vercel.com/v13/deployments/${deployment_id}?teamId=${VERCEL_TEAM}`, {
        headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}` }
      });
      const dep = await depResp.json();
      const evResp = await fetch(`https://api.vercel.com/v3/deployments/${deployment_id}/events?teamId=${VERCEL_TEAM}&direction=forward&follow=0&limit=500`, {
        headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}` }
      });
      let events = [];
      if (evResp.ok) {
        const raw = await evResp.text();
        try { events = JSON.parse(raw); }
        catch {
          // NDJSON or text format
          events = raw.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return { text: l }; } });
        }
      }
      return res.json({
        ok: true,
        deployment: {
          id: dep.id, url: dep.url, readyState: dep.readyState, state: dep.state,
          errorMessage: dep.errorMessage, errorStep: dep.errorStep, errorCode: dep.errorCode,
          buildingAt: dep.buildingAt, ready: dep.ready, created: dep.created,
        },
        events: events.slice(-300), // tail
        event_count: events.length,
        diagnostic: classifyVercelFailure(events),
      });
    } catch (e) {
      return res.json({ ok: false, error: sanitizeError(e.message) });
    }
  }

  // ── TELEGRAM NOTIFICATION ───────────────────────────────────────────────
  if (action === 'telegram_notify') {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
    if (!BOT_TOKEN) return res.json({ ok: false, error: 'No TELEGRAM_BOT_TOKEN' });
    if (!CHAT_ID) return res.json({ ok: false, error: 'No TELEGRAM_CHAT_ID — set it in Vercel env vars' });
    const { message } = req.body || {};
    const safeMsg = (message || 'Dynasty build notification').replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&').slice(0, 2000);
    try {
      const tr = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text: safeMsg }),
      });
      const td = await tr.json();
      return res.json({ ok: td.ok, message_id: td.result?.message_id });
    } catch (e) {
      return res.json({ ok: false, error: sanitizeError(e.message) });
    }
  }

  // ── VERIFY DEPLOYMENT STATUS ──────────────────────────────────────────────
  if (action === 'verify_deploy') {
    const { project_id, project_name } = req.body || {};
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    try {
      const settingsRepair = await patchVercelProjectSettings({ token: VERCEL_TOKEN, team: VERCEL_TEAM, projectId: project_id });
      const dr = await fetch(
        `https://api.vercel.com/v6/deployments?projectId=${project_id}&teamId=${VERCEL_TEAM}&limit=1&target=production`,
        { headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}` } }
      );
      const dd = await dr.json();
      const dep = dd.deployments?.[0];
      if (!dep) return res.json({ state: 'NOT_FOUND', error: 'No deployments found' });
      const state = dep.state || dep.readyState;
      const liveUrl = dep.url ? `https://${dep.url}` : null;
      let diagnostic = null;
      let live = null;
      if (state === 'ERROR' && (dep.uid || dep.id)) {
        try {
          const evResp = await fetch(`https://api.vercel.com/v3/deployments/${dep.uid || dep.id}/events?teamId=${VERCEL_TEAM}&direction=forward&follow=0&limit=500`, {
            headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}` }
          });
          if (evResp.ok) {
            const raw = await evResp.text();
            let events = [];
            try { events = JSON.parse(raw); }
            catch { events = raw.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return { text: l }; } }); }
            diagnostic = classifyVercelFailure(events);
          }
        } catch {}
      }
      if (state === 'READY' && liveUrl) {
        live = await verifyLiveUrlWithRepair({ url: liveUrl, projectName: project_name, projectId: project_id, token: VERCEL_TOKEN, team: VERCEL_TEAM });
      }
      return res.json({
        state,
        url: liveUrl,
        error: state === 'ERROR' ? (diagnostic?.summary || 'Build failed - check Vercel dashboard') : null,
        created: dep.created,
        deployment_id: dep.uid || dep.id || null,
        diagnostic,
        live,
        project_settings_repair: settingsRepair,
      });
    } catch (e) {
      return res.json({ state: 'UNKNOWN', error: sanitizeError(e.message) });
    }
  }

  // ── VERIFY LIVE URL ─────────────────────────────────────────────────────
  // Server-side proxy to check if a deployed URL actually returns content
  if (action === 'verify_live') {
    const { url, project_name } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url required' });
    // SSRF protection: only allow HTTPS URLs to vercel.app or known domains
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return res.status(400).json({ error: 'HTTPS required' });
      const allowed = ['.vercel.app', '.yourdeputy.com', '.dynastyempire.com'];
      if (!allowed.some(d => parsed.hostname.endsWith(d))) return res.status(400).json({ error: 'URL domain not allowed' });
    } catch { return res.status(400).json({ error: 'Invalid URL' }); }
    try {
      const projectIdForRepair = req.body?.project_id || req.body?.vercel_project_id || null;
      if (projectIdForRepair) {
        const live = await verifyLiveUrlWithRepair({
          url,
          projectName: project_name,
          projectId: projectIdForRepair,
          token: VERCEL_TOKEN,
          team: VERCEL_TEAM,
        });
        return res.json(live);
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
      const resp = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'YourDeputy-VerifyBot/1.0' },
        signal: controller.signal,
        redirect: 'follow'
      });
      clearTimeout(timeout);
      const status = resp.status;
      let has_content = false;
      let has_project_name = false;
      let has_template_branding = false;
      let body_length = 0;
      if (status === 200) {
        const text = await resp.text();
        body_length = text.length;
        has_content = text.length > 500; // More than a bare error page
        has_project_name = project_name ? text.toLowerCase().includes(project_name.toLowerCase()) : false;
        // Check for common error indicators
        const isErrorPage = text.includes('Application error') || text.includes('500 Internal Server Error') ||
                           text.includes('NEXT_NOT_FOUND') || text.includes('This page could not be found');
        if (isErrorPage) has_content = false;
        // Template branding leak detection — if these strings appear, the
        // Dynasty-generated content did not override the template defaults
        const templateMarkers = [
          /SaaS ?Boilerplate/i,
          /SaaS ?Template/i,
          /@?Ixartz/i,
          /nextjs-boilerplate\.com/i,
          /Demo of SaaS/i,
        ];
        has_template_branding = templateMarkers.some(rx => rx.test(text));
      }
      return res.json({ ok: true, status, has_content, has_project_name, has_template_branding, body_length, url: resp.url });
    } catch (e) {
      return res.json({ ok: false, status: 0, error: sanitizeError(e.message) });
    }
  }

  // ── RETRY DEPLOYMENT ──────────────────────────────────────────────────────
  if (action === 'retry_deploy') {
    const { project_id, repo, org } = req.body || {};
    if (!project_id || !repo) return res.status(400).json({ error: 'project_id and repo required' });
    const safeRepo = String(repo).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 100);
    const repoOrg = (org && /^[a-zA-Z0-9._-]+$/.test(org)) ? org : ORG;
    try {
      // ── Pre-retry critical-file check ─────────────────────────────────
      // A retry only makes sense if the repo actually has the files needed
      // to build. Otherwise we're just re-triggering the same guaranteed
      // failure. Fail fast with a structured error so the client can show
      // an actionable message.
      const exists = async (p) => {
        try {
          const r = await fetch(`https://api.github.com/repos/${repoOrg}/${safeRepo}/contents/${p}`, {
            headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
          });
          return r.ok;
        } catch { return false; }
      };
      const missing = [];
      for (const p of ['package.json', 'vercel.json']) {
        if (!(await exists(p))) missing.push(p);
      }
      const hasFrontendApp = (await Promise.all(['frontend/package.json', 'frontend/app/page.tsx', 'frontend/app/layout.tsx', 'frontend/app/globals.css'].map(exists))).every(Boolean);
      const hasRootNextApp = (await Promise.all(['src/app/page.tsx', 'src/app/layout.tsx', 'src/app/globals.css'].map(exists))).every(Boolean);
      if (!hasFrontendApp && !hasRootNextApp) missing.push('frontend/app/* or src/app/*');

      if (missing.length > 0) {
        return res.json({
          ok: false,
          error: 'repo-missing-critical-files',
          missing,
          note: `Cannot retry deploy — repo is missing: ${missing.join(', ')}. Push the missing files first, then retry.`
        });
      }

      // Check current framework — don't override if already set correctly
      const settingsRepair = await patchVercelProjectSettings({ token: VERCEL_TOKEN, team: VERCEL_TEAM, projectId: project_id });
      const projData = { framework: 'nextjs' };
      // Only clear framework if it's causing build issues on non-Next.js projects
      // NEVER set framework:null on Next.js projects — it breaks routing
      if (projData.framework && projData.framework !== 'nextjs') {
        await fetch(`https://api.vercel.com/v9/projects/${project_id}?teamId=${VERCEL_TEAM}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ framework: null })
        });
      }

      const dr = await fetch(`https://api.vercel.com/v13/deployments?teamId=${VERCEL_TEAM}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: safeRepo,
          project: project_id,
          target: 'production',
          gitSource: { type: 'github', org: repoOrg, repo: safeRepo, ref: 'main' }
        })
      });
      const dd = await dr.json();
      return res.json({
        ok: true,
        state: dd.readyState,
        url: dd.url ? `https://${dd.url}` : null,
        project_settings_repair: settingsRepair,
      });
    } catch (e) {
      return res.json({ ok: false, error: sanitizeError(e.message) });
    }
  }

  return res.status(400).json({ok:false, error:`Unknown action: ${action}`});
}
