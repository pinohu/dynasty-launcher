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
