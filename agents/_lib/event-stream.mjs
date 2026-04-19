// agents/_lib/event-stream.mjs
// Phase 3: structured event log for every agent run. Powers replay,
// resume-from-crash, time-travel debugging, and context pruning.
//
// Writes are append-only. Reads support three shapes:
// 1. replay(run_id) — all events in order.
// 2. context(run_id) — pruned-for-LLM: plan + last observation + active
//    constraints per subagent. Replaces linear conversation-history
//    context with a selective replay that stays under token budget even
//    on long runs.
// 3. runs(filters) — list runs with status for the dashboard.
//
// pg is imported lazily so the module loads in environments without
// postgres installed (tests, static analysis). Any actual call throws a
// clear error if pg is absent.
// -----------------------------------------------------------------------------

let _pool = null;

async function pool() {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const pg = await import('pg');
  const { Pool } = pg.default || pg;
  _pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
  return _pool;
}

// ── Writes ───────────────────────────────────────────────────────────────────

export async function startRun({ run_id, tenant_id, user_prompt, tier = 'foundation' }) {
  const p = await pool();
  if (!p) return { run_id, stored: false };
  await p.query(
    `insert into agent_runs (run_id, tenant_id, user_prompt, tier, status)
     values (\$1, \$2, \$3, \$4, 'in_progress')
     on conflict (run_id) do nothing`,
    [run_id, tenant_id, user_prompt, tier],
  );
  return { run_id, stored: true };
}

// Fire-and-forget — callers do not await this.
export function appendEvent({ run_id, iteration, subagent, event_type, tool_name = null, payload = {}, status = 'ok' }) {
  pool().then((p) => {
    if (!p) return;
    p.query(
      `insert into agent_events (run_id, iteration, subagent, event_type, tool_name, payload, status)
       values (\$1, \$2, \$3, \$4, \$5, \$6::jsonb, \$7)`,
      [run_id, iteration, subagent, event_type, tool_name, JSON.stringify(payload), status],
    ).catch((err) => console.error('[event-stream] append failed:', err.message));
  }).catch((err) => console.error('[event-stream] pool init failed:', err.message));
}

export async function completeRun({ run_id, status = 'complete', halt_reason = null, halt_context = null }) {
  const p = await pool();
  if (!p) return;
  await p.query(
    `update agent_runs set status = \$2, completed_at = now(),
       halt_reason = \$3, halt_context = \$4::jsonb
     where run_id = \$1`,
    [run_id, status, halt_reason, halt_context ? JSON.stringify(halt_context) : null],
  );
}

// ── Reads: replay ────────────────────────────────────────────────────────────

export async function replay({ run_id, since_event_id = null, limit = 1000 }) {
  const p = await pool();
  if (!p) throw new Error('DATABASE_URL not set');
  const params = [run_id];
  let where = 'run_id = $1';
  if (since_event_id !== null) { params.push(since_event_id); where += ` and event_id > \$${params.length}`; }
  params.push(limit);
  const res = await p.query(
    `select event_id, iteration, subagent, event_type, tool_name, payload, status, created_at
     from agent_events where ${where} order by event_id asc limit \$${params.length}`,
    params,
  );
  return { events: res.rows };
}

// ── Reads: context (pruned for LLM) ──────────────────────────────────────────

export async function context({ run_id }) {
  const p = await pool();
  if (!p) throw new Error('DATABASE_URL not set');
  const [planRes, lastObsRes, haltsRes, runRes] = await Promise.all([
    p.query(`select payload from agent_events where run_id=\$1 and event_type='plan_emitted' order by event_id desc limit 1`, [run_id]),
    p.query(`select distinct on (subagent) subagent, event_type, tool_name, payload, status, created_at
             from agent_events where run_id=\$1 and event_type in ('observation','submit_results')
             order by subagent, event_id desc`, [run_id]),
    p.query(`select event_id, subagent, payload, status, created_at from agent_events
             where run_id=\$1 and event_type in ('halt','escalation') order by event_id desc limit 20`, [run_id]),
    p.query(`select run_id, tenant_id, status, tier, operating_llc, started_at, completed_at from agent_runs where run_id=\$1`, [run_id]),
  ]);
  return {
    run: runRes.rows[0] || null,
    plan: planRes.rows[0]?.payload || null,
    last_observations_by_subagent: lastObsRes.rows,
    halts: haltsRes.rows,
  };
}

// ── Reads: runs list ─────────────────────────────────────────────────────────

export async function runs({ tenant_id = null, status = null, since = null, limit = 50 }) {
  const p = await pool();
  if (!p) throw new Error('DATABASE_URL not set');
  const params = [];
  const clauses = [];
  if (tenant_id) { params.push(tenant_id); clauses.push(`tenant_id = \$${params.length}`); }
  if (status)    { params.push(status);    clauses.push(`status = \$${params.length}`); }
  if (since)     { params.push(since);     clauses.push(`started_at >= \$${params.length}`); }
  const where = clauses.length ? 'where ' + clauses.join(' and ') : '';
  params.push(limit);
  const res = await p.query(
    `select run_id, tenant_id, status, tier, operating_llc, started_at, completed_at, halt_reason
     from agent_runs ${where} order by started_at desc limit \$${params.length}`,
    params,
  );
  return { runs: res.rows };
}

// ── Resume helper ────────────────────────────────────────────────────────────

export async function resumePacket({ run_id }) {
  const p = await pool();
  if (!p) throw new Error('DATABASE_URL not set');
  const ctx = await context({ run_id });
  if (!ctx.run) throw new Error('run not found');
  if (ctx.run.status === 'complete') throw new Error('run already complete — nothing to resume');
  const submits = await p.query(
    `select payload from agent_events where run_id=\$1 and event_type='submit_results'
     order by event_id asc`, [run_id],
  );
  const verified_items = submits.rows.map(r => r.payload?.plan_item_id).filter(Boolean);
  const plan_items = ctx.plan?.items || [];
  const remaining = plan_items.filter(it => !verified_items.includes(it.id));
  return {
    run: ctx.run,
    plan: ctx.plan,
    verified_plan_items: verified_items,
    remaining_plan_items: remaining,
    last_observations_by_subagent: ctx.last_observations_by_subagent,
    unresolved_halts: ctx.halts.filter(h => h.status !== 'resolved'),
  };
}
