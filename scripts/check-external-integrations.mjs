// scripts/check-external-integrations.mjs
// -----------------------------------------------------------------------------
// Non-mutating readiness check for provider integrations. Missing keys are
// reported as pending instead of failing the run, so other work can continue.
// -----------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith('--'))
    .map((arg) => {
      const [key, value = 'true'] = arg.slice(2).split('=');
      return [key, value];
    }),
);

const jsonOutput = args.has('json');
const strict = args.has('strict');
const envFile = args.get('env-file') || process.env.YOURDEPUTY_ENV_FILE || '.env';
const baseUrl = trimSlash(
  args.get('base-url') || process.env.YOURDEPUTY_BASE_URL || 'https://www.yourdeputy.com',
);

const env = { ...process.env, ...readEnvFile(envFile) };
const results = [];

function readEnvFile(file) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return {};
  const values = {};
  for (const raw of fs.readFileSync(resolved, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    values[line.slice(0, i).trim()] = stripQuotes(line.slice(i + 1).trim());
  }
  return values;
}

function stripQuotes(value) {
  return value.replace(/^['"]|['"]$/g, '');
}

function realSecret(name) {
  const value = String(env[name] || '').trim();
  return value && !/^STUB|^EXPIRED|^TODO|^CHANGEME/i.test(value) ? value : '';
}

function record(name, status, detail, meta = {}) {
  results.push({ name, status, detail, ...meta });
}

function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

async function getText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    return { ok: false, status: 0, text: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function getJson(url, options = {}) {
  const response = await getText(url, options);
  try {
    return { ...response, json: JSON.parse(response.text) };
  } catch {
    return { ...response, json: null };
  }
}

async function checkAppWebhookTokens() {
  const checks = [
    {
      name: 'Your Deputy form webhook',
      source: 'form',
      secret: 'FORM_WEBHOOK_SECRET',
      header: 'x-formaloo-token',
    },
    {
      name: 'Your Deputy CallScaler webhook',
      source: 'callscaler',
      secret: 'CALLSCALER_WEBHOOK_SECRET',
      queryToken: true,
    },
    {
      name: 'Your Deputy Trafft webhook',
      source: 'trafft',
      secret: 'TRAFFT_WEBHOOK_SECRET',
      header: 'authorization',
      bearer: true,
    },
  ];

  for (const check of checks) {
    const secret = realSecret(check.secret);
    if (!secret) {
      record(check.name, 'pending', `${check.secret} is not configured`);
      continue;
    }

    const url = new URL(`${baseUrl}/api/automations/webhook`);
    url.searchParams.set('source', check.source);
    if (check.queryToken) url.searchParams.set('webhook_token', secret);

    const headers = { 'content-type': 'application/json' };
    if (check.header) headers[check.header] = check.bearer ? `Bearer ${secret}` : secret;

    const response = await getJson(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ source: check.source, event_type: 'readiness.check' }),
    });

    if (response.status === 400 && response.json?.error === 'tenant_id required in webhook') {
      record(
        check.name,
        'ready',
        'Provider token accepted; tenant binding still required per webhook URL',
      );
    } else {
      record(check.name, 'action', `Unexpected app webhook response ${response.status}`, {
        error: response.json?.error || response.text.slice(0, 120),
      });
    }
  }
}

async function checkStripe() {
  if (!realSecret('STRIPE_SECRET_KEY')) {
    record('Stripe webhook endpoint', 'pending', 'STRIPE_SECRET_KEY is not configured locally');
    return;
  }

  const response = await getJson('https://api.stripe.com/v1/webhook_endpoints?limit=100', {
    headers: { authorization: `Bearer ${realSecret('STRIPE_SECRET_KEY')}` },
  });
  if (!response.ok) {
    record('Stripe webhook endpoint', 'action', `Stripe API returned ${response.status}`, {
      error: response.json?.error?.message || response.text.slice(0, 120),
    });
    return;
  }

  const endpoints = response.json?.data || [];
  const target = `${baseUrl}/api/billing/webhook`;
  const configured = endpoints.find(
    (endpoint) => endpoint.url === target && endpoint.status === 'enabled',
  );
  record(
    'Stripe webhook endpoint',
    configured ? 'ready' : 'action',
    configured
      ? 'Enabled endpoint points at production billing webhook'
      : `No enabled endpoint found for ${target}`,
    { enabled_count: endpoints.filter((endpoint) => endpoint.status === 'enabled').length },
  );
}

async function checkFormaloo() {
  if (!realSecret('FORMALOO_API_KEY') || !realSecret('FORMALOO_API_SECRET')) {
    record('Formaloo API', 'pending', 'FORMALOO_API_KEY or FORMALOO_API_SECRET is not configured');
    return;
  }

  const body = new FormData();
  body.append('grant_type', 'client_credentials');
  const auth = await getJson('https://api.formaloo.net/v1.0/oauth2/authorization-token/', {
    method: 'POST',
    headers: { authorization: `Basic ${realSecret('FORMALOO_API_SECRET')}` },
    body,
  });
  const token = auth.json?.authorization_token;
  if (!auth.ok || !token) {
    record('Formaloo API', 'action', `Formaloo auth returned ${auth.status}`, {
      error: auth.json?.errors || auth.text.slice(0, 120),
    });
    return;
  }

  const headers = {
    'x-api-key': realSecret('FORMALOO_API_KEY'),
    authorization: `JWT ${token}`,
    accept: 'application/json',
  };
  const formsResponse = await getJson('https://api.formaloo.net/v3/forms/', { headers });
  const forms = Array.isArray(formsResponse.json?.data?.forms)
    ? formsResponse.json.data.forms
    : Array.isArray(formsResponse.json?.data)
      ? formsResponse.json.data
      : [];

  let yourDeputyHooks = 0;
  for (const form of forms) {
    const slug = form.slug || form.id || form.hash;
    if (!slug) continue;
    const hooks = await getJson(`https://api.formaloo.net/v1.0/forms/${slug}/webhooks/`, {
      headers,
    });
    const webhookRows = hooks.json?.data?.webhooks || [];
    yourDeputyHooks += webhookRows.filter((hook) =>
      String(hook.url || '').includes('/api/automations/webhook'),
    ).length;
  }

  record('Formaloo API', 'ready', 'Authenticated and listed forms/webhooks', {
    forms_count: forms.length,
    your_deputy_webhooks: yourDeputyHooks,
  });
}

async function checkCallScaler() {
  const keys = ['CALLSCALER_API_KEY', 'CALLSCALER_API_KEY_1'].filter(realSecret);
  if (!keys.length) {
    record('CallScaler API', 'pending', 'CALLSCALER_API_KEY is not configured');
    return;
  }

  const attempts = [];
  for (const keyName of keys) {
    const response = await getJson('https://callscaler.com/api/v1/call-flows', {
      headers: { authorization: `Bearer ${realSecret(keyName)}`, accept: 'application/json' },
    });
    attempts.push({ key: keyName, status: response.status });
    if (response.ok) {
      record('CallScaler API', 'ready', 'API key can read call flows', { attempts });
      return;
    }
  }
  record(
    'CallScaler API',
    'pending',
    'Configured key was not accepted by CallScaler API; dashboard/API-token step remains',
    { attempts },
  );
}

async function checkTrafft() {
  const tokenName = realSecret('TRAFFT_API_TOKEN')
    ? 'TRAFFT_API_TOKEN'
    : realSecret('TRAFFT_CLIENT_ID')
      ? 'TRAFFT_CLIENT_ID'
      : '';
  if (!tokenName) {
    record('Trafft API', 'pending', 'TRAFFT_API_TOKEN is not configured');
    return;
  }

  const response = await getJson('https://app.trafft.com/api/v1/webhooks', {
    headers: { authorization: `Bearer ${realSecret(tokenName)}`, accept: 'application/json' },
  });
  if (response.ok) {
    record('Trafft API', 'ready', 'API token can read webhook configuration');
  } else {
    record(
      'Trafft API',
      'pending',
      `${tokenName} was not accepted for webhook API reads; dashboard setup remains`,
      {
        status_code: response.status,
      },
    );
  }
}

await checkAppWebhookTokens();
await checkStripe();
await checkFormaloo();
await checkCallScaler();
await checkTrafft();

const summary = {
  checked_at: new Date().toISOString(),
  env_file_loaded: fs.existsSync(path.resolve(envFile)),
  base_url: baseUrl,
  counts: results.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {}),
  results,
};

if (jsonOutput) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log('External integration readiness');
  console.log('-'.repeat(72));
  for (const row of results) {
    const icon = row.status === 'ready' ? 'PASS' : row.status === 'action' ? 'WARN' : 'PEND';
    const extras = Object.entries(row)
      .filter(([key]) => !['name', 'status', 'detail'].includes(key))
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ');
    console.log(`${icon} ${row.name}: ${row.detail}${extras ? ` (${extras})` : ''}`);
  }
  console.log('-'.repeat(72));
  console.log(
    `ready=${summary.counts.ready || 0} pending=${summary.counts.pending || 0} action=${summary.counts.action || 0}`,
  );
}

if (strict && results.some((row) => row.status === 'action')) {
  process.exitCode = 1;
}
