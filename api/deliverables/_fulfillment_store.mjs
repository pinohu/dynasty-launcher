import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const memory = {
  launches: new Map(),
  leads: new Map(),
  credentials: new Map(),
};

let _pool;
let _ready = false;

function normalizedDatabaseUrl(value) {
  const raw = String(value || '');
  try {
    const url = new URL(raw);
    const sslmode = url.searchParams.get('sslmode');
    if (['prefer', 'require', 'verify-ca'].includes(sslmode)) {
      url.searchParams.set('sslmode', 'verify-full');
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function usePostgres() {
  return !!process.env.DATABASE_URL;
}

function pool() {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  _pool = new Pool({
    connectionString: normalizedDatabaseUrl(url),
    max: 5,
  });
  return _pool;
}

async function ensureTables() {
  if (_ready || !usePostgres()) return;
  await pool().query(`
    CREATE TABLE IF NOT EXISTS fulfillment_launches (
      launch_id text PRIMARY KEY,
      tenant_id text NOT NULL,
      offer_id text NOT NULL,
      status text NOT NULL,
      public_slug text NOT NULL,
      launched_url text NOT NULL,
      profile jsonb NOT NULL DEFAULT '{}'::jsonb,
      runtime jsonb NOT NULL DEFAULT '{}'::jsonb,
      modules jsonb NOT NULL DEFAULT '[]'::jsonb,
      components jsonb NOT NULL DEFAULT '[]'::jsonb,
      files jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS fulfillment_launches_slug_idx ON fulfillment_launches(public_slug);

    CREATE TABLE IF NOT EXISTS fulfillment_leads (
      lead_id text PRIMARY KEY,
      launch_id text NOT NULL REFERENCES fulfillment_launches(launch_id) ON DELETE CASCADE,
      tenant_id text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      status text NOT NULL DEFAULT 'captured',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS fulfillment_credentials (
      credential_id text PRIMARY KEY,
      launch_id text NOT NULL REFERENCES fulfillment_launches(launch_id) ON DELETE CASCADE,
      tenant_id text NOT NULL,
      key text NOT NULL,
      label text NOT NULL,
      secret boolean NOT NULL DEFAULT false,
      provided boolean NOT NULL DEFAULT false,
      encrypted_value text,
      public_value text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(launch_id, key)
    );
  `);
  _ready = true;
}

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function encryptionSecret() {
  if (!usePostgres()) return 'local-memory-fulfillment-vault';
  const dedicated = process.env.FULFILLMENT_ENCRYPTION_KEY || process.env.CREDENTIAL_VAULT_KEY || '';
  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    return dedicated;
  }
  return dedicated || process.env.PAYMENT_ACCESS_SECRET || process.env.ADMIN_KEY || '';
}

function encryptValue(value) {
  const text = String(value || '');
  if (!text) return '';
  const secret = encryptionSecret();
  if (!secret || secret.startsWith('STUB') || secret.startsWith('EXPIRED')) {
    throw new Error('credential_vault_secret_missing');
  }
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export async function saveLaunch(record) {
  await ensureTables();
  const launch = {
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...record,
  };
  if (!usePostgres()) {
    memory.launches.set(launch.launch_id, launch);
    return launch;
  }
  await pool().query(
    `INSERT INTO fulfillment_launches
      (launch_id, tenant_id, offer_id, status, public_slug, launched_url, profile, runtime, modules, components, files, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13)
     ON CONFLICT (launch_id) DO UPDATE SET
      status=excluded.status,
      launched_url=excluded.launched_url,
      profile=excluded.profile,
      runtime=excluded.runtime,
      modules=excluded.modules,
      components=excluded.components,
      files=excluded.files,
      updated_at=excluded.updated_at`,
    [
      launch.launch_id,
      launch.tenant_id,
      launch.offer_id,
      launch.status,
      launch.public_slug,
      launch.launched_url,
      JSON.stringify(launch.profile || {}),
      JSON.stringify(launch.runtime || {}),
      JSON.stringify(launch.modules || []),
      JSON.stringify(launch.components || []),
      JSON.stringify(launch.files || []),
      launch.created_at,
      launch.updated_at,
    ],
  );
  return launch;
}

function rowToLaunch(row) {
  if (!row) return null;
  return {
    launch_id: row.launch_id,
    tenant_id: row.tenant_id,
    offer_id: row.offer_id,
    status: row.status,
    public_slug: row.public_slug,
    launched_url: row.launched_url,
    profile: row.profile || {},
    runtime: row.runtime || {},
    modules: row.modules || [],
    components: row.components || [],
    files: row.files || [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getLaunch(launch_id) {
  await ensureTables();
  if (!usePostgres()) return memory.launches.get(launch_id) || null;
  const { rows } = await pool().query('SELECT * FROM fulfillment_launches WHERE launch_id=$1', [launch_id]);
  return rowToLaunch(rows[0]);
}

export async function saveCredentials({ launch_id, tenant_id, credentials }) {
  await ensureTables();
  const rows = [];
  for (const credential of credentials || []) {
    const row = {
      credential_id: id('cred'),
      launch_id,
      tenant_id,
      key: credential.key,
      label: credential.label,
      secret: !!credential.secret,
      provided: !!credential.provided,
      encrypted_value: credential.secret && credential.raw_value ? encryptValue(credential.raw_value) : null,
      public_value: credential.secret ? (credential.provided ? '[provided]' : '') : String(credential.raw_value || ''),
      created_at: new Date().toISOString(),
    };
    rows.push(row);
  }
  if (!usePostgres()) {
    memory.credentials.set(launch_id, rows);
    return rows.map(({ encrypted_value, ...row }) => row);
  }
  for (const row of rows) {
    await pool().query(
      `INSERT INTO fulfillment_credentials
        (credential_id, launch_id, tenant_id, key, label, secret, provided, encrypted_value, public_value, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (launch_id, key) DO UPDATE SET
        label=excluded.label,
        secret=excluded.secret,
        provided=excluded.provided,
        encrypted_value=excluded.encrypted_value,
        public_value=excluded.public_value`,
      [
        row.credential_id,
        row.launch_id,
        row.tenant_id,
        row.key,
        row.label,
        row.secret,
        row.provided,
        row.encrypted_value,
        row.public_value,
        row.created_at,
      ],
    );
  }
  return rows.map(({ encrypted_value, ...row }) => row);
}

export async function saveLead({ launch_id, tenant_id, payload, status = 'captured' }) {
  await ensureTables();
  const lead = {
    lead_id: id('lead'),
    launch_id,
    tenant_id,
    payload: payload || {},
    status,
    created_at: new Date().toISOString(),
  };
  if (!usePostgres()) {
    const list = memory.leads.get(launch_id) || [];
    list.push(lead);
    memory.leads.set(launch_id, list);
    return lead;
  }
  await pool().query(
    `INSERT INTO fulfillment_leads (lead_id, launch_id, tenant_id, payload, status, created_at)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
    [lead.lead_id, launch_id, tenant_id, JSON.stringify(lead.payload), lead.status, lead.created_at],
  );
  return lead;
}

export async function listLeads(launch_id) {
  await ensureTables();
  if (!usePostgres()) return memory.leads.get(launch_id) || [];
  const { rows } = await pool().query('SELECT * FROM fulfillment_leads WHERE launch_id=$1 ORDER BY created_at DESC', [launch_id]);
  return rows.map((row) => ({
    lead_id: row.lead_id,
    launch_id: row.launch_id,
    tenant_id: row.tenant_id,
    payload: row.payload || {},
    status: row.status,
    created_at: row.created_at,
  }));
}

export async function _resetFulfillmentStore() {
  memory.launches.clear();
  memory.leads.clear();
  memory.credentials.clear();
}
