// ── Your Deputy v2 — Multi-Model AI Router (FREE-ONLY) ──────────────────
// All entries below are free-tier providers. Paid providers (Anthropic,
// OpenAI, paid Mistral, paid Grok, paid Perplexity Sonar Pro) were
// purged to guarantee zero inference cost. Gemini 2.5 Pro / 2.5 Flash
// are kept because Google AI Studio ships them with a free quota tier.
import { aiCorsHeaders } from './_ai_security.mjs';
import { verifyAdminCredential } from './tenants/_auth.mjs';

export const maxDuration = 300;

const PROVIDERS = {
  // ── Google (all via AI Studio free tier) ───────────────────────────────
  'gemini-2.5-pro':             { provider: 'google', label: 'Gemini 2.5 Pro',      costPer1kIn: 0, costPer1kOut: 0, free: true },
  'gemini-2.5-flash':           { provider: 'google', label: 'Gemini 2.5 Flash',    costPer1kIn: 0, costPer1kOut: 0, free: true },
  'gemini-2.0-flash':           { provider: 'google', label: 'Gemini 2.0 Flash',    costPer1kIn: 0, costPer1kOut: 0, free: true },
  'gemma-4-31b-it':             { provider: 'google', label: 'Gemma 4 31B',         costPer1kIn: 0, costPer1kOut: 0, free: true },
  'gemma-4-26b-a4b-it':         { provider: 'google', label: 'Gemma 4 26B MoE',     costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── Groq (free tier) ──────────────────────────────────────────────────────
  'llama-3.3-70b-versatile':    { provider: 'groq', label: 'Llama 3.3 70B',  costPer1kIn: 0, costPer1kOut: 0, free: true },
  'llama-3.1-8b-instant':       { provider: 'groq', label: 'Llama 3.1 8B',   costPer1kIn: 0, costPer1kOut: 0, free: true },
  'mixtral-8x7b-32768':         { provider: 'groq', label: 'Mixtral 8x7B',   costPer1kIn: 0, costPer1kOut: 0, free: true },
  'gemma2-9b-it':               { provider: 'groq', label: 'Gemma 2 9B',     costPer1kIn: 0, costPer1kOut: 0, free: true },
  'openai/gpt-oss-120b':        { provider: 'groq', label: 'GPT-OSS 120B (Groq)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  'openai/gpt-oss-20b':         { provider: 'groq', label: 'GPT-OSS 20B (Groq)',  costPer1kIn: 0, costPer1kOut: 0, free: true },
  'deepseek-r1-distill-llama-70b': { provider: 'groq', label: 'DeepSeek R1 Distill Llama 70B (Groq)', costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── OpenRouter (aggregator — free models only) ────────────────────────────
  'meta-llama/llama-3.3-70b-instruct:free': { provider: 'openrouter', label: 'Llama 3.3 70B (OR)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  'google/gemma-2-9b-it:free':               { provider: 'openrouter', label: 'Gemma 2 9B (OR)',    costPer1kIn: 0, costPer1kOut: 0, free: true },
  'microsoft/phi-3-mini-128k-instruct:free': { provider: 'openrouter', label: 'Phi-3 Mini (OR)',    costPer1kIn: 0, costPer1kOut: 0, free: true },
  'deepseek/deepseek-chat-v3.1:free':        { provider: 'openrouter', label: 'DeepSeek V3.1 (OR)',  costPer1kIn: 0, costPer1kOut: 0, free: true },
  'qwen/qwen3-coder:free':                   { provider: 'openrouter', label: 'Qwen3 Coder (OR)',    costPer1kIn: 0, costPer1kOut: 0, free: true },
  'meta-llama/llama-4-maverick:free':        { provider: 'openrouter', label: 'Llama 4 Maverick (OR)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  'z-ai/glm-4.5-air:free':                   { provider: 'openrouter', label: 'GLM-4.5 Air (OR)',    costPer1kIn: 0, costPer1kOut: 0, free: true },
  'nousresearch/hermes-3-llama-3.1-405b:free': { provider: 'openrouter', label: 'Hermes 3 Llama 405B (OR)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  'nvidia/llama-3.1-nemotron-70b-instruct:free': { provider: 'openrouter', label: 'Nemotron 70B (OR)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  'mistralai/mistral-nemo:free':             { provider: 'openrouter', label: 'Mistral Nemo (OR)',    costPer1kIn: 0, costPer1kOut: 0, free: true },
  'mistralai/mistral-7b-instruct:free':      { provider: 'openrouter', label: 'Mistral 7B (OR)',     costPer1kIn: 0, costPer1kOut: 0, free: true },
  'qwen/qwen-2.5-72b-instruct:free':         { provider: 'openrouter', label: 'Qwen 2.5 72B (OR)',   costPer1kIn: 0, costPer1kOut: 0, free: true },
  'qwen/qwen-2.5-coder-32b-instruct:free':   { provider: 'openrouter', label: 'Qwen 2.5 Coder 32B (OR)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  'google/gemini-2.0-flash-exp:free':        { provider: 'openrouter', label: 'Gemini 2.0 Flash Exp (OR)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  'tencent/hunyuan-a13b-instruct:free':      { provider: 'openrouter', label: 'Hunyuan A13B (OR)',   costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── Ollama (self-hosted — any model you run locally) ──────────────────
  'ollama/gemma4':                { provider: 'ollama', label: 'Gemma 4 (Ollama)',     costPer1kIn: 0, costPer1kOut: 0, free: true },
  'ollama/gemma3':                { provider: 'ollama', label: 'Gemma 3 (Ollama)',     costPer1kIn: 0, costPer1kOut: 0, free: true },
  'ollama/gemma3n':               { provider: 'ollama', label: 'Gemma 3n (Ollama)',    costPer1kIn: 0, costPer1kOut: 0, free: true },
  'ollama/llama3.3':              { provider: 'ollama', label: 'Llama 3.3 (Ollama)',   costPer1kIn: 0, costPer1kOut: 0, free: true },
  'ollama/deepseek-r1':           { provider: 'ollama', label: 'DeepSeek R1 (Ollama)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  'ollama/qwen3':                 { provider: 'ollama', label: 'Qwen 3 (Ollama)',      costPer1kIn: 0, costPer1kOut: 0, free: true },
  'ollama/qwen3-coder':           { provider: 'ollama', label: 'Qwen3 Coder (Ollama)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  'ollama/gpt-oss:120b':          { provider: 'ollama', label: 'GPT-OSS 120B (Ollama)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  'ollama/gpt-oss:20b':           { provider: 'ollama', label: 'GPT-OSS 20B (Ollama)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  'ollama/devstral':              { provider: 'ollama', label: 'Devstral (Ollama)',    costPer1kIn: 0, costPer1kOut: 0, free: true },
  'ollama/devstral-small':        { provider: 'ollama', label: 'Devstral Small (Ollama)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  'ollama/magistral':             { provider: 'ollama', label: 'Magistral Small (Ollama)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  'ollama/phi4':                  { provider: 'ollama', label: 'Phi-4 (Ollama)',       costPer1kIn: 0, costPer1kOut: 0, free: true },
  'ollama/phi4-mini':             { provider: 'ollama', label: 'Phi-4 Mini (Ollama)',  costPer1kIn: 0, costPer1kOut: 0, free: true },
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

  // ── Fireworks.ai (free tier hosting — Llama 4 + Qwen + DeepSeek) ─────
  'accounts/fireworks/models/llama-v3p3-70b-instruct': { provider: 'fireworks', label: 'Llama 3.3 70B (Fireworks)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  'accounts/fireworks/models/qwen2p5-72b-instruct':    { provider: 'fireworks', label: 'Qwen 2.5 72B (Fireworks)',  costPer1kIn: 0, costPer1kOut: 0, free: true },
  'accounts/fireworks/models/deepseek-v3':             { provider: 'fireworks', label: 'DeepSeek V3 (Fireworks)',   costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── Hyperbolic (free tier — hosts open-weights) ──────────────────────
  'meta-llama/Llama-3.3-70B-Instruct':           { provider: 'hyperbolic', label: 'Llama 3.3 70B (Hyperbolic)',     costPer1kIn: 0, costPer1kOut: 0, free: true },
  'deepseek-ai/DeepSeek-V3':                     { provider: 'hyperbolic', label: 'DeepSeek V3 (Hyperbolic)',       costPer1kIn: 0, costPer1kOut: 0, free: true },
  'Qwen/Qwen2.5-Coder-32B-Instruct':             { provider: 'hyperbolic', label: 'Qwen 2.5 Coder 32B (Hyperbolic)', costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── Together AI (free tier — Llama 4 + Qwen3 Coder + DeepSeek V3.2) ──
  'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free':                 { provider: 'together', label: 'Llama 3.3 70B Turbo Free (Together)',     costPer1kIn: 0, costPer1kOut: 0, free: true },
  'meta-llama/Llama-4-Scout-17B-16E-Instruct':                    { provider: 'together', label: 'Llama 4 Scout (Together)',                costPer1kIn: 0, costPer1kOut: 0, free: true },
  'deepseek-ai/DeepSeek-V3.2-Exp':                                { provider: 'together', label: 'DeepSeek V3.2 Exp (Together)',            costPer1kIn: 0, costPer1kOut: 0, free: true },
  'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8':                      { provider: 'together', label: 'Qwen3 Coder 480B (Together)',             costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── Perplexity Sonar (free tier — grounded web search, unique) ───────
  'sonar':                       { provider: 'perplexity', label: 'Sonar (Perplexity)',       costPer1kIn: 0, costPer1kOut: 0, free: true },

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
  'Meta-Llama-3.1-405B-Instruct':                         { provider: 'sambanova', label: 'Llama 3.1 405B (SambaNova)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  'Meta-Llama-3.1-8B-Instruct':                           { provider: 'sambanova', label: 'Llama 3.1 8B (SambaNova)',   costPer1kIn: 0, costPer1kOut: 0, free: true },
  'Qwen2.5-72B-Instruct':                                 { provider: 'sambanova', label: 'Qwen 2.5 72B (SambaNova)',   costPer1kIn: 0, costPer1kOut: 0, free: true },
  'DeepSeek-V3-0324':                                     { provider: 'sambanova', label: 'DeepSeek V3-0324 (SambaNova)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  // Cerebras — Qwen 3 + GPT-OSS
  'qwen-3-32b':                                           { provider: 'cerebras', label: 'Qwen 3 32B (Cerebras)',       costPer1kIn: 0, costPer1kOut: 0, free: true },
  'qwen-3-235b-a22b-instruct-2507':                       { provider: 'cerebras', label: 'Qwen 3 235B (Cerebras)',      costPer1kIn: 0, costPer1kOut: 0, free: true },
  'gpt-oss-120b':                                         { provider: 'cerebras', label: 'GPT-OSS 120B (Cerebras)',     costPer1kIn: 0, costPer1kOut: 0, free: true },
  // Z.AI — GLM-4.6
  'glm-4.6':                                              { provider: 'zai',  label: 'GLM-4.6 (Z.AI)',          costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── GitHub Models (free via GITHUB_TOKEN — no separate API key needed) ──
  'openai/gpt-oss-120b@github':                           { provider: 'github', label: 'GPT-OSS 120B (GitHub)',       costPer1kIn: 0, costPer1kOut: 0, free: true },
  'meta/Llama-3.3-70B-Instruct':                          { provider: 'github', label: 'Llama 3.3 70B (GitHub)',      costPer1kIn: 0, costPer1kOut: 0, free: true },
  'deepseek/DeepSeek-R1':                                 { provider: 'github', label: 'DeepSeek R1 (GitHub)',        costPer1kIn: 0, costPer1kOut: 0, free: true },
  'microsoft/Phi-4':                                      { provider: 'github', label: 'Phi-4 (GitHub)',              costPer1kIn: 0, costPer1kOut: 0, free: true },
  'mistral-ai/Mistral-Large-2411':                        { provider: 'github', label: 'Mistral Large (GitHub)',      costPer1kIn: 0, costPer1kOut: 0, free: true },
  'cohere/cohere-command-r-plus':                         { provider: 'github', label: 'Command R+ (GitHub)',         costPer1kIn: 0, costPer1kOut: 0, free: true },
  'xai/grok-3':                                           { provider: 'github', label: 'Grok 3 (GitHub)',             costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── Cloudflare Workers AI (10k neurons/day free — edge inference) ──
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast':             { provider: 'cloudflare', label: 'Llama 3.3 70B FP8 Fast (CF)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  '@cf/meta/llama-3.1-70b-instruct':                      { provider: 'cloudflare', label: 'Llama 3.1 70B (CF)',          costPer1kIn: 0, costPer1kOut: 0, free: true },
  '@cf/qwen/qwen2.5-coder-32b-instruct':                  { provider: 'cloudflare', label: 'Qwen 2.5 Coder 32B (CF)',     costPer1kIn: 0, costPer1kOut: 0, free: true },
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b':         { provider: 'cloudflare', label: 'DeepSeek R1 Distill 32B (CF)', costPer1kIn: 0, costPer1kOut: 0, free: true },
  '@cf/google/gemma-3-12b-it':                            { provider: 'cloudflare', label: 'Gemma 3 12B (CF)',            costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── Chutes.ai (decentralized Bittensor-backed — genuinely unlimited free) ──
  'deepseek-ai/DeepSeek-V3-0324@chutes':                  { provider: 'chutes', label: 'DeepSeek V3 (Chutes)',          costPer1kIn: 0, costPer1kOut: 0, free: true },
  'meta-llama/Llama-3.3-70B-Instruct@chutes':             { provider: 'chutes', label: 'Llama 3.3 70B (Chutes)',        costPer1kIn: 0, costPer1kOut: 0, free: true },
  'Qwen/Qwen3-235B-A22B@chutes':                          { provider: 'chutes', label: 'Qwen 3 235B (Chutes)',          costPer1kIn: 0, costPer1kOut: 0, free: true },

  // ── Inception Labs Mercury (diffusion LLM — 10x faster parallel generation) ──
  'mercury':                                              { provider: 'inception', label: 'Mercury (Inception)',        costPer1kIn: 0, costPer1kOut: 0, free: true },
  'mercury-coder':                                        { provider: 'inception', label: 'Mercury Coder (Inception)',  costPer1kIn: 0, costPer1kOut: 0, free: true },
};

const FREE_SCORING_DAILY_LIMIT = Math.max(1, parseInt(process.env.FREE_SCORING_DAILY_LIMIT || '30', 10));
const FREE_GUEST_MONTHLY_LIMIT = Math.max(1, parseInt(process.env.FREE_GUEST_SCORING_LIMIT || '15', 10));
const FREE_REGISTERED_MONTHLY_LIMIT = Math.max(1, parseInt(process.env.FREE_REGISTERED_SCORING_LIMIT || '30', 10));
const SCORING_PRO_MONTHLY_LIMIT = Math.max(50, parseInt(process.env.SCORING_PRO_MONTHLY_LIMIT || '200', 10));
const USAGE_TABLE = 'dynasty_ai_usage_daily';
const QUOTA_TABLE = 'dynasty_ai_quota_usage';
const PAID_TIERS = new Set(['foundation', 'starter', 'professional', 'enterprise', 'managed', 'custom_volume', 'scoring_pro']);

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
  // FREE-ONLY preferred order. First match with a working API key wins.
  // All entries below are genuinely free tier (no per-token charges).
  const preferred = [
    // Frontier tier — GPT-OSS, Llama 4, GLM-4.6, DeepSeek R1, Qwen 3
    'openai/gpt-oss-120b',                         // Groq GPT-OSS 120B (OpenAI open-weight)
    'ollama/gpt-oss:120b',                         // Self-hosted GPT-OSS 120B
    'gpt-oss-120b',                                // Cerebras GPT-OSS 120B
    'meta-llama/llama-4-scout-17b-16e-instruct',   // Groq Llama 4 Scout
    'llama-4-scout-17b-16e-instruct',              // Cerebras Llama 4 Scout
    'deepseek-r1-distill-llama-70b',               // Groq DeepSeek R1 Distill (reasoning specialist)
    'glm-4.6', 'glm-4.5',                          // Z.AI
    'gemini-2.5-pro',                              // Google (free tier)
    'DeepSeek-R1',                                 // SambaNova
    'Meta-Llama-3.1-405B-Instruct',                // SambaNova Llama 3.1 405B
    'qwen3-max',                                   // Alibaba
    'kimi-k2-0905-preview',                        // Moonshot
    'meta/llama-4-maverick-17b-128e-instruct',     // Nvidia
    'openai/gpt-oss-120b@github',                  // GitHub Models GPT-OSS
    'deepseek/DeepSeek-R1',                        // GitHub Models DeepSeek R1

    // Workhorses
    'gemma-4-31b-it', 'gemma-4-26b-a4b-it', 'gemini-2.0-flash', 'gemini-2.5-flash',
    'qwen-3-235b-a22b-instruct-2507',              // Cerebras Qwen 3 235B
    'qwen-3-32b',                                  // Cerebras Qwen 3 32B
    'llama-3.3-70b-versatile',
    'llama-3.3-70b',
    'Meta-Llama-3.3-70B-Instruct',
    'meta-llama/Llama-3.3-70B-Instruct',
    'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
    'deepseek-ai/DeepSeek-V3.2-Exp',
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',    // Cloudflare Workers AI
    'deepseek-ai/DeepSeek-V3-0324@chutes',         // Chutes (unlimited free)
    'meta/Llama-3.3-70B-Instruct',                 // GitHub Models Llama 3.3

    // Specialists
    'qwen3-coder-plus',
    'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8',
    'ollama/qwen3-coder',
    'ollama/devstral',
    'ollama/magistral',
    '@cf/qwen/qwen2.5-coder-32b-instruct',
    'MiniMax-M1',
    'mercury',                                     // Inception diffusion LLM
    'openai/gpt-oss-20b',                          // Groq smaller GPT-OSS
    'ollama/gpt-oss:20b',                          // Self-hosted smaller GPT-OSS
    'ollama/gemma3',
    'ollama/gemma3n',
    'ollama/phi4',
    'ollama/phi4-mini',
    'microsoft/Phi-4',                             // GitHub Phi-4
    'nousresearch/hermes-3-llama-3.1-405b:free',                // via OpenRouter
    'nvidia/llama-3.1-nemotron-70b-instruct:free', // via OpenRouter

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
  general:      ['openai/gpt-oss-120b', 'ollama/gpt-oss:120b', 'gemini-2.5-pro', 'glm-4.6', 'meta-llama/llama-4-scout-17b-16e-instruct', 'gpt-oss-120b', 'ollama/gemma3', 'deepseek-ai/DeepSeek-V3-0324@chutes', 'gemini-2.0-flash'],
  code:         ['qwen3-coder-plus', 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8', 'ollama/qwen3-coder', 'ollama/devstral', 'qwen/qwen3-coder:free', 'deepseek-ai/DeepSeek-V3.2-Exp', '@cf/qwen/qwen2.5-coder-32b-instruct', 'mercury-coder', 'qwen/qwen-2.5-coder-32b-instruct:free'],
  reasoning:    ['deepseek-r1-distill-llama-70b', 'DeepSeek-R1', 'ollama/deepseek-r1', 'ollama/magistral', 'glm-4.6', 'openai/gpt-oss-120b', 'ollama/gpt-oss:120b', 'deepseek/DeepSeek-R1', 'gemini-2.5-pro', 'qwen-qwq-32b', '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'],
  long_context: ['kimi-k2-0905-preview', 'MiniMax-M1', 'gemini-2.5-pro', 'moonshotai/kimi-k2-instruct'],
  web_current:  ['sonar', 'gemini-2.5-pro'],
  vision:       ['gemini-2.5-pro', 'gemini-2.0-flash', 'qwen3-vl-plus', 'ollama/gemma3n'],
  structured:   ['llama-3.3-70b', 'openai/gpt-oss-120b', 'llama-3.3-70b-versatile', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'gemini-2.0-flash', 'Meta-Llama-3.3-70B-Instruct'],
  creative:     ['kimi-k2-0905-preview', 'moonshotai/kimi-k2-instruct', 'glm-4.6', 'nousresearch/hermes-3-llama-3.1-405b:free', 'gemini-2.5-pro'],
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
  // FREE-ONLY: Anthropic/OpenAI/Grok/Mistral/DeepSeek providers removed
  // from the registry. Their API key entries are intentionally omitted
  // here so any lingering reference fails fast rather than silently
  // spending money.
  const keys = {
    google:      pickRotated(process.env.GOOGLE_AI_KEY, process.env.GEMINI_API_KEY, config?.ai?.google_ai),
    groq:        pickRotated(process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_2, config?.ai?.groq),
    openrouter:  process.env.OPENROUTER_API_KEY || config?.ai?.openrouter,
    ollama:      process.env.OLLAMA_URL || config?.ai?.ollama_url || null,
    cerebras:    process.env.CEREBRAS_API_KEY || config?.ai?.cerebras,
    sambanova:   process.env.SAMBANOVA_API_KEY || config?.ai?.sambanova,
    moonshot:    process.env.MOONSHOT_API_KEY || config?.ai?.moonshot,
    zai:         process.env.ZAI_API_KEY || process.env.Z_AI_API_KEY || config?.ai?.zai,
    minimax:     process.env.MINIMAX_API_KEY || config?.ai?.minimax,
    fireworks:   process.env.FIREWORKS_API_KEY || config?.ai?.fireworks,
    hyperbolic:  process.env.HYPERBOLIC_API_KEY || config?.ai?.hyperbolic,
    together:    process.env.TOGETHER_API_KEY || config?.ai?.together,
    perplexity:  process.env.PERPLEXITY_API_KEY || config?.ai?.perplexity,
    dashscope:   process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || config?.ai?.dashscope,
    nvidia:      process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY || config?.ai?.nvidia,
    baseten:     process.env.BASETEN_API_KEY || config?.ai?.baseten,
    github:      process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN || config?.ai?.github,
    cloudflare:  process.env.CLOUDFLARE_API_TOKEN || config?.ai?.cloudflare,
    chutes:      process.env.CHUTES_API_KEY || config?.ai?.chutes,
    inception:   process.env.INCEPTION_API_KEY || config?.ai?.inception,
  };
  return keys[provider] || null;
}

// callAnthropic / callOpenAI removed — free-only routing.
// callOpenAITranscription kept for audio-to-text (requires OpenAI key;
// unused unless user explicitly calls the transcription flow).

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
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
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

// callDeepSeek removed — free-only routing (DeepSeek V3 / R1 still reachable via Together / Hyperbolic / Fireworks free tiers).

// callMistral removed — free-only routing.

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
// callGrok removed — free-only routing.
async function callFireworks(apiKey, body)  { return callOpenAICompat(apiKey, body, 'https://api.fireworks.ai/inference/v1/chat/completions', 'Fireworks'); }
async function callHyperbolic(apiKey, body) { return callOpenAICompat(apiKey, body, 'https://api.hyperbolic.xyz/v1/chat/completions',         'Hyperbolic'); }
async function callTogether(apiKey, body)   { return callOpenAICompat(apiKey, body, 'https://api.together.xyz/v1/chat/completions',          'Together'); }
async function callPerplexity(apiKey, body) { return callOpenAICompat(apiKey, body, 'https://api.perplexity.ai/chat/completions',            'Perplexity'); }
async function callDashscope(apiKey, body)  { return callOpenAICompat(apiKey, body, 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', 'DashScope'); }
async function callNvidia(apiKey, body)     { return callOpenAICompat(apiKey, body, 'https://integrate.api.nvidia.com/v1/chat/completions',  'Nvidia NIM'); }
// Baseten model URLs are deployment-specific; assume the model ID encodes the deployment.
async function callBaseten(apiKey, body)    { return callOpenAICompat(apiKey, body, 'https://inference.baseten.co/v1/chat/completions',       'Baseten'); }

// GitHub Models — OpenAI-compatible endpoint gated behind GitHub PAT. Free tier
// per-model quotas (e.g. GPT-OSS-120B 15 RPM / 150 RPD). Strip the "@github"
// suffix we use internally to disambiguate from the Groq-hosted copies.
async function callGithubModels(apiKey, body) {
  const model = (body.model || '').replace(/@github$/, '');
  return callOpenAICompat(apiKey, { ...body, model }, 'https://models.github.ai/inference/chat/completions', 'GitHub Models');
}

// Cloudflare Workers AI — OpenAI-compatible gateway. Requires BOTH the API
// token and the account ID (url-embedded). 10k neurons/day free.
async function callCloudflare(apiKey, body) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
  if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID env var required for Cloudflare Workers AI');
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
  return callOpenAICompat(apiKey, body, endpoint, 'Cloudflare Workers AI');
}

// Chutes.ai — Bittensor-backed decentralized inference. OpenAI-compatible.
// Strip the "@chutes" disambiguation suffix.
async function callChutes(apiKey, body) {
  const model = (body.model || '').replace(/@chutes$/, '');
  return callOpenAICompat(apiKey, { ...body, model }, 'https://llm.chutes.ai/v1/chat/completions', 'Chutes');
}

// Inception Labs Mercury — diffusion LLM, OpenAI-compatible.
async function callInception(apiKey, body) {
  return callOpenAICompat(apiKey, body, 'https://api.inceptionlabs.ai/v1/chat/completions', 'Inception');
}

// FREE-ONLY: anthropic/openai/deepseek/mistral/grok callers purged.
const CALLERS = {
  google: callGoogle, groq: callGroq, openrouter: callOpenRouter, ollama: callOllama,
  cerebras: callCerebras, sambanova: callSambaNova,
  moonshot: callMoonshot, zai: callZAI, minimax: callMinimax, fireworks: callFireworks,
  hyperbolic: callHyperbolic, together: callTogether, perplexity: callPerplexity,
  dashscope: callDashscope, nvidia: callNvidia, baseten: callBaseten,
  github: callGithubModels, cloudflare: callCloudflare, chutes: callChutes, inception: callInception,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', aiCorsHeaders());
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ── POST /api/ai?action=reset_quota — admin-only quota reset ──────────────
  if (req.query?.action === 'reset_quota') {
    const adminAuth = verifyAdminCredential(req);
    if (!adminAuth.ok) return res.status(adminAuth.status || 403).json({ error: 'Unauthorized' });
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
  const userId = (body.user_id || '').toString().trim();
  const actorKey = userId ? `u:${userId}` : `ip:${getClientIp(req)}`;
  let model = requestedModel;
  const adminBypass = verifyAdminCredential(req).ok;

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

  // ── Build fallback candidate list ──
  // When the primary model fails with a quota/rate error, we transparently
  // fall through to other free providers with valid API keys. This protects
  // against a single provider's quota being zero'd out (common with Gemini
  // when the underlying Cloud project has billing but no paid Gemini tier).
  let candidates = [model];
  if (routedTask) {
    const taskKey = routedTask.replace(/_fallback$/, '');
    const extras = (TASK_FALLBACKS[taskKey] || [])
      .filter(m => m !== model && PROVIDERS[m] && getApiKey(PROVIDERS[m].provider, config));
    candidates = [model, ...extras];
  } else {
    // Client pinned a model — still add free fallbacks for resilience
    const extras = Object.entries(PROVIDERS)
      .filter(([id, i]) => id !== model && i.free && getApiKey(i.provider, config))
      .map(([id]) => id)
      .slice(0, 8);
    candidates = [model, ...extras];
  }

  const TRANSIENT_RE = /quota|rate[-_ ]?limit|overload|429|exceeded|limit:\s*0|ECONNRESET|ETIMEDOUT|fetch failed|timeout|unavailable|503|502|upstream/i;
  let lastError = null;
  let lastProvider = info.provider;
  let lastCandidate = model;

  for (const candidate of candidates) {
    const cInfo = PROVIDERS[candidate];
    if (!cInfo) continue;
    const cApiKey = getApiKey(cInfo.provider, config);
    if (!cApiKey) continue;
    const cCaller = CALLERS[cInfo.provider];
    if (!cCaller) continue;
    lastCandidate = candidate;
    lastProvider = cInfo.provider;

    try {
      const result = await cCaller(cApiKey, { ...body, model: candidate });
      if (result?.error && !result?.content) {
        const msg = typeof result.error === 'string' ? result.error : (result.error?.message || 'AI provider error');
        if (TRANSIENT_RE.test(msg)) {
          lastError = msg;
          console.warn(`[ai-fallback] ${candidate} (${cInfo.provider}) transient: ${msg.slice(0, 140)}`);
          continue;
        }
        return res.status(502).json({ error: msg, provider: cInfo.provider, model: candidate });
      }
      const inputTokens = result.usage?.input_tokens || result.usage?.prompt_tokens || 0;
      const outputTokens = result.usage?.output_tokens || result.usage?.completion_tokens || 0;
      result._cost = {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost: cInfo.free ? 0 : ((inputTokens / 1000) * cInfo.costPer1kIn + (outputTokens / 1000) * cInfo.costPer1kOut),
        model: candidate,
        provider: cInfo.provider,
      };
      if (routedTask) result._routed_task = routedTask;
      if (candidate !== model) result._fell_back_from = model;
      if (_scoringQuotaCtx) {
        await incrementQuotaUsage(_scoringQuotaCtx.periodKey, _scoringQuotaCtx.quotaActorKey, _scoringQuotaCtx.quotaBucket).catch(() => {});
      }
      return res.status(200).json(result);
    } catch (err) {
      const msg = err?.message || String(err);
      lastError = msg;
      console.warn(`[ai-fallback] ${candidate} (${cInfo.provider}) threw: ${msg.slice(0, 140)}`);
      if (TRANSIENT_RE.test(msg)) continue;
      continue;
    }
  }

  return res.status(502).json({
    error: `All free providers exhausted. Last: ${lastError ? lastError.slice(0, 200) : 'unknown'}`,
    provider: lastProvider,
    model: lastCandidate,
    tried: candidates.slice(0, 6),
  });
}
