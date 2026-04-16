// api/events/_events_store.mjs — persistent event storage
// -----------------------------------------------------------------------------
// When DATABASE_URL is set, events flow to the events_log table. Otherwise
// falls back to the in-memory array (same as before). The bus calls persist()
// fire-and-forget — if the DB write fails the app continues; we console.error
// the failure so Vercel runtime logs catch it.
//
// Query interface (getPersistedEvents) supports the same filters as the
// in-memory bus but reads from Postgres, so history survives cold starts.
//
// Table: events_log (created by scripts/migrations/001_initial.sql)
// Columns: event_id, event_type, tenant_id, module_code, payload, emitted_at
// -----------------------------------------------------------------------------

import pg from 'pg';

const { Pool } = pg;

let _pool = null;

function pool() {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  _pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
  return _pool;
}

export function isPostgresAvailable() {
  return !!process.env.DATABASE_URL;
}

// Fire-and-forget: caller does NOT await this.
export function persist(event) {
  const p = pool();
  if (!p) return; // no DB → noop
  p.query(
    `insert into events_log (event_id, event_type, tenant_id, module_code, payload, emitted_at)
     values ($1, $2, $3, $4, $5::jsonb, $6)
     on conflict (event_id) do nothing`,
    [
      event.event_id,
      event.event_type,
      event.tenant_id || null,
      event.module_code || null,
      JSON.stringify(event.payload || {}),
      event.emitted_at,
    ],
  ).catch((err) => {
    console.error(`[events_store] persist failed for ${event.event_id}: ${err.message}`);
  });
}

// Bulk persist (for backfill or batch ingest)
export async function persistBatch(events) {
  const p = pool();
  if (!p || events.length === 0) return;
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    for (const e of events) {
      await client.query(
        `insert into events_log (event_id, event_type, tenant_id, module_code, payload, emitted_at)
         values ($1, $2, $3, $4, $5::jsonb, $6)
         on conflict (event_id) do nothing`,
        [e.event_id, e.event_type, e.tenant_id || null, e.module_code || null,
         JSON.stringify(e.payload || {}), e.emitted_at],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[events_store] batch persist failed: ${err.message}`);
  } finally {
    client.release();
  }
}

// Paginated query against Postgres events_log. Falls back to empty array if
// no DB is available.
export async function getPersistedEvents({
  tenant_id = null,
  event_type = null,
  since = null,
  until = null,
  module_code = null,
  limit = 100,
  offset = 0,
} = {}) {
  const p = pool();
  if (!p) return { events: [], total: 0, has_more: false, backend: 'memory' };

  const conditions = [];
  const params = [];
  let idx = 1;

  if (tenant_id) { conditions.push(`tenant_id = $${idx++}`); params.push(tenant_id); }
  if (event_type) {
    conditions.push(`(event_type = $${idx} or event_type like $${idx} || '.%')`);
    params.push(event_type);
    idx++;
  }
  if (module_code) { conditions.push(`module_code = $${idx++}`); params.push(module_code); }
  if (since) { conditions.push(`emitted_at >= $${idx++}`); params.push(since); }
  if (until) { conditions.push(`emitted_at <= $${idx++}`); params.push(until); }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';

  const countResult = await p.query(`select count(*)::int as n from events_log ${where}`, params);
  const total = countResult.rows[0].n;

  const dataParams = [...params, limit, offset];
  const rows = await p.query(
    `select * from events_log ${where} order by emitted_at desc limit $${idx} offset $${idx + 1}`,
    dataParams,
  );

  return {
    events: rows.rows.map((r) => ({
      event_id: r.event_id,
      event_type: r.event_type,
      tenant_id: r.tenant_id,
      module_code: r.module_code,
      payload: r.payload,
      emitted_at: r.emitted_at,
    })),
    total,
    has_more: offset + limit < total,
    backend: 'postgres',
  };
}

// Aggregate stats for the metrics endpoint
export async function getEventStats() {
  const p = pool();
  if (!p) return null;

  const [
    totalR,
    last1hR,
    last24hR,
    last7dR,
    byTypeR,
    recentFailR,
  ] = await Promise.all([
    p.query(`select count(*)::int as n from events_log`),
    p.query(`select count(*)::int as n from events_log where emitted_at > now() - interval '1 hour'`),
    p.query(`select count(*)::int as n from events_log where emitted_at > now() - interval '24 hours'`),
    p.query(`select count(*)::int as n from events_log where emitted_at > now() - interval '7 days'`),
    p.query(`select event_type, count(*)::int as n from events_log group by event_type order by n desc limit 20`),
    p.query(`select * from events_log where event_type like '%.failed%' or event_type like '%.error%' order by emitted_at desc limit 10`),
  ]);

  return {
    total: totalR.rows[0].n,
    last_1h: last1hR.rows[0].n,
    last_24h: last24hR.rows[0].n,
    last_7d: last7dR.rows[0].n,
    by_type: byTypeR.rows.reduce((acc, r) => { acc[r.event_type] = r.n; return acc; }, {}),
    recent_failures: recentFailR.rows.map((r) => ({
      event_id: r.event_id,
      event_type: r.event_type,
      tenant_id: r.tenant_id,
      module_code: r.module_code,
      emitted_at: r.emitted_at,
      payload: r.payload,
    })),
  };
}
