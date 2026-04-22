// Vercel AI SDK wrapper — typed, multi-provider, with Langfuse tracing.
//
// This is the new path for structured AI calls (scoring, pivot proposals,
// framework synthesis, etc.). It replaces the pattern of:
//
//   const raw = await aiRawWithModel(prompt, model, max);
//   const match = raw.match(/\{[\s\S]*\}/);
//   if (!match) throw new Error('No JSON');
//   const parsed = JSON.parse(match[0]);
//
// which silently drops any response whose JSON is malformed or shape-wrong.
// Here, `generateObject(schema)` either returns a validated typed object or
// throws a Zod-typed error with the field-level reason — retryable without
// guesswork.
//
// The legacy `api/ai.js` endpoint remains for backward compatibility while
// callers migrate; this file is the new endpoint at `/api/ai-sdk`.
export const maxDuration = 300;

import { generateObject, generateText, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { SCHEMAS } from './_schemas.js';
import { startTrace } from './_langfuse.js';

const sanitize = (s) => String(s || '').replace(/[\r\n]/g, ' ').slice(0, 500);

// Map a model id (as used today in the client) to an AI SDK provider+model.
// Free/paid, open-weight/closed mix — same pool the legacy router already
// routes across. New entries can be added without touching call sites.
//
// If LITELLM_BASE_URL is set, every model id gets routed through the LiteLLM
// gateway instead of the vendor-specific SDK. LiteLLM exposes an OpenAI-
// compatible /v1 endpoint that proxies 100+ providers with unified auth,
// cost tracking, and rate-limit-aware fallback — centralizing the routing
// concerns that are currently scattered across api/ai.js + resolveProvider.
function resolveProvider(modelId) {
  const id = String(modelId || '').toLowerCase();

  // LiteLLM gateway override — takes precedence over per-vendor SDKs when
  // LITELLM_BASE_URL is configured. The gateway handles model-to-provider
  // mapping, cost caps, and per-project rate-limiting server-side.
  const liteLLMBase = process.env.LITELLM_BASE_URL;
  if (liteLLMBase) {
    const apiKey = process.env.LITELLM_API_KEY || 'sk-dummy';
    const lite = createOpenAI({ apiKey, baseURL: liteLLMBase, compatibility: 'compatible' });
    return { provider: 'litellm', model: lite(modelId) };
  }

  // Groq (free-tier workhorses)
  if (id.startsWith('llama-') || id.includes('mixtral') || id.startsWith('gemma2') || id.includes('llama-4-scout') || id.includes('deepseek-r1')) {
    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey) {
      const groq = createGroq({ apiKey });
      return { provider: 'groq', model: groq(modelId) };
    }
  }

  // Google (Gemini + Gemma)
  if (id.startsWith('gemini-') || id.startsWith('gemma-') || id.includes('gemma-4')) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (apiKey) {
      const google = createGoogleGenerativeAI({ apiKey });
      return { provider: 'google', model: google(modelId) };
    }
  }

  // Anthropic
  if (id.startsWith('claude-')) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      const anthropic = createAnthropic({ apiKey });
      return { provider: 'anthropic', model: anthropic(modelId) };
    }
  }

  // OpenRouter (proxies 100+ free/paid open-weight models with OpenAI-compatible API)
  if (id.includes('/') || id.startsWith('openrouter/')) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      const or = createOpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1', compatibility: 'compatible' });
      return { provider: 'openrouter', model: or(modelId.replace(/^openrouter\//, '')) };
    }
  }

  // OpenAI (and OpenAI-compatible)
  if (id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3')) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      const oa = createOpenAI({ apiKey });
      return { provider: 'openai', model: oa(modelId) };
    }
  }

  return null;
}

// Fallback chain. Same priority the client uses today: free open-weight first,
// then free hosted tiers, then paid. Each entry is tried in order until one
// yields a schema-valid response.
function fallbackChain(preferred) {
  const chain = [preferred].filter(Boolean);
  // Free open-weight workhorses via Google (Gemma) + Groq
  const free = ['gemma-4-31b-it', 'gemma-4-26b-a4b-it', 'gemini-2.0-flash', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
  for (const m of free) if (!chain.includes(m)) chain.push(m);
  return chain;
}

// ── Core: typed structured generation ────────────────────────────────────────
export async function generateTyped({ schemaName, prompt, model: preferredModel, sessionId, userId, temperature, maxTokens, traceName }) {
  const schema = SCHEMAS[schemaName];
  if (!schema) throw new Error(`Unknown schema: ${schemaName}`);
  const chain = fallbackChain(preferredModel);
  const trace = await startTrace({ name: traceName || `typed:${schemaName}`, sessionId, userId, metadata: { schemaName, preferredModel } });
  const errors = [];
  for (const modelId of chain) {
    const resolved = resolveProvider(modelId);
    if (!resolved) { errors.push(`${modelId}: no provider key`); continue; }
    const start = Date.now();
    try {
      const result = await generateObject({
        model: resolved.model,
        schema,
        prompt,
        temperature: typeof temperature === 'number' ? temperature : 0.7,
        maxTokens: maxTokens || 3000,
      });
      trace.generation({
        name: `gen:${schemaName}`,
        model: modelId,
        input: { prompt: sanitize(prompt) },
        output: result.object,
        usage: result.usage,
        startTime: new Date(start),
        endTime: new Date(),
        metadata: { provider: resolved.provider, schemaName },
      });
      await trace.end();
      return { ok: true, object: result.object, model: modelId, provider: resolved.provider, usage: result.usage };
    } catch (e) {
      errors.push(`${modelId}: ${e.message || e}`);
      trace.event({ name: `fail:${modelId}`, input: { prompt: sanitize(prompt).slice(0, 200) }, output: String(e.message || e), level: 'WARNING' });
    }
  }
  await trace.end();
  return { ok: false, errors, tried: chain };
}

// ── Streaming text (used by live pivot-review log for real-time tokens) ──────
export async function streamTokens({ prompt, model: preferredModel, sessionId, userId, onToken, maxTokens }) {
  const chain = fallbackChain(preferredModel);
  for (const modelId of chain) {
    const resolved = resolveProvider(modelId);
    if (!resolved) continue;
    try {
      const { textStream } = await streamText({
        model: resolved.model,
        prompt,
        maxTokens: maxTokens || 2000,
      });
      let full = '';
      for await (const delta of textStream) {
        full += delta;
        if (typeof onToken === 'function') onToken(delta, full);
      }
      return { ok: true, text: full, model: modelId };
    } catch (e) {
      // fall through to next model
    }
  }
  return { ok: false, error: 'all_models_failed' };
}

// ── HTTP handler (used by the browser builder) ───────────────────────────────
// Accepts { action: 'generate_typed' | 'stream' | 'generate_text', ... }.
// SSE is emitted for 'stream' so the client can render tokens as they land.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { action, prompt, model, schemaName, sessionId, userId, temperature, maxTokens } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  if (action === 'generate_typed') {
    if (!schemaName) return res.status(400).json({ error: 'schemaName required' });
    const out = await generateTyped({ schemaName, prompt, model, sessionId, userId, temperature, maxTokens });
    return res.json(out);
  }

  if (action === 'stream') {
    // SSE stream for real-time token display in the builder UI.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    const write = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    const result = await streamTokens({
      prompt, model, sessionId, userId, maxTokens,
      onToken: (delta, full) => write({ type: 'token', delta, full_length: full.length }),
    });
    write({ type: 'done', ok: result.ok, model: result.model, error: result.error });
    res.end();
    return;
  }

  if (action === 'generate_text') {
    const chain = fallbackChain(model);
    for (const mId of chain) {
      const r = resolveProvider(mId);
      if (!r) continue;
      try {
        const out = await generateText({ model: r.model, prompt, temperature: temperature ?? 0.7, maxTokens: maxTokens || 2000 });
        return res.json({ ok: true, text: out.text, model: mId, usage: out.usage });
      } catch {}
    }
    return res.status(502).json({ ok: false, error: 'all_providers_failed' });
  }

  return res.status(400).json({ error: 'unknown action' });
}
