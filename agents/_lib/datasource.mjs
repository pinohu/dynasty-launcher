// agents/_lib/datasource.mjs
// Unified read-only facade over Dynasty data sources (Neon, SuiteDash,
// GitHub, PA CROP, 20i, Stripe). Subagents declare one 'datasource_query'
// tool and route every read through this layer instead of managing
// source-specific clients.
//
// Writes still go through source-specific tools — this facade is read-only
// on purpose. Reads are where tool sprawl bites hardest.
// -----------------------------------------------------------------------------

const SOURCES = {
  neon: neonQuery,
  suitedash: suitedashQuery,
  github: githubQuery,
  pacrop: pacropQuery,
  twentyi: twentyiQuery,
  stripe: stripeQuery,
};

// datasource.query({ source, query, tenantId? }) -> { rows, meta }
export async function query({ source, query, tenantId = null }) {
  const impl = SOURCES[source];
  if (!impl) throw new Error(`Unknown datasource: ${source}. Available: ${Object.keys(SOURCES).join(', ')}`);
  return impl({ query, tenantId });
}

// ── Neon (Postgres) ──────────────────────────────────────────────────────────
async function neonQuery({ query: q, tenantId }) {
  const { Pool } = await import('pg');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const pool = new Pool({ connectionString: url, max: 2 });
  try {
    const { text, params = [] } = normalizeQuery(q);
    // Enforce tenant scoping when a tenantId is present and the query
    // touches tables with a tenant_id column. Bail loudly if the query
    // looks cross-tenant.
    if (tenantId && /tenants|entitlements|events_log/i.test(text) && !/tenant_id/i.test(text)) {
      throw new Error('Neon query touches tenant-scoped tables without tenant_id filter');
    }
    const res = await pool.query(text, params);
    return { rows: res.rows, meta: { source: 'neon', row_count: res.rowCount } };
  } finally {
    await pool.end();
  }
}

// ── SuiteDash ────────────────────────────────────────────────────────────────
async function suitedashQuery({ query: q }) {
  const key = process.env.SUITEDASH_PUBLIC_ID;
  const sec = process.env.SUITEDASH_SECRET_ID;
  if (!key || !sec) throw new Error('SuiteDash credentials not set');
  const { resource, id, filters } = normalizeQuery(q, { allowedResources: ['contacts', 'companies', 'invoices', 'subscriptions'] });
  const url = id
    ? `https://app.suitedash.com/secure-api/${resource}/${id}`
    : `https://app.suitedash.com/secure-api/${resource}?${new URLSearchParams(filters || {})}`;
  const resp = await fetch(url, { headers: { 'X-Public-ID': key, 'X-Secret-ID': sec } });
  if (!resp.ok) throw new Error(`SuiteDash ${resp.status}`);
  const data = await resp.json();
  return { rows: Array.isArray(data) ? data : [data], meta: { source: 'suitedash', resource } };
}

// ── GitHub ───────────────────────────────────────────────────────────────────
async function githubQuery({ query: q }) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not set');
  const { resource, owner = 'pinohu', repo, path, ref } = normalizeQuery(q, { allowedResources: ['repo', 'file', 'commits', 'workflows'] });
  let url;
  if (resource === 'repo')    url = `https://api.github.com/repos/${owner}/${repo}`;
  if (resource === 'file')    url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}${ref ? '?ref=' + ref : ''}`;
  if (resource === 'commits') url = `https://api.github.com/repos/${owner}/${repo}/commits${ref ? '?sha=' + ref : ''}`;
  if (resource === 'workflows') url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows`;
  const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' } });
  if (!resp.ok) throw new Error(`GitHub ${resp.status}`);
  const data = await resp.json();
  return { rows: Array.isArray(data) ? data : [data], meta: { source: 'github', resource } };
}

// ── PA CROP (proxy to the existing api on pacropservices.com) ────────────────
async function pacropQuery({ query: q }) {
  const adminKey = process.env.PA_CROP_ADMIN_KEY;
  if (!adminKey) throw new Error('PA_CROP_ADMIN_KEY not set');
  const { endpoint, params = {} } = normalizeQuery(q);
  const url = `https://pacropservices.com/api/${endpoint}?${new URLSearchParams(params)}`;
  const resp = await fetch(url, { headers: { 'X-Admin-Key': adminKey } });
  if (!resp.ok) throw new Error(`PA CROP ${resp.status}`);
  const data = await resp.json();
  return { rows: Array.isArray(data) ? data : [data], meta: { source: 'pacrop', endpoint } };
}

// ── 20i ──────────────────────────────────────────────────────────────────────
async function twentyiQuery({ query: q }) {
  const bearer = process.env.TWENTYI_BEARER;
  if (!bearer) throw new Error('TWENTYI_BEARER not set');
  const { resource, packageId } = normalizeQuery(q, { allowedResources: ['packages', 'package'] });
  const url = resource === 'packages'
    ? 'https://api.20i.com/package'
    : `https://api.20i.com/package/${packageId}`;
  const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${bearer}` } });
  if (!resp.ok) throw new Error(`20i ${resp.status}`);
  const data = await resp.json();
  return { rows: Array.isArray(data) ? data : [data], meta: { source: 'twentyi', resource } };
}

// ── Stripe ───────────────────────────────────────────────────────────────────
async function stripeQuery({ query: q }) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  const { resource, id } = normalizeQuery(q, { allowedResources: ['products', 'prices', 'subscriptions', 'customers'] });
  const url = id
    ? `https://api.stripe.com/v1/${resource}/${id}`
    : `https://api.stripe.com/v1/${resource}`;
  const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${key}` } });
  if (!resp.ok) throw new Error(`Stripe ${resp.status}`);
  const data = await resp.json();
  return { rows: data.data || [data], meta: { source: 'stripe', resource } };
}

// ── helpers ──────────────────────────────────────────────────────────────────
function normalizeQuery(q, opts = {}) {
  if (typeof q === 'string') return { text: q, params: [] };
  if (opts.allowedResources && q.resource && !opts.allowedResources.includes(q.resource)) {
    throw new Error(`Resource ${q.resource} not allowed here. Allowed: ${opts.allowedResources.join(', ')}`);
  }
  return q;
}
