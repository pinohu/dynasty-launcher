// api/automations/handler.js — Automation API endpoint
// =============================================================================
// Main REST API for managing automation modules on Dynasty Launcher.
//
// Routes (via action parameter):
//   - list-modules: GET all active automations for a tenant
//   - get-module: GET single module config + status
//   - activate: POST enable an automation
//   - deactivate: POST disable an automation
//   - update-settings: POST update quiet hours, custom vars
//   - trigger: POST manually trigger an automation for testing
//   - runs: GET recent automation runs
//   - stats: GET trigger counts, success rates
//
// Tenant validation: Required on every request (query param or Authorization header).
// CORS: Preflight OPTIONS returns 204.
// Response format: {ok: true/false, data/error: ...}
// =============================================================================

import pg from 'pg';

const { Pool } = pg;

export const maxDuration = 30;

// Database pool (follows _store_postgres.mjs pattern)
let _pool = null;

function pool() {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  _pool = new Pool({
    connectionString: url,
    ssl: url?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
  return _pool;
}

// Utility: extract tenant_id from query or Authorization header
function extractTenantId(req) {
  // Check query param first
  if (req.query?.tenant_id) return req.query.tenant_id;

  // Check Authorization: Bearer <tenant_id> format
  const auth = req.headers?.authorization || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    return token;
  }

  return null;
}

// Utility: ensure automation tables exist (idempotent)
async function ensureSchema() {
  const sql = `
    create table if not exists automations_config (
      config_id text primary key,
      tenant_id text not null references tenants(tenant_id) on delete cascade,
      module_code text not null,
      state text not null default 'enabled',
      settings jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, module_code)
    );
    create index if not exists automations_config_tenant_idx on automations_config(tenant_id);
    create index if not exists automations_config_module_idx on automations_config(module_code);

    create table if not exists automation_runs (
      run_id text primary key,
      tenant_id text not null references tenants(tenant_id) on delete cascade,
      module_code text not null,
      trigger_type text not null,
      status text not null default 'pending',
      result jsonb,
      error_message text,
      started_at timestamptz not null default now(),
      completed_at timestamptz,
      duration_ms int
    );
    create index if not exists automation_runs_tenant_idx on automation_runs(tenant_id);
    create index if not exists automation_runs_module_idx on automation_runs(module_code);
    create index if not exists automation_runs_created_idx on automation_runs(started_at desc);
  `;
  try {
    await pool().query(sql);
  } catch (e) {
    // Table exists or schema error — log and continue
    console.error('[automations] schema error:', e.message);
  }
}

// Generate IDs
function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const now = () => new Date().toISOString();

// =============================================================================
// LIST-MODULES: GET all active automations for a tenant
// =============================================================================

async function listModules(tenant_id, res) {
  try {
    await ensureSchema();
    const { rows } = await pool().query(
      `select ac.*, e.state as entitlement_state
       from automations_config ac
       left join entitlements e on ac.tenant_id = e.tenant_id and ac.module_code = e.module_code
       where ac.tenant_id = $1
       order by ac.created_at desc`,
      [tenant_id],
    );
    return res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('[automations.listModules]', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// =============================================================================
// GET-MODULE: GET single module config + status
// =============================================================================

async function getModule(tenant_id, module_code, res) {
  try {
    await ensureSchema();
    const { rows } = await pool().query(
      `select ac.*, e.state as entitlement_state
       from automations_config ac
       left join entitlements e on ac.tenant_id = e.tenant_id and ac.module_code = e.module_code
       where ac.tenant_id = $1 and ac.module_code = $2`,
      [tenant_id, module_code],
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'Module not found' });
    }
    return res.json({ ok: true, data: rows[0] });
  } catch (e) {
    console.error('[automations.getModule]', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// =============================================================================
// ACTIVATE: POST enable an automation for a tenant
// =============================================================================

async function activate(tenant_id, module_code, res) {
  try {
    await ensureSchema();

    // Verify entitlement exists
    const { rows: ents } = await pool().query(
      `select * from entitlements where tenant_id = $1 and module_code = $2`,
      [tenant_id, module_code],
    );
    if (!ents.length) {
      return res.status(403).json({ ok: false, error: 'Module not entitled for this tenant' });
    }

    const config_id = newId('aconf');
    const result = await pool().query(
      `insert into automations_config (config_id, tenant_id, module_code, state, created_at, updated_at)
       values ($1, $2, $3, 'enabled', $4, $5)
       on conflict (tenant_id, module_code) do update set state = 'enabled', updated_at = $5
       returning *`,
      [config_id, tenant_id, module_code, now(), now()],
    );

    return res.json({ ok: true, data: result.rows[0] });
  } catch (e) {
    console.error('[automations.activate]', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// =============================================================================
// DEACTIVATE: POST disable an automation
// =============================================================================

async function deactivate(tenant_id, module_code, res) {
  try {
    await ensureSchema();

    const result = await pool().query(
      `update automations_config
       set state = 'disabled', updated_at = $1
       where tenant_id = $2 and module_code = $3
       returning *`,
      [now(), tenant_id, module_code],
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: 'Automation config not found' });
    }

    return res.json({ ok: true, data: result.rows[0] });
  } catch (e) {
    console.error('[automations.deactivate]', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// =============================================================================
// UPDATE-SETTINGS: POST update automation settings
// =============================================================================

async function updateSettings(tenant_id, module_code, settings, res) {
  try {
    await ensureSchema();

    const result = await pool().query(
      `update automations_config
       set settings = $1, updated_at = $2
       where tenant_id = $3 and module_code = $4
       returning *`,
      [JSON.stringify(settings || {}), now(), tenant_id, module_code],
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: 'Automation config not found' });
    }

    return res.json({ ok: true, data: result.rows[0] });
  } catch (e) {
    console.error('[automations.updateSettings]', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// =============================================================================
// TRIGGER: POST manually trigger an automation for testing
// =============================================================================

async function trigger(tenant_id, module_code, body, res) {
  try {
    await ensureSchema();

    // Verify config exists and is enabled
    const { rows: configs } = await pool().query(
      `select * from automations_config where tenant_id = $1 and module_code = $2`,
      [tenant_id, module_code],
    );
    if (!configs.length) {
      return res.status(404).json({ ok: false, error: 'Automation config not found' });
    }
    if (configs[0].state !== 'enabled') {
      return res.status(400).json({ ok: false, error: 'Automation is disabled' });
    }

    // Create automation run record
    const run_id = newId('arun');
    const run_start = new Date();
    await pool().query(
      `insert into automation_runs (run_id, tenant_id, module_code, trigger_type, status, started_at)
       values ($1, $2, $3, 'manual', 'pending', $4)`,
      [run_id, tenant_id, module_code, run_start.toISOString()],
    );

    // In production, this would invoke the actual automation logic.
    // For MVP, we'll simulate a successful trigger and log it.
    const result_data = {
      test_payload: body || {},
      triggered_at: run_start.toISOString(),
      automation: module_code,
    };

    const run_end = new Date();
    const duration = run_end.getTime() - run_start.getTime();
    await pool().query(
      `update automation_runs
       set status = 'success', result = $1, completed_at = $2, duration_ms = $3
       where run_id = $4`,
      [JSON.stringify(result_data), run_end.toISOString(), duration, run_id],
    );

    return res.json({
      ok: true,
      data: {
        run_id,
        module_code,
        status: 'success',
        result: result_data,
        duration_ms: duration,
      },
    });
  } catch (e) {
    console.error('[automations.trigger]', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// =============================================================================
// RUNS: GET recent automation runs for a tenant+module
// =============================================================================

async function runs(tenant_id, module_code, limit, res) {
  try {
    await ensureSchema();
    const query_limit = Math.min(parseInt(limit) || 100, 1000);

    let query = `select * from automation_runs where tenant_id = $1`;
    const params = [tenant_id];

    if (module_code) {
      query += ` and module_code = $2`;
      params.push(module_code);
    }

    query += ` order by started_at desc limit $${params.length + 1}`;
    params.push(query_limit);

    const { rows } = await pool().query(query, params);
    return res.json({ ok: true, data: rows, count: rows.length });
  } catch (e) {
    console.error('[automations.runs]', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// =============================================================================
// STATS: GET trigger counts, success rates per module
// =============================================================================

async function stats(tenant_id, res) {
  try {
    await ensureSchema();

    const { rows } = await pool().query(
      `select
         module_code,
         count(*) as total_runs,
         sum(case when status = 'success' then 1 else 0 end) as success_count,
         sum(case when status = 'error' then 1 else 0 end) as error_count,
         sum(case when status = 'pending' then 1 else 0 end) as pending_count,
         avg(duration_ms)::int as avg_duration_ms,
         max(started_at) as last_run_at
       from automation_runs
       where tenant_id = $1
       group by module_code
       order by last_run_at desc`,
      [tenant_id],
    );

    return res.json({
      ok: true,
      data: rows.map((row) => ({
        module_code: row.module_code,
        total_runs: parseInt(row.total_runs),
        success_count: parseInt(row.success_count),
        error_count: parseInt(row.error_count),
        pending_count: parseInt(row.pending_count),
        success_rate: row.total_runs > 0 ? (parseFloat(row.success_count) / parseInt(row.total_runs) * 100).toFixed(1) : 'N/A',
        avg_duration_ms: row.avg_duration_ms,
        last_run_at: row.last_run_at,
      })),
    });
  } catch (e) {
    console.error('[automations.stats]', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export default async function handler(req, res) {
  // CORS preflight
  const allowedOrigin = process.env.CORS_ORIGIN || 'https://yourdeputy.com';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Tenant validation
  const tenant_id = extractTenantId(req);
  if (!tenant_id) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized: tenant_id required (query param or Authorization header)',
    });
  }

  // Route by action
  const action = req.query?.action || req.body?.action;

  try {
    if (action === 'list-modules' && req.method === 'GET') {
      return await listModules(tenant_id, res);
    }

    if (action === 'get-module' && req.method === 'GET') {
      const module_code = req.query?.module_code || req.body?.module_code;
      if (!module_code) {
        return res.status(400).json({ ok: false, error: 'module_code required' });
      }
      return await getModule(tenant_id, module_code, res);
    }

    if (action === 'activate' && req.method === 'POST') {
      const module_code = req.body?.module_code;
      if (!module_code) {
        return res.status(400).json({ ok: false, error: 'module_code required' });
      }
      return await activate(tenant_id, module_code, res);
    }

    if (action === 'deactivate' && req.method === 'POST') {
      const module_code = req.body?.module_code;
      if (!module_code) {
        return res.status(400).json({ ok: false, error: 'module_code required' });
      }
      return await deactivate(tenant_id, module_code, res);
    }

    if (action === 'update-settings' && req.method === 'POST') {
      const module_code = req.body?.module_code;
      const settings = req.body?.settings;
      if (!module_code) {
        return res.status(400).json({ ok: false, error: 'module_code required' });
      }
      return await updateSettings(tenant_id, module_code, settings, res);
    }

    if (action === 'trigger' && req.method === 'POST') {
      const module_code = req.body?.module_code;
      if (!module_code) {
        return res.status(400).json({ ok: false, error: 'module_code required' });
      }
      return await trigger(tenant_id, module_code, req.body?.payload, res);
    }

    if (action === 'runs' && req.method === 'GET') {
      const module_code = req.query?.module_code || null;
      const limit = req.query?.limit || 100;
      return await runs(tenant_id, module_code, limit, res);
    }

    if (action === 'stats' && req.method === 'GET') {
      return await stats(tenant_id, res);
    }

    // No matching action
    return res.status(400).json({
      ok: false,
      error: 'Unknown action',
      available_actions: [
        'list-modules',
        'get-module',
        'activate',
        'deactivate',
        'update-settings',
        'trigger',
        'runs',
        'stats',
      ],
    });
  } catch (e) {
    console.error('[automations.handler] unexpected error:', e.message);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
