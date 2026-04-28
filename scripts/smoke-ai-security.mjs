// scripts/smoke-ai-security.mjs
// -----------------------------------------------------------------------------
// Security regression coverage for AI-backed routes:
//   - /api/ai-sdk rejects unauthenticated provider-key spend
//   - prompt and max-token caps fire before provider calls
//   - signed paid/admin/gateway paths remain usable
//   - /api/pivot-graph rejects unauthenticated or excessive model fan-out
// -----------------------------------------------------------------------------

import crypto from 'node:crypto';

process.env.AI_GATEWAY_TOKEN = 'ai-gateway-token-for-smoke';
process.env.AI_MAX_PROMPT_CHARS = '1000';
process.env.AI_MAX_TOKENS_PER_CALL = '1000';
process.env.AI_PIVOT_MAX_MODELS = '2';
process.env.PAYMENT_ACCESS_SECRET = 'payment-secret-for-ai-smoke';
process.env.TEST_ADMIN_KEY = 'admin-key-for-ai-smoke';

const LEGACY_AI_PROVIDER_ENVS = [
  'GOOGLE_AI_KEY',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'GROQ_API_KEY_2',
  'OPENROUTER_API_KEY',
  'OLLAMA_URL',
  'CEREBRAS_API_KEY',
  'SAMBANOVA_API_KEY',
  'MOONSHOT_API_KEY',
  'ZAI_API_KEY',
  'Z_AI_API_KEY',
  'MINIMAX_API_KEY',
  'FIREWORKS_API_KEY',
  'HYPERBOLIC_API_KEY',
  'TOGETHER_API_KEY',
  'PERPLEXITY_API_KEY',
  'DASHSCOPE_API_KEY',
  'QWEN_API_KEY',
  'NVIDIA_API_KEY',
  'NIM_API_KEY',
  'BASETEN_API_KEY',
  'GITHUB_MODELS_TOKEN',
  'GITHUB_TOKEN',
  'CLOUDFLARE_API_TOKEN',
  'CHUTES_API_KEY',
  'INCEPTION_API_KEY',
];

function invoke(handlerModule, { method = 'POST', query = {}, body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      _status: 200,
      _body: null,
      _headers: {},
      status(s) {
        this._status = s;
        return this;
      },
      setHeader(k, v) {
        this._headers[k] = v;
      },
      json(b) {
        this._body = b;
        resolve({ status: this._status, body: b, headers: this._headers });
        return this;
      },
      end() {
        resolve({ status: this._status, body: null, headers: this._headers });
        return this;
      },
      write() {},
    };
    const req = { method, query, headers, body, socket: { remoteAddress: '127.0.0.1' } };
    Promise.resolve(handlerModule.default(req, res)).catch(reject);
  });
}

async function loadHandlers() {
  return {
    legacyAi: await import('../api/ai.js'),
    aiSdk: await import('../api/ai-sdk.js'),
    pivotGraph: await import('../api/pivot-graph.js'),
  };
}

function signPaymentToken(subject = 'user_ai_smoke') {
  const exp = Date.now() + 60 * 60 * 1000;
  const payload = `pay:cs_test_ai:${subject}:professional:${exp}`;
  const sig = crypto
    .createHmac('sha256', process.env.PAYMENT_ACCESS_SECRET)
    .update(payload)
    .digest('hex');
  return `${payload}:${sig}`;
}

function log(ok, name, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
  return ok ? 0 : 1;
}

async function main() {
  const h = await loadHandlers();
  let fails = 0;

  console.log('Smoke test: AI endpoint security gates');
  console.log('-'.repeat(60));

  {
    const r = await invoke(h.legacyAi, {
      query: { action: 'reset_quota', k: process.env.TEST_ADMIN_KEY },
    });
    fails += log(
      r.status === 401 && r.body.error === 'Unauthorized',
      '/api/ai reset_quota rejects query-string admin key',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    const r = await invoke(h.legacyAi, {
      query: { action: 'reset_quota' },
      body: { k: process.env.TEST_ADMIN_KEY },
    });
    fails += log(
      r.status === 401 && r.body.error === 'Unauthorized',
      '/api/ai reset_quota rejects body admin key',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    const r = await invoke(h.legacyAi, {
      query: { action: 'reset_quota' },
      headers: { 'x-admin-key': process.env.TEST_ADMIN_KEY },
    });
    fails += log(
      r.status === 200 && r.body.ok === true,
      '/api/ai reset_quota accepts shared admin header auth',
      `status=${r.status}`,
    );
  }

  {
    process.env.GROQ_API_KEY = 'fake-groq-key-for-redaction';
    const r = await invoke(h.legacyAi, {
      method: 'GET',
      query: { action: 'models' },
    });
    fails += log(
      r.status === 200 &&
        r.body.provider_availability_redacted === true &&
        r.body.models?.['llama-3.1-8b-instant']?.available === false,
      '/api/ai models redacts provider-key availability without admin auth',
      `status=${r.status} redacted=${r.body.provider_availability_redacted}`,
    );
  }

  {
    const r = await invoke(h.legacyAi, {
      method: 'GET',
      query: { action: 'models' },
      headers: { 'x-admin-key': process.env.TEST_ADMIN_KEY },
    });
    fails += log(
      r.status === 200 &&
        r.body.provider_availability_redacted === false &&
        r.body.models?.['llama-3.1-8b-instant']?.available === true,
      '/api/ai models shows provider-key availability to admins',
      `status=${r.status} available=${r.body.models?.['llama-3.1-8b-instant']?.available}`,
    );
    Reflect.deleteProperty(process.env, 'GROQ_API_KEY');
  }

  {
    const r = await invoke(h.legacyAi, {
      body: {
        model: 'gemini-2.0-flash',
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 1001,
      },
    });
    fails += log(
      r.status === 400 && r.body.error === 'max_tokens_exceeds_limit',
      '/api/ai enforces max-token cap before provider calls',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    for (const key of LEGACY_AI_PROVIDER_ENVS) delete process.env[key];
    process.env.DYNASTY_TOOL_CONFIG = '{}';
    const r = await invoke(h.legacyAi, {
      body: {
        usage_context: 'free_scoring',
        model: 'gemini-2.0-flash',
        user_id: 'spoofed_registered_user',
        messages: [{ role: 'user', content: 'score this idea' }],
      },
    });
    fails += log(
      r.status === 503 && r.headers['X-Scoring-Plan'] === 'guest',
      '/api/ai treats unauthenticated free_scoring user_id as guest quota',
      `status=${r.status} plan=${r.headers['X-Scoring-Plan']}`,
    );
  }

  {
    const r = await invoke(h.aiSdk, {
      body: { action: 'generate_text', prompt: 'hello', model: 'gemini-2.0-flash' },
    });
    fails += log(
      r.status === 401 && r.body.error === 'ai_authorization_required',
      '/api/ai-sdk rejects unauthenticated requests',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    const r = await invoke(h.aiSdk, {
      headers: { 'x-ai-gateway-token': process.env.AI_GATEWAY_TOKEN },
      body: { action: 'generate_text', prompt: 'x'.repeat(1001), model: 'gemini-2.0-flash' },
    });
    fails += log(
      r.status === 413 && r.body.error === 'prompt_too_large',
      '/api/ai-sdk enforces prompt size cap before provider spend',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    const r = await invoke(h.aiSdk, {
      headers: { 'x-ai-gateway-token': process.env.AI_GATEWAY_TOKEN },
      body: {
        action: 'generate_text',
        prompt: 'hello',
        model: 'gemini-2.0-flash',
        maxTokens: 1001,
      },
    });
    fails += log(
      r.status === 400 && r.body.error === 'max_tokens_exceeds_limit',
      '/api/ai-sdk enforces max-token cap',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    const token = signPaymentToken();
    const r = await invoke(h.aiSdk, {
      body: {
        action: 'unknown_action',
        prompt: 'hello',
        model: 'model-with-no-provider-key',
        access_token: token,
        stripe_session_id: 'cs_test_ai',
        tier: 'professional',
        user_id: 'user_ai_smoke',
      },
    });
    fails += log(
      r.status === 400 && r.body.error === 'unknown action',
      '/api/ai-sdk accepts a valid paid token before action dispatch',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    const r = await invoke(h.pivotGraph, {
      body: {
        idea: 'local service idea',
        scorecard: { composite: 6 },
        models: [{ id: 'a', label: 'A' }],
      },
    });
    fails += log(
      r.status === 401 && r.body.error === 'ai_authorization_required',
      '/api/pivot-graph rejects unauthenticated graph runs',
      `status=${r.status} error=${r.body.error}`,
    );
  }

  {
    const r = await invoke(h.pivotGraph, {
      headers: { 'x-ai-gateway-token': process.env.AI_GATEWAY_TOKEN },
      body: {
        idea: 'local service idea',
        scorecard: { composite: 6 },
        models: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
          { id: 'c', label: 'C' },
        ],
      },
    });
    fails += log(
      r.status === 400 && r.body.error === 'model_count_exceeds_limit',
      '/api/pivot-graph rejects excessive model fan-out',
      `status=${r.status} max=${r.body.max_models}`,
    );
  }

  console.log('-'.repeat(60));
  if (fails === 0) {
    console.log('OK - AI security checks passed.');
    process.exit(0);
  } else {
    console.log(`FAIL - ${fails} check(s) failed.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
