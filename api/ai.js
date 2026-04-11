// ── Your Deputy v2 — Multi-Model AI Router ──────────────────────────────
// Routes to: Anthropic, OpenAI, Google, Groq, DeepSeek, Mistral, OpenRouter
// Adapts prompt format per provider. Returns unified response shape.
export const maxDuration = 300;

const PROVIDERS = {
  // ── Anthropic ──────────────────────────────────────────────────────────────
  'claude-sonnet-4-20250514':   { provider: 'anthropic', label: 'Claude Sonnet 4',  costPer1kIn: 0.003, costPer1kOut: 0.015, free: false },
  'claude-opus-4-20250514':     { provider: 'anthropic', label: 'Claude Opus 4',    costPer1kIn: 0.015, costPer1kOut: 0.075, free: false },
  'claude-haiku-4-5-20251001':  { provider: 'anthropic', label: 'Claude Haiku 4.5', costPer1kIn: 0.0008, costPer1kOut: 0.004, free: false },

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  'gpt-4o':                     { provider: 'openai', label: 'GPT-4o',         costPer1kIn: 0.0025, costPer1kOut: 0.01, free: false },
  'gpt-4o-mini':                { provider: 'openai', label: 'GPT-4o Mini',    costPer1kIn: 0.00015, costPer1kOut: 0.0006, free: false },
  'gpt-4.1':                    { provider: 'openai', label: 'GPT-4.1',        costPer1kIn: 0.002, costPer1kOut: 0.008, free: false },
  'gpt-4.1-mini':               { provider: 'openai', label: 'GPT-4.1 Mini',   costPer1kIn: 0.0004, costPer1kOut: 0.0016, free: false },
  'o3-mini':                    { provider: 'openai', label: 'o3-mini',         costPer1kIn: 0.0011, costPer1kOut: 0.0044, free: false },

  // ── Google ─────────────────────────────────────────────────────────────────
  'gemini-2.5-pro':             { provider: 'google', label: 'Gemini 2.5 Pro',   costPer1kIn: 0.00125, costPer1kOut: 0.01, free: false },
  'gemini-2.5-flash':           { provider: 'google', label: 'Gemini 2.5 Flash', costPer1kIn: 0.00015, costPer1kOut: 0.001, free: false },
  'gemini-2.0-flash':           { provider: 'google', label: 'Gemini 2.0 Flash', costPer1kIn: 0.0001, costPer1kOut: 0.0004, free: true },

  // ── Groq (free tier) ──────────────────────────────────────────────────────
  'llama-3.3-70b-versatile':    { provider: 'groq', label: 'Llama 3.3 70B',  costPer1kIn: 0, costPer1kOut: 0, free: true },
  'llama-3.1-8b-instant':       { provider: 'groq', label: 'Llama 3.1 8B',   costPer1kIn: 0, costPer1kOut: 0, free: true },
  'mixtral-8x7b-32768':         { provider: 'groq', label: 'Mixtral 8x7B',   costPer1kIn: 0, costPer1kOut: 0, free: true },
  'gemma2-9b-it':               { provider: 'groq', label: 'Gemma 2 9B',     costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── DeepSeek ──────────────────────────────────────────────────────────────
  'deepseek-chat':              { provider: 'deepseek', label: 'DeepSeek V3',    costPer1kIn: 0.00027, costPer1kOut: 0.0011, free: false },
  'deepseek-reasoner':          { provider: 'deepseek', label: 'DeepSeek R1',    costPer1kIn: 0.00055, costPer1kOut: 0.0022, free: false },

  // ── Mistral ───────────────────────────────────────────────────────────────
  'mistral-large-latest':       { provider: 'mistral', label: 'Mistral Large',   costPer1kIn: 0.002, costPer1kOut: 0.006, free: false },
  'mistral-small-latest':       { provider: 'mistral', label: 'Mistral Small',   costPer1kIn: 0.0002, costPer1kOut: 0.0006, free: false },
  'codestral-latest':           { provider: 'mistral', label: 'Codestral',       costPer1kIn: 0.0003, costPer1kOut: 0.0009, free: false },

  // ── OpenRouter (aggregator — free models) ─────────────────────────────────
  'meta-llama/llama-3.3-70b-instruct:free': { provider: 'openrouter', label: 'Llama 3.3 70B (OR)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  'google/gemma-2-9b-it:free':               { provider: 'openrouter', label: 'Gemma 2 9B (OR)',    costPer1kIn: 0, costPer1kOut: 0, free: true },
  'microsoft/phi-3-mini-128k-instruct:free': { provider: 'openrouter', label: 'Phi-3 Mini (OR)',    costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── Ollama (self-hosted — any model you run locally) ──────────────────
  'ollama/gemma4':                { provider: 'ollama', label: 'Gemma 4 (Ollama)',     costPer1kIn: 0, costPer1kOut: 0, free: true },
  'ollama/llama3.3':              { provider: 'ollama', label: 'Llama 3.3 (Ollama)',   costPer1kIn: 0, costPer1kOut: 0, free: true },
  'ollama/deepseek-r1':           { provider: 'ollama', label: 'DeepSeek R1 (Ollama)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  'ollama/qwen3':                 { provider: 'ollama', label: 'Qwen 3 (Ollama)',      costPer1kIn: 0, costPer1kOut: 0, free: true },
  'ollama/mistral':               { provider: 'ollama', label: 'Mistral (Ollama)',     costPer1kIn: 0, costPer1kOut: 0, free: true },
};

const FREE_SCORING_DAILY_LIMIT = Math.max(1, parseInt(process.env.FREE_SCORING_DAILY_LIMIT || '30', 10));
const USAGE_TABLE = 'dynasty_ai_usage_daily';
const PAID_TIERS = new Set(['foundation', 'starter', 'professional', 'enterprise', 'managed']);

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return (req.headers['x-real-ip'] || 'unknown').toString();
}

function getDayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function getUsagePool() {
  const connStr = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connStr) return null;
  if (globalThis.__dynastyAiUsagePool) return globalThis.__dynastyAiUsagePool;
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: connStr, max: 3, idleTimeoutMillis: 5000 });
    globalThis.__dynastyAiUsagePool = pool;
    return pool;
  } catch {
    return null;
  }
}

async function ensureUsageTable(pool) {
  if (globalThis.__dynastyAiUsageReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${USAGE_TABLE} (
      day_key DATE NOT NULL,
      actor_key TEXT NOT NULL,
      requests INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (day_key, actor_key)
    );
  `);
  globalThis.__dynastyAiUsageReady = true;
}

async function incrementUsage(actorKey) {
  const dayKey = getDayKey();
  const pool = await getUsagePool();
  if (pool) {
    await ensureUsageTable(pool);
    const r = await pool.query(
      `INSERT INTO ${USAGE_TABLE} (day_key, actor_key, requests, updated_at)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (day_key, actor_key)
       DO UPDATE SET requests = ${USAGE_TABLE}.requests + 1, updated_at = NOW()
       RETURNING requests`,
      [dayKey, actorKey]
    );
    return r.rows?.[0]?.requests || 1;
  }
  // Fallback for environments without DB (best-effort in-memory)
  if (!globalThis.__dynastyAiUsageMem) globalThis.__dynastyAiUsageMem = new Map();
  const map = globalThis.__dynastyAiUsageMem;
  const key = `${dayKey}:${actorKey}`;
  const next = (map.get(key) || 0) + 1;
  map.set(key, next);
  return next;
}

function resolveFreeModel(config) {
  const preferred = ['gemini-2.0-flash', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];
  for (const model of preferred) {
    const info = PROVIDERS[model];
    if (!info || !info.free) continue;
    if (getApiKey(info.provider, config)) return model;
  }
  for (const [model, info] of Object.entries(PROVIDERS)) {
    if (!info.free) continue;
    if (getApiKey(info.provider, config)) return model;
  }
  return null;
}

async function fetchStripeCheckoutSession(sessionId) {
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk || !sessionId) return null;
  const auth = Buffer.from(`${sk}:`).toString('base64');
  try {
    const resp = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const data = await resp.json();
    if (!resp.ok || data.error) return null;
    return data;
  } catch {
    return null;
  }
}

function paidTierFromSession(session) {
  if (!session) return null;
  const isPaid = session.payment_status === 'paid' || (session.mode === 'subscription' && session.status === 'complete');
  if (!isPaid) return null;
  const plan = String(session.metadata?.plan || 'foundation').toLowerCase();
  if (!PAID_TIERS.has(plan)) return null;
  return plan;
}

function getApiKey(provider, config) {
  const keys = {
    anthropic:   process.env.ANTHROPIC_API_KEY,
    openai:      process.env.OPENAI_API_KEY || config?.ai?.openai,
    google:      process.env.GOOGLE_AI_KEY || config?.ai?.google_ai,
    groq:        process.env.GROQ_API_KEY || config?.ai?.groq,
    deepseek:    process.env.DEEPSEEK_API_KEY || config?.ai?.deepseek,
    mistral:     process.env.MISTRAL_API_KEY || config?.ai?.mistral,
    openrouter:  process.env.OPENROUTER_API_KEY || config?.ai?.openrouter,
    ollama:      process.env.OLLAMA_URL || config?.ai?.ollama_url || null, // URL acts as the "key"
  };
  return keys[provider] || null;
}

async function callAnthropic(apiKey, body) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function callOpenAI(apiKey, body) {
  // Convert Anthropic message format to OpenAI format
  const messages = (body.messages || []).map(m => ({ role: m.role, content: m.content }));
  if (body.system) messages.unshift({ role: 'system', content: body.system });
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: body.model, messages, max_tokens: body.max_tokens, temperature: body.temperature || 0.7 }),
  });
  const d = await r.json();
  // Normalize to Anthropic response shape
  return { content: [{ type: 'text', text: d.choices?.[0]?.message?.content || '' }], model: d.model, usage: d.usage };
}

async function callGoogle(apiKey, body) {
  const model = body.model;
  const prompt = body.messages.map(m => m.content).join('\n\n');
  const systemInstruction = body.system || '';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
      generationConfig: { maxOutputTokens: body.max_tokens || 4096, temperature: body.temperature || 0.7 },
    }),
  });
  const d = await r.json();
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { content: [{ type: 'text', text }], model, usage: d.usageMetadata };
}

async function callGroq(apiKey, body) {
  const messages = (body.messages || []).map(m => ({ role: m.role, content: m.content }));
  if (body.system) messages.unshift({ role: 'system', content: body.system });
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: body.model, messages, max_tokens: body.max_tokens || 4096, temperature: body.temperature || 0.7 }),
  });
  const d = await r.json();
  return { content: [{ type: 'text', text: d.choices?.[0]?.message?.content || '' }], model: d.model, usage: d.usage };
}

async function callDeepSeek(apiKey, body) {
  const messages = (body.messages || []).map(m => ({ role: m.role, content: m.content }));
  if (body.system) messages.unshift({ role: 'system', content: body.system });
  const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: body.model, messages, max_tokens: body.max_tokens || 4096, temperature: body.temperature || 0.7 }),
  });
  const d = await r.json();
  return { content: [{ type: 'text', text: d.choices?.[0]?.message?.content || '' }], model: d.model, usage: d.usage };
}

async function callMistral(apiKey, body) {
  const messages = (body.messages || []).map(m => ({ role: m.role, content: m.content }));
  if (body.system) messages.unshift({ role: 'system', content: body.system });
  const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: body.model, messages, max_tokens: body.max_tokens || 4096, temperature: body.temperature || 0.7 }),
  });
  const d = await r.json();
  return { content: [{ type: 'text', text: d.choices?.[0]?.message?.content || '' }], model: d.model, usage: d.usage };
}

async function callOllama(apiKey, body) {
  // Ollama uses OpenAI-compatible API. apiKey = the base URL (e.g., http://localhost:11434)
  const baseUrl = apiKey.replace(/\/$/, '');
  const ollamaModel = body.model.replace('ollama/', ''); // strip prefix
  const messages = (body.messages || []).map(m => ({ role: m.role, content: m.content }));
  if (body.system) messages.unshift({ role: 'system', content: body.system });
  const r = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: ollamaModel, messages, max_tokens: body.max_tokens || 4096, temperature: body.temperature || 0.7, stream: false }),
  });
  const d = await r.json();
  return { content: [{ type: 'text', text: d.choices?.[0]?.message?.content || '' }], model: d.model, usage: d.usage };
}

async function callOpenRouter(apiKey, body) {
  const messages = (body.messages || []).map(m => ({ role: m.role, content: m.content }));
  if (body.system) messages.unshift({ role: 'system', content: body.system });
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': 'https://yourdeputy.com', 'X-Title': 'Your Deputy' },
    body: JSON.stringify({ model: body.model, messages, max_tokens: body.max_tokens || 4096, temperature: body.temperature || 0.7 }),
  });
  const d = await r.json();
  return { content: [{ type: 'text', text: d.choices?.[0]?.message?.content || '' }], model: d.model, usage: d.usage };
}

const CALLERS = { anthropic: callAnthropic, openai: callOpenAI, google: callGoogle, groq: callGroq, deepseek: callDeepSeek, mistral: callMistral, openrouter: callOpenRouter, ollama: callOllama };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ── GET /api/ai?action=models — return available models with cost info ────
  if (req.method === 'GET' && req.query?.action === 'models') {
    const config = JSON.parse(process.env.DYNASTY_TOOL_CONFIG || '{}');
    const available = {};
    for (const [model, info] of Object.entries(PROVIDERS)) {
      const key = getApiKey(info.provider, config);
      available[model] = {
        ...info,
        available: !!key,
        estimatedBuildCost: info.free ? '$0.00' : `~$${((info.costPer1kIn * 30 + info.costPer1kOut * 50) * 7).toFixed(2)}`,
      };
    }
    return res.json({ models: available, providers: [...new Set(Object.values(PROVIDERS).map(p => p.provider))] });
  }

  // ── POST /api/ai — generate completion ────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const config = JSON.parse(process.env.DYNASTY_TOOL_CONFIG || '{}');
  const body = req.body || {};
  const usageContext = (body.usage_context || 'standard').toString();
  const requestedModel = (body.model || 'claude-sonnet-4-20250514').toString();
  const claimedTier = (body.tier || 'free').toString().toLowerCase();
  const stripeSessionId = (body.stripe_session_id || body.session_id || '').toString().trim();
  const userId = (body.user_id || '').toString().trim();
  const actorKey = userId ? `u:${userId}` : `ip:${getClientIp(req)}`;
  let model = requestedModel;

  if (usageContext !== 'free_scoring') {
    const session = await fetchStripeCheckoutSession(stripeSessionId);
    const paidTier = paidTierFromSession(session);
    if (!paidTier) {
      return res.status(402).json({
        error: 'Paid access verification required for non-free AI usage.',
      });
    }
    if (claimedTier !== 'free' && claimedTier !== paidTier && !(claimedTier === 'starter' && paidTier === 'foundation')) {
      return res.status(403).json({
        error: `Tier mismatch: session allows ${paidTier}, but request claimed ${claimedTier}.`,
      });
    }
  }

  if (usageContext === 'free_scoring') {
    const requestsToday = await incrementUsage(actorKey);
    const remaining = Math.max(0, FREE_SCORING_DAILY_LIMIT - requestsToday);
    res.setHeader('X-Free-Scoring-Limit', String(FREE_SCORING_DAILY_LIMIT));
    res.setHeader('X-Free-Scoring-Remaining', String(remaining));
    if (requestsToday > FREE_SCORING_DAILY_LIMIT) {
      return res.status(429).json({
        error: `Free scoring limit reached (${FREE_SCORING_DAILY_LIMIT}/day). Try again tomorrow or upgrade.`,
        limit: FREE_SCORING_DAILY_LIMIT
      });
    }
    const chosenFree = resolveFreeModel(config);
    if (!chosenFree) {
      return res.status(503).json({ error: 'No free scoring models are currently available. Please try again shortly.' });
    }
    if (!PROVIDERS[model]?.free) model = chosenFree;
  }

  const info = PROVIDERS[model];

  if (!info) return res.status(400).json({ error: `Unknown model: ${model}`, available: Object.keys(PROVIDERS) });

  const apiKey = getApiKey(info.provider, config);
  if (!apiKey) return res.status(400).json({ error: `No API key for ${info.provider}. Add to DYNASTY_TOOL_CONFIG or Vercel env vars.`, provider: info.provider });

  const caller = CALLERS[info.provider];
  if (!caller) return res.status(500).json({ error: `No caller for provider: ${info.provider}` });

  try {
    const normalizedBody = { ...body, model };
    const result = await caller(apiKey, normalizedBody);
    // Attach cost estimate to response
    const inputTokens = result.usage?.input_tokens || result.usage?.prompt_tokens || 0;
    const outputTokens = result.usage?.output_tokens || result.usage?.completion_tokens || 0;
    result._cost = {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost: info.free ? 0 : ((inputTokens / 1000) * info.costPer1kIn + (outputTokens / 1000) * info.costPer1kOut),
      model,
      provider: info.provider,
    };
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'AI call failed', provider: info.provider, model });
  }
}
