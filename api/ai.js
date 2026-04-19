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
  'gemma-4-31b-it':             { provider: 'google', label: 'Gemma 4 31B',        costPer1kIn: 0, costPer1kOut: 0, free: true },
  'gemma-4-26b-a4b-it':         { provider: 'google', label: 'Gemma 4 26B MoE',    costPer1kIn: 0, costPer1kOut: 0, free: true },

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

  // ── Cerebras (free tier — fast inference) ────────────────────────────
  'llama-3.3-70b':                { provider: 'cerebras', label: 'Llama 3.3 70B (Cerebras)', costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── SambaNova (free tier — fast inference) ───────────────────────────
  'Meta-Llama-3.3-70B-Instruct':  { provider: 'sambanova', label: 'Llama 3.3 70B (SambaNova)', costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── Moonshot / Kimi (free tier — 200K+ context) ──────────────────────
  'kimi-k2-0905-preview':         { provider: 'moonshot', label: 'Kimi K2 (Moonshot)',       costPer1kIn: 0, costPer1kOut: 0, free: true },
  'moonshot-v1-auto':             { provider: 'moonshot', label: 'Moonshot v1 Auto',         costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── Z.AI / ZhipuAI (free tier — GLM-4.5 reasoning) ───────────────────
  'glm-4.5':                      { provider: 'zai', label: 'GLM-4.5 (Z.AI)',                costPer1kIn: 0, costPer1kOut: 0, free: true },
  'glm-4.5-air':                  { provider: 'zai', label: 'GLM-4.5 Air (Z.AI)',            costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── MiniMax (free tier — 1M context) ─────────────────────────────────
  'MiniMax-M1':                   { provider: 'minimax', label: 'MiniMax M1',                costPer1kIn: 0, costPer1kOut: 0, free: true },
  'abab6.5s-chat':                { provider: 'minimax', label: 'MiniMax abab6.5s',          costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── xAI / Grok (paid — optional fallback) ────────────────────────────
  'grok-2-latest':                { provider: 'grok', label: 'Grok 2 (xAI)',                 costPer1kIn: 0.002, costPer1kOut: 0.01, free: false },
  'grok-4-latest':                { provider: 'grok', label: 'Grok 4 (xAI)',                 costPer1kIn: 0.003, costPer1kOut: 0.015, free: false },

  // ── Fireworks.ai (near-free — hosts Llama/Qwen/DeepSeek cheaply) ─────
  'accounts/fireworks/models/llama-v3p3-70b-instruct': { provider: 'fireworks', label: 'Llama 3.3 70B (Fireworks)', costPer1kIn: 0.0001, costPer1kOut: 0.0004, free: true },
  'accounts/fireworks/models/qwen2p5-72b-instruct':    { provider: 'fireworks', label: 'Qwen 2.5 72B (Fireworks)',  costPer1kIn: 0.0001, costPer1kOut: 0.0004, free: true },
  'accounts/fireworks/models/deepseek-v3':             { provider: 'fireworks', label: 'DeepSeek V3 (Fireworks)',   costPer1kIn: 0.00027, costPer1kOut: 0.0011, free: true },

  // ── Hyperbolic (free tier — hosts open-weights) ──────────────────────
  'meta-llama/Llama-3.3-70B-Instruct':           { provider: 'hyperbolic', label: 'Llama 3.3 70B (Hyperbolic)',     costPer1kIn: 0, costPer1kOut: 0, free: true },
  'deepseek-ai/DeepSeek-V3':                     { provider: 'hyperbolic', label: 'DeepSeek V3 (Hyperbolic)',       costPer1kIn: 0, costPer1kOut: 0, free: true },
  'Qwen/Qwen2.5-Coder-32B-Instruct':             { provider: 'hyperbolic', label: 'Qwen 2.5 Coder 32B (Hyperbolic)', costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── Together AI (free tier + cheap Llama 4 / Qwen3 / DeepSeek V3.2) ──
  'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free':                 { provider: 'together', label: 'Llama 3.3 70B Turbo Free (Together)',     costPer1kIn: 0, costPer1kOut: 0, free: true },
  'meta-llama/Llama-4-Scout-17B-16E-Instruct':                    { provider: 'together', label: 'Llama 4 Scout (Together)',                costPer1kIn: 0.00018, costPer1kOut: 0.00059, free: true },
  'deepseek-ai/DeepSeek-V3.2-Exp':                                { provider: 'together', label: 'DeepSeek V3.2 Exp (Together)',            costPer1kIn: 0, costPer1kOut: 0, free: true },
  'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8':                      { provider: 'together', label: 'Qwen3 Coder 480B (Together)',             costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── Perplexity Sonar (free tier — grounded web search, unique) ───────
  'sonar':                       { provider: 'perplexity', label: 'Sonar (Perplexity)',       costPer1kIn: 0, costPer1kOut: 0, free: true },
  'sonar-pro':                   { provider: 'perplexity', label: 'Sonar Pro (Perplexity)',   costPer1kIn: 0.003, costPer1kOut: 0.015, free: false },
  'sonar-reasoning':             { provider: 'perplexity', label: 'Sonar Reasoning (Perplexity)', costPer1kIn: 0.001, costPer1kOut: 0.005, free: false },

  // ── Alibaba DashScope / Qwen (free tier — best open-weight coder) ────
  'qwen3-coder-plus':            { provider: 'dashscope', label: 'Qwen3 Coder Plus',          costPer1kIn: 0, costPer1kOut: 0, free: true },
  'qwen3-max':                   { provider: 'dashscope', label: 'Qwen3 Max',                 costPer1kIn: 0, costPer1kOut: 0, free: true },
  'qwen3-vl-plus':               { provider: 'dashscope', label: 'Qwen3 VL Plus (vision)',    costPer1kIn: 0, costPer1kOut: 0, free: true },
  'qwen3-235b-a22b-instruct-2507': { provider: 'dashscope', label: 'Qwen3 235B Instruct',     costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── Nvidia NIM (free dev preview — Llama 4, Nemotron, etc.) ──────────
  'meta/llama-4-maverick-17b-128e-instruct':     { provider: 'nvidia', label: 'Llama 4 Maverick (Nvidia)',          costPer1kIn: 0, costPer1kOut: 0, free: true },
  'nvidia/llama-3.3-nemotron-super-49b-v1':      { provider: 'nvidia', label: 'Llama 3.3 Nemotron 49B (Nvidia)',    costPer1kIn: 0, costPer1kOut: 0, free: true },
  'deepseek-ai/deepseek-r1':                     { provider: 'nvidia', label: 'DeepSeek R1 (Nvidia)',               costPer1kIn: 0, costPer1kOut: 0, free: true },
  'qwen/qwen3-coder-480b-a35b-instruct':         { provider: 'nvidia', label: 'Qwen3 Coder 480B (Nvidia)',          costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── Baseten (free tier — open-weight hosting) ────────────────────────
  'meta-llama/Llama-3.3-70B-Instruct@baseten':   { provider: 'baseten', label: 'Llama 3.3 70B (Baseten)',           costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── Additions to existing providers ──────────────────────────────────
  // Groq — Llama 4, Kimi K2 (hosted on Groq), QwQ
  'moonshotai/kimi-k2-instruct':                          { provider: 'groq', label: 'Kimi K2 (Groq)',          costPer1kIn: 0, costPer1kOut: 0, free: true },
  'meta-llama/llama-4-scout-17b-16e-instruct':            { provider: 'groq', label: 'Llama 4 Scout (Groq)',    costPer1kIn: 0, costPer1kOut: 0, free: true },
  'meta-llama/llama-4-maverick-17b-128e-instruct':        { provider: 'groq', label: 'Llama 4 Maverick (Groq)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  'qwen-qwq-32b':                                         { provider: 'groq', label: 'QwQ 32B (Groq)',          costPer1kIn: 0, costPer1kOut: 0, free: true },
  // Cerebras — Llama 4
  'llama-4-scout-17b-16e-instruct':                       { provider: 'cerebras', label: 'Llama 4 Scout (Cerebras)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  // SambaNova — DeepSeek R1
  'DeepSeek-R1':                                          { provider: 'sambanova', label: 'DeepSeek R1 (SambaNova)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  // Z.AI — GLM-4.6
  'glm-4.6':                                              { provider: 'zai',  label: 'GLM-4.6 (Z.AI)',          costPer1kIn: 0, costPer1kOut: 0, free: true },
  // OpenRouter — free top open-weights
  'deepseek/deepseek-chat-v3.1:free':                     { provider: 'openrouter', label: 'DeepSeek V3.1 (OR free)',  costPer1kIn: 0, costPer1kOut: 0, free: true },
  'qwen/qwen3-coder:free':                                { provider: 'openrouter', label: 'Qwen3 Coder (OR free)',    costPer1kIn: 0, costPer1kOut: 0, free: true },
  'meta-llama/llama-4-maverick:free':                     { provider: 'openrouter', label: 'Llama 4 Maverick (OR free)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  'z-ai/glm-4.5-air:free':                                { provider: 'openrouter', label: 'GLM-4.5 Air (OR free)',    costPer1kIn: 0, costPer1kOut: 0, free: true },
};

const FREE_SCORING_DAILY_LIMIT = Math.max(1, parseInt(process.env.FREE_SCORING_DAILY_LIMIT || '30', 10));
const FREE_GUEST_MONTHLY_LIMIT = Math.max(1, parseInt(process.env.FREE_GUEST_SCORING_LIMIT || '15', 10));
const FREE_REGISTERED_MONTHLY_LIMIT = Math.max(1, parseInt(process.env.FREE_REGISTERED_SCORING_LIMIT || '30', 10));
const SCORING_PRO_MONTHLY_LIMIT = Math.max(50, parseInt(process.env.SCORING_PRO_MONTHLY_LIMIT || '200', 10));
const USAGE_TABLE = 'dynasty_ai_usage_daily';
const QUOTA_TABLE = 'dynasty_ai_quota_usage';
const PAID_TIERS = new Set(['foundation', 'starter', 'professional', 'enterprise', 'managed', 'custom_volume', 'scoring_pro']);

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
  const { createHmac } = await import('crypto');
  const payload = `${prefix}:${expiry}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  if (expected.length !== hash.length) return false;
  const { timingSafeEqual } = await import('crypto');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
}

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

async function ensureQuotaTable(pool) {
  if (globalThis.__dynastyAiQuotaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${QUOTA_TABLE} (
      window_key TEXT NOT NULL,
      actor_key TEXT NOT NULL,
      usage_bucket TEXT NOT NULL,
      requests INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (window_key, actor_key, usage_bucket)
    );
  `);
  globalThis.__dynastyAiQuotaReady = true;
}

function getMonthKey() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

async function getQuotaUsage(windowKey, actorKey, usageBucket) {
  const pool = await getUsagePool();
  if (pool) {
    await ensureQuotaTable(pool);
    const r = await pool.query(
      `SELECT requests FROM ${QUOTA_TABLE} WHERE window_key = $1 AND actor_key = $2 AND usage_bucket = $3`,
      [windowKey, actorKey, usageBucket]
    );
    return r.rows?.[0]?.requests || 0;
  }
  if (!globalThis.__dynastyAiQuotaMem) globalThis.__dynastyAiQuotaMem = new Map();
  const key = `${windowKey}:${actorKey}:${usageBucket}`;
  return globalThis.__dynastyAiQuotaMem.get(key) || 0;
}

async function incrementQuotaUsage(windowKey, actorKey, usageBucket) {
  const pool = await getUsagePool();
  if (pool) {
    await ensureQuotaTable(pool);
    const r = await pool.query(
      `INSERT INTO ${QUOTA_TABLE} (window_key, actor_key, usage_bucket, requests, updated_at)
       VALUES ($1, $2, $3, 1, NOW())
       ON CONFLICT (window_key, actor_key, usage_bucket)
       DO UPDATE SET requests = ${QUOTA_TABLE}.requests + 1, updated_at = NOW()
       RETURNING requests`,
      [windowKey, actorKey, usageBucket]
    );
    return r.rows?.[0]?.requests || 1;
  }
  if (!globalThis.__dynastyAiQuotaMem) globalThis.__dynastyAiQuotaMem = new Map();
  const map = globalThis.__dynastyAiQuotaMem;
  const key = `${windowKey}:${actorKey}:${usageBucket}`;
  const next = (map.get(key) || 0) + 1;
  map.set(key, next);
  return next;
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
  // Ordered by quality × availability × speed. First match with an available
  // API key wins. Top tier: latest open-weight frontier models. Second tier:
  // proven free fallbacks. Third tier: lightweight last-resorts.
  const preferred = [
    // Frontier open-weights (Llama 4, GLM-4.6, Qwen3)
    'meta-llama/llama-4-scout-17b-16e-instruct',  // Groq Llama 4 Scout — fastest frontier
    'llama-4-scout-17b-16e-instruct',              // Cerebras Llama 4 Scout
    'glm-4.6', 'glm-4.5',                          // Z.AI reasoning specialists
    'gemini-2.5-pro',                              // Google reasoning frontier
    'qwen3-max',                                   // Alibaba general flagship
    'kimi-k2-0905-preview',                        // Moonshot — long context, strong creative
    'DeepSeek-R1',                                 // SambaNova — best OSS reasoning
    'meta/llama-4-maverick-17b-128e-instruct',     // Nvidia Llama 4 Maverick

    // Workhorses (consistently fast + good)
    'gemma-4-31b-it', 'gemma-4-26b-a4b-it', 'gemini-2.0-flash',
    'llama-3.3-70b-versatile',                     // Groq Llama 3.3 70B
    'llama-3.3-70b',                               // Cerebras
    'Meta-Llama-3.3-70B-Instruct',                 // SambaNova
    'meta-llama/Llama-3.3-70B-Instruct',           // Hyperbolic
    'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', // Together free
    'deepseek-ai/DeepSeek-V3.2-Exp',               // Together DeepSeek V3.2

    // Specialists (used directly via task router; here as fallback)
    'qwen3-coder-plus',                            // DashScope coder
    'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8',     // Together coder
    'MiniMax-M1',                                  // 1M context

    // Last-resorts
    'accounts/fireworks/models/llama-v3p3-70b-instruct',
    'llama-3.1-8b-instant', 'mixtral-8x7b-32768',
    'glm-4.5-air', 'moonshot-v1-auto',
  ];
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

// ── Task-type router ────────────────────────────────────────────────────
// Examines a prompt and picks the best specialist model. Each task type
// maps to a primary model; if its provider key is missing, we fall back
// through a per-task fallback list, then to resolveFreeModel().
//
// This is invoked from the handler when the client doesn't pin a model
// (i.e. body.model is missing). Pinning a model bypasses the router.
function detectTaskType(prompt) {
  if (!prompt || typeof prompt !== 'string') return 'general';
  const len = prompt.length;
  // Long-context wins over everything — only specific models can handle it.
  if (len > 50000) return 'long_context';
  // Vision content (data URLs / image_url markers) — Gemini handles these natively.
  if (/data:image\/|image_url|<img\s|\.(png|jpg|jpeg|webp|gif)\b/i.test(prompt)) return 'vision';
  // Code: explicit fenced blocks OR multiple language signals.
  if (/```[a-z]*\n/i.test(prompt) || /\b(function\s+\w+\s*\(|class\s+\w+\s*[({:]|def\s+\w+\s*\(|import\s+\w+\s+from\s+|const\s+\w+\s*=\s*(?:async\s*)?\(?|=>\s*\{)/i.test(prompt)) return 'code';
  // Math / formal reasoning.
  if (/\b(prove|theorem|step[\s-]by[\s-]step|chain[\s-]of[\s-]thought|derive|integral|derivative|matrix|big[\s-]?o\b|reasoning chain)\b/i.test(prompt)) return 'reasoning';
  // Web / current — needs grounded search.
  if (/\b(latest|today|currently|2025|2026|breaking|recent news|current price|live data)\b/i.test(prompt)) return 'web_current';
  // Structured output (delimiter format / JSON schema / strict shape).
  if (/---BEGIN:|return\s+(?:only\s+)?(?:a\s+)?(?:valid\s+)?json|delimiter format|json\s*array|json\s*schema/i.test(prompt)) return 'structured';
  // Creative / brand voice.
  if (/\b(write\s+a\s+(?:story|poem|copy|tagline|brand|voice|email|landing)|brand voice|creative writing|tone of voice)\b/i.test(prompt)) return 'creative';
  return 'general';
}

const TASK_PRIMARY = {
  general:      'gemini-2.5-pro',
  code:         'qwen3-coder-plus',
  reasoning:    'glm-4.6',
  long_context: 'kimi-k2-0905-preview',
  web_current:  'sonar',
  vision:       'gemini-2.5-pro',
  structured:   'llama-3.3-70b',          // Cerebras — fast + reliable structured output
  creative:     'kimi-k2-0905-preview',
};

const TASK_FALLBACKS = {
  general:      ['gemini-2.5-pro', 'glm-4.6', 'meta-llama/llama-4-scout-17b-16e-instruct', 'gemini-2.0-flash'],
  code:         ['qwen3-coder-plus', 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8', 'qwen/qwen3-coder:free', 'deepseek-ai/DeepSeek-V3.2-Exp', 'deepseek-chat'],
  reasoning:    ['glm-4.6', 'DeepSeek-R1', 'deepseek-reasoner', 'gemini-2.5-pro', 'qwen-qwq-32b'],
  long_context: ['kimi-k2-0905-preview', 'MiniMax-M1', 'gemini-2.5-pro', 'moonshotai/kimi-k2-instruct'],
  web_current:  ['sonar', 'sonar-reasoning', 'gemini-2.5-pro'],
  vision:       ['gemini-2.5-pro', 'gemini-2.0-flash', 'qwen3-vl-plus'],
  structured:   ['llama-3.3-70b', 'llama-3.3-70b-versatile', 'gemini-2.0-flash', 'Meta-Llama-3.3-70B-Instruct'],
  creative:     ['kimi-k2-0905-preview', 'moonshotai/kimi-k2-instruct', 'glm-4.6', 'gemini-2.5-pro'],
};

function routeByTask(prompt, config) {
  const taskType = detectTaskType(prompt);
  const candidates = TASK_FALLBACKS[taskType] || [TASK_PRIMARY[taskType] || 'gemini-2.0-flash'];
  for (const model of candidates) {
    const info = PROVIDERS[model];
    if (!info) continue;
    if (getApiKey(info.provider, config)) return { model, taskType };
  }
  // Nothing in the task chain has a key — fall back to general free model.
  const freeModel = resolveFreeModel(config);
  return { model: freeModel || 'gemini-2.0-flash', taskType: taskType + '_fallback' };
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
  const { createHmac } = await import('crypto');
  const payload = `${prefix}:${tokSessionId}:${tokUserId}:${tokTier}:${exp}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  if (expected.length !== sig.length) return false;
  const { timingSafeEqual: tse } = await import('crypto');
  return tse(Buffer.from(expected), Buffer.from(sig));
}

// Round-robin counter for multi-key providers (Groq, DeepSeek). Bumped on
// every call; resets if process restarts. In-memory is fine — rate limits
// are per-key per-minute, so any distribution across keys helps.
let __keyRotationCounter = 0;
function pickRotated(...keys) {
  const filled = keys.filter(k => !!k);
  if (filled.length === 0) return null;
  if (filled.length === 1) return filled[0];
  const idx = (__keyRotationCounter++) % filled.length;
  return filled[idx];
}

function getApiKey(provider, config) {
  const keys = {
    anthropic:   process.env.ANTHROPIC_API_KEY,
    openai:      process.env.OPENAI_API_KEY || config?.ai?.openai,
    google:      pickRotated(process.env.GOOGLE_AI_KEY, process.env.GEMINI_API_KEY, config?.ai?.google_ai),
    groq:        pickRotated(process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_2, config?.ai?.groq),
    deepseek:    pickRotated(process.env.DEEPSEEK_API_KEY, process.env.DEEPSEEK_API_KEY_2, config?.ai?.deepseek),
    mistral:     process.env.MISTRAL_API_KEY || config?.ai?.mistral,
    openrouter:  process.env.OPENROUTER_API_KEY || config?.ai?.openrouter,
    ollama:      process.env.OLLAMA_URL || config?.ai?.ollama_url || null,
    cerebras:    process.env.CEREBRAS_API_KEY || config?.ai?.cerebras,
    sambanova:   process.env.SAMBANOVA_API_KEY || config?.ai?.sambanova,
    moonshot:    process.env.MOONSHOT_API_KEY || config?.ai?.moonshot,
    zai:         process.env.ZAI_API_KEY || process.env.Z_AI_API_KEY || config?.ai?.zai,
    minimax:     process.env.MINIMAX_API_KEY || config?.ai?.minimax,
    grok:        process.env.GROK_API_KEY || process.env.XAI_API_KEY || config?.ai?.grok,
    fireworks:   process.env.FIREWORKS_API_KEY || config?.ai?.fireworks,
    hyperbolic:  process.env.HYPERBOLIC_API_KEY || config?.ai?.hyperbolic,
    together:    process.env.TOGETHER_API_KEY || config?.ai?.together,
    perplexity:  process.env.PERPLEXITY_API_KEY || config?.ai?.perplexity,
    dashscope:   process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || config?.ai?.dashscope,
    nvidia:      process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY || config?.ai?.nvidia,
    baseten:     process.env.BASETEN_API_KEY || config?.ai?.baseten,
  };
  return keys[provider] || null;
}

async function callAnthropic(apiKey, body) {
  // Never forward app auth fields (tier, admin_token, etc.) — Anthropic rejects unknown keys.
  const payload = {
    model: body.model,
    max_tokens: body.max_tokens ?? 4096,
    messages: Array.isArray(body.messages) ? body.messages : [],
  };
  if (body.system != null && String(body.system).length) payload.system = body.system;
  if (typeof body.temperature === 'number') payload.temperature = body.temperature;
  if (typeof body.top_p === 'number') payload.top_p = body.top_p;
  if (typeof body.top_k === 'number') payload.top_k = body.top_k;
  if (Array.isArray(body.stop_sequences) && body.stop_sequences.length) payload.stop_sequences = body.stop_sequences;
  if (body.stream === true) payload.stream = true;
  if (body.metadata && typeof body.metadata === 'object') payload.metadata = body.metadata;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!r.ok) {
    const msg = d?.error?.message || d?.message || `Anthropic request failed (${r.status})`;
    throw new Error(msg);
  }
  return d;
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
  if (!r.ok) { const errBody = await r.text().catch(() => ''); throw new Error(`OpenAI API error ${r.status}: ${errBody.slice(0, 200)}`); }
  const d = await r.json();
  return { content: [{ type: 'text', text: d.choices?.[0]?.message?.content || '' }], model: d.model, usage: d.usage };
}

async function callOpenAITranscription(apiKey, { audioBase64, mimeType, prompt }) {
  if (!audioBase64) throw new Error('Missing audio payload');
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  if (!audioBuffer.length) throw new Error('Empty audio payload');
  const model = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
  const extMap = {
    'audio/webm': 'webm',
    'video/webm': 'webm',
    'audio/mp4': 'mp4',
    'video/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'video/quicktime': 'mov',
  };
  const normalizedMime = (mimeType || 'audio/webm').toLowerCase();
  const ext = extMap[normalizedMime] || 'webm';
  const form = new FormData();
  form.set('model', model);
  if (prompt) form.set('prompt', String(prompt));
  form.set('response_format', 'json');
  form.set('temperature', '0');
  form.set('file', new Blob([audioBuffer], { type: normalizedMime }), `input.${ext}`);
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || `Transcription failed (${r.status})`);
  return (d?.text || '').trim();
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
  if (!r.ok) {
    const errMsg = d?.error?.message || `Google API error (${r.status})`;
    return { error: errMsg, content: null };
  }
  const parts = d.candidates?.[0]?.content?.parts || [];
  // Gemma 4 thinking models return thought parts marked `thought: true` — skip those
  const answerParts = parts.filter(p => !p.thought && p.text);
  let text = answerParts.length > 0 ? answerParts.map(p => p.text).join('') : (parts.map(p => p.text || '').join(''));
  // Strip any inline <think>...</think> tags that some Gemma 4 checkpoints emit
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
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
  if (!r.ok) { const errBody = await r.text().catch(() => ""); throw new Error(`Groq API error ${r.status}: ${errBody.slice(0, 200)}`); }
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
  if (!r.ok) { const errBody = await r.text().catch(() => ""); throw new Error(`DeepSeek API error ${r.status}: ${errBody.slice(0, 200)}`); }
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
  if (!r.ok) { const errBody = await r.text().catch(() => ""); throw new Error(`Mistral API error ${r.status}: ${errBody.slice(0, 200)}`); }
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
  if (!r.ok) { const errBody = await r.text().catch(() => ""); throw new Error(`Ollama API error ${r.status}: ${errBody.slice(0, 200)}`); }
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
  if (!r.ok) { const errBody = await r.text().catch(() => ""); throw new Error(`OpenRouter API error ${r.status}: ${errBody.slice(0, 200)}`); }
  const d = await r.json();
  return { content: [{ type: 'text', text: d.choices?.[0]?.message?.content || '' }], model: d.model, usage: d.usage };
}

async function callCerebras(apiKey, body) {
  const messages = (body.messages || []).map(m => ({ role: m.role, content: m.content }));
  if (body.system) messages.unshift({ role: 'system', content: body.system });
  const r = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: body.model, messages, max_tokens: body.max_tokens || 4096, temperature: body.temperature || 0.7 }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || `Cerebras request failed (${r.status})`);
  return { content: [{ type: 'text', text: d.choices?.[0]?.message?.content || '' }], model: d.model, usage: d.usage };
}

async function callSambaNova(apiKey, body) {
  const messages = (body.messages || []).map(m => ({ role: m.role, content: m.content }));
  if (body.system) messages.unshift({ role: 'system', content: body.system });
  const r = await fetch('https://api.sambanova.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: body.model, messages, max_tokens: body.max_tokens || 4096, temperature: body.temperature || 0.7 }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || `SambaNova request failed (${r.status})`);
  return { content: [{ type: 'text', text: d.choices?.[0]?.message?.content || '' }], model: d.model, usage: d.usage };
}

// Shared OpenAI-compatible caller — used by Moonshot, Z.AI, MiniMax, xAI, Fireworks.
async function callOpenAICompat(apiKey, body, endpoint, providerLabel) {
  const messages = (body.messages || []).map(m => ({ role: m.role, content: m.content }));
  if (body.system) messages.unshift({ role: 'system', content: body.system });
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: body.model, messages, max_tokens: body.max_tokens || 4096, temperature: body.temperature || 0.7 }),
  });
  if (!r.ok) { const errBody = await r.text().catch(() => ""); throw new Error(`${providerLabel} API error ${r.status}: ${errBody.slice(0, 200)}`); }
  const d = await r.json();
  return { content: [{ type: 'text', text: d.choices?.[0]?.message?.content || '' }], model: d.model, usage: d.usage };
}

async function callMoonshot(apiKey, body)   { return callOpenAICompat(apiKey, body, 'https://api.moonshot.ai/v1/chat/completions',          'Moonshot'); }
async function callZAI(apiKey, body)        { return callOpenAICompat(apiKey, body, 'https://open.bigmodel.cn/api/paas/v4/chat/completions', 'Z.AI'); }
async function callMinimax(apiKey, body)    { return callOpenAICompat(apiKey, body, 'https://api.minimax.io/v1/text/chatcompletion_v2',      'MiniMax'); }
async function callGrok(apiKey, body)       { return callOpenAICompat(apiKey, body, 'https://api.x.ai/v1/chat/completions',                  'Grok'); }
async function callFireworks(apiKey, body)  { return callOpenAICompat(apiKey, body, 'https://api.fireworks.ai/inference/v1/chat/completions', 'Fireworks'); }
async function callHyperbolic(apiKey, body) { return callOpenAICompat(apiKey, body, 'https://api.hyperbolic.xyz/v1/chat/completions',         'Hyperbolic'); }
async function callTogether(apiKey, body)   { return callOpenAICompat(apiKey, body, 'https://api.together.xyz/v1/chat/completions',          'Together'); }
async function callPerplexity(apiKey, body) { return callOpenAICompat(apiKey, body, 'https://api.perplexity.ai/chat/completions',            'Perplexity'); }
async function callDashscope(apiKey, body)  { return callOpenAICompat(apiKey, body, 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', 'DashScope'); }
async function callNvidia(apiKey, body)     { return callOpenAICompat(apiKey, body, 'https://integrate.api.nvidia.com/v1/chat/completions',  'Nvidia NIM'); }
// Baseten model URLs are deployment-specific; assume the model ID encodes the deployment.
async function callBaseten(apiKey, body)    { return callOpenAICompat(apiKey, body, 'https://inference.baseten.co/v1/chat/completions',       'Baseten'); }

const CALLERS = {
  anthropic: callAnthropic, openai: callOpenAI, google: callGoogle, groq: callGroq, deepseek: callDeepSeek,
  mistral: callMistral, openrouter: callOpenRouter, ollama: callOllama, cerebras: callCerebras, sambanova: callSambaNova,
  moonshot: callMoonshot, zai: callZAI, minimax: callMinimax, grok: callGrok, fireworks: callFireworks,
  hyperbolic: callHyperbolic, together: callTogether, perplexity: callPerplexity, dashscope: callDashscope,
  nvidia: callNvidia, baseten: callBaseten,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ── POST /api/ai?action=reset_quota — admin-only quota reset ──────────────
  if (req.query?.action === 'reset_quota') {
    const adminKey = process.env.ADMIN_KEY || '';
    const testAdminKey = process.env.TEST_ADMIN_KEY || '';
    const k = req.query?.k || req.body?.k || '';
    if (!k || (!adminKey && !testAdminKey) || ((() => { try { const { timingSafeEqual } = require("crypto"); const a = Buffer.from(String(k || "")); const b = Buffer.from(String(adminKey || "")); return a.length !== b.length || !timingSafeEqual(a, b); } catch { return true; } })() && k !== testAdminKey)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const monthKey = getMonthKey();
    const pool = await getUsagePool();
    if (pool) {
      await ensureQuotaTable(pool);
      const r = await pool.query(`DELETE FROM ${QUOTA_TABLE} WHERE window_key = $1`, [monthKey]);
      return res.status(200).json({ ok: true, deleted: r.rowCount, month: monthKey });
    }
    if (globalThis.__dynastyAiQuotaMem) globalThis.__dynastyAiQuotaMem.clear();
    return res.status(200).json({ ok: true, cleared: 'memory', month: monthKey });
  }

  // ── GET /api/ai?action=models — return available models with cost info ────
  if (req.method === 'GET' && req.query?.action === 'models') {
    let config = {};
    try { config = JSON.parse(process.env.DYNASTY_TOOL_CONFIG || '{}'); } catch { config = {}; }
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

  let config = {};
  try { config = JSON.parse(process.env.DYNASTY_TOOL_CONFIG || '{}'); } catch { config = {}; }
  const body = req.body || {};
  const usageContext = (body.usage_context || 'standard').toString();
  // Task-type routing: when caller doesn't pin a model, examine the prompt
  // and route to a specialist (code → Qwen3-Coder, reasoning → GLM-4.6,
  // long-context → Kimi K2, web/current → Perplexity Sonar, etc.).
  // Pinning a model bypasses this entirely. Set body.use_task_router=false
  // to force the legacy default.
  let requestedModel;
  let routedTask = null;
  if (body.model) {
    requestedModel = body.model.toString();
  } else if (body.use_task_router !== false) {
    // Pull last user message text for routing decision (falls back to system or first message).
    const msgs = Array.isArray(body.messages) ? body.messages : [];
    const lastUser = [...msgs].reverse().find(m => m && m.role === 'user');
    const sample = (lastUser && typeof lastUser.content === 'string' ? lastUser.content : '') || (typeof body.system === 'string' ? body.system : '') || (msgs[0] && typeof msgs[0].content === 'string' ? msgs[0].content : '');
    const routed = routeByTask(sample, config);
    requestedModel = routed.model;
    routedTask = routed.taskType;
  } else {
    requestedModel = 'gemini-2.0-flash';
  }
  const claimedTier = (body.tier || 'free').toString().toLowerCase();
  const stripeSessionId = (body.stripe_session_id || body.session_id || '').toString().trim();
  const accessToken = (body.access_token || '').toString().trim();
  const adminToken = (body.admin_token || '').toString().trim();
  const userId = (body.user_id || '').toString().trim();
  const actorKey = userId ? `u:${userId}` : `ip:${getClientIp(req)}`;
  let model = requestedModel;
  const adminBypass = await isValidAdminToken(adminToken);

  if (body.action === 'transcribe_audio') {
    if (usageContext !== 'free_scoring' && !adminBypass) {
      return res.status(400).json({
        error: 'Audio transcription is only available in free_scoring context.',
        code: 'transcription_context_invalid',
      });
    }
    const requestsToday = await incrementUsage(actorKey);
    const dailyRemaining = Math.max(0, FREE_SCORING_DAILY_LIMIT - requestsToday);
    res.setHeader('X-Free-Scoring-Limit', String(FREE_SCORING_DAILY_LIMIT));
    res.setHeader('X-Free-Scoring-Remaining', String(dailyRemaining));
    if (requestsToday > FREE_SCORING_DAILY_LIMIT) {
      res.setHeader('Retry-After', '60'); return res.status(429).json({
        error: `Daily scoring throttle reached (${FREE_SCORING_DAILY_LIMIT}/day). Try again tomorrow.`,
        code: 'scoring_daily_throttle_reached',
        limit: FREE_SCORING_DAILY_LIMIT
      });
    }
    const openaiKey = getApiKey('openai', config);
    if (!openaiKey) {
      return res.status(503).json({
        error: 'Audio transcription is temporarily unavailable (missing OpenAI key).',
        code: 'transcription_provider_unavailable',
      });
    }
    try {
      const text = await callOpenAITranscription(openaiKey, {
        audioBase64: String(body.audio_base64 || ''),
        mimeType: String(body.mime_type || 'audio/webm'),
        prompt: body.prompt || 'Transcribe spoken business ideas clearly and accurately.',
      });
      return res.status(200).json({ text, content: [{ type: 'text', text }] });
    } catch (err) {
      return res.status(500).json({
        error: 'Audio transcription failed',
        code: 'transcription_failed',
      });
    }
  }

  if (usageContext !== 'free_scoring' && !adminBypass) {
    const session = await fetchStripeCheckoutSession(stripeSessionId);
    const paidTier = paidTierFromSession(session);
    if (!paidTier) {
      return res.status(402).json({
        error: 'Paid access verification required for non-free AI usage.',
      });
    }
    const tokenOk = await isValidPaidAccessToken({
      token: accessToken,
      sessionId: stripeSessionId,
      userId,
      tier: paidTier,
    });
    if (!tokenOk) {
      return res.status(401).json({
        error: 'Invalid paid access token. Re-verify checkout session.',
      });
    }
    if (paidTier === 'scoring_pro') {
      return res.status(403).json({
        error: 'Scoring Pro only allows free_scoring usage context.',
      });
    }
    if (claimedTier !== 'free' && claimedTier !== paidTier && !(claimedTier === 'starter' && paidTier === 'foundation')) {
      return res.status(403).json({
        error: `Tier mismatch: session allows ${paidTier}, but request claimed ${claimedTier}.`,
      });
    }
  }

  // Scoring quota context — increment only after a successful model call
  let _scoringQuotaCtx = null;

  if (usageContext === 'free_scoring') {
    let scoringPlan = 'guest';
    let limit = FREE_GUEST_MONTHLY_LIMIT;
    let periodKey = getMonthKey();
    let quotaBucket = 'free_guest_monthly';
    let quotaActorKey = userId ? `u:${userId}` : `ip:${getClientIp(req)}`;

    if (userId) {
      scoringPlan = 'registered';
      limit = FREE_REGISTERED_MONTHLY_LIMIT;
      quotaBucket = 'free_registered_monthly';
    }

    if (!adminBypass && claimedTier === 'scoring_pro') {
      const session = await fetchStripeCheckoutSession(stripeSessionId);
      const paidTier = paidTierFromSession(session);
      if (paidTier !== 'scoring_pro') {
        return res.status(402).json({
          error: 'Scoring Pro verification required for unlimited scoring access.',
          code: 'scoring_pro_verification_required',
        });
      }
      const tokenOk = await isValidPaidAccessToken({
        token: accessToken,
        sessionId: stripeSessionId,
        userId,
        tier: paidTier,
      });
      if (!tokenOk) {
        return res.status(401).json({
          error: 'Invalid Scoring Pro token. Re-verify your subscription session.',
          code: 'scoring_pro_token_invalid',
        });
      }
      scoringPlan = 'scoring_pro';
      limit = SCORING_PRO_MONTHLY_LIMIT;
      quotaBucket = 'scoring_pro_monthly';
      quotaActorKey = userId ? `u:${userId}` : `pay:${stripeSessionId}`;
    }

    const requestsInPeriod = await getQuotaUsage(periodKey, quotaActorKey, quotaBucket);
    const remaining = Math.max(0, limit - requestsInPeriod);
    res.setHeader('X-Scoring-Plan', scoringPlan);
    res.setHeader('X-Scoring-Limit', String(limit));
    res.setHeader('X-Scoring-Remaining', String(remaining));
    if (requestsInPeriod >= limit) {
      if (scoringPlan === 'guest') {
        res.setHeader('Retry-After', '60'); return res.status(429).json({
          error: 'You\u2019ve used your free guest scores this month. Sign in with email to unlock more scores per month.',
          code: 'scoring_guest_limit_reached',
          limit,
        });
      }
      if (scoringPlan === 'registered') {
        res.setHeader('Retry-After', '60'); return res.status(429).json({
          error: 'You\u2019ve used your registered free scores this month. Upgrade to Scoring Pro for ongoing access.',
          code: 'scoring_registered_limit_reached',
          limit,
        });
      }
      res.setHeader('Retry-After', '60'); return res.status(429).json({
        error: `Scoring Pro fair-use limit reached (${SCORING_PRO_MONTHLY_LIMIT}/month). Contact support to raise your limit.`,
        code: 'scoring_pro_fair_use_reached',
        limit: SCORING_PRO_MONTHLY_LIMIT,
      });
    }

    const requestsToday = await incrementUsage(actorKey);
    const dailyRemaining = Math.max(0, FREE_SCORING_DAILY_LIMIT - requestsToday);
    res.setHeader('X-Free-Scoring-Limit', String(FREE_SCORING_DAILY_LIMIT));
    res.setHeader('X-Free-Scoring-Remaining', String(dailyRemaining));
    if (requestsToday > FREE_SCORING_DAILY_LIMIT) {
      res.setHeader('Retry-After', '60'); return res.status(429).json({
        error: `Daily scoring throttle reached (${FREE_SCORING_DAILY_LIMIT}/day). Try again tomorrow.`,
        code: 'scoring_daily_throttle_reached',
        limit: FREE_SCORING_DAILY_LIMIT
      });
    }
    const chosenFree = resolveFreeModel(config);
    if (!chosenFree) {
      return res.status(503).json({ error: 'No free scoring models are currently available. Please try again shortly.' });
    }
    if (!PROVIDERS[model]?.free) model = chosenFree;
    _scoringQuotaCtx = { periodKey, quotaActorKey, quotaBucket };
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
    if (result?.error && !result?.content) {
      const msg = typeof result.error === 'string' ? result.error : (result.error?.message || 'AI provider error');
      return res.status(502).json({ error: msg, provider: info.provider, model });
    }
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
    if (routedTask) result._routed_task = routedTask;
    // Only count quota AFTER successful model call (failed calls shouldn't consume quota)
    if (_scoringQuotaCtx) {
      await incrementQuotaUsage(_scoringQuotaCtx.periodKey, _scoringQuotaCtx.quotaActorKey, _scoringQuotaCtx.quotaBucket).catch(() => {});
    }
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: 'AI call failed', provider: info.provider, model });
  }
}
