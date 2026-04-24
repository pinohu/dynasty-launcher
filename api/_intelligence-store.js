// Persistence layer for the Offer Intelligence Engine.
//
// Source of truth: Neon Postgres (queryable, durable, auditable).
// Best-effort secondary: local filesystem at gumroad-output/_intelligence/
// for operators running the launcher locally — silent no-op on Vercel's
// read-only production FS.
//
// Design invariants:
//   - Every row carries model_version so historical decisions stay comparable
//     when the OIE rubric evolves.
//   - DO_NOT_BUILD verdicts are not blindly overridable. `status` moves to
//     'approved_override' only when operator_override = true AND an
//     override_reason is supplied (min 50 chars enforced in endpoint).
//   - Separate post-launch-metrics table wires up the feedback loop so OIE
//     can eventually compare predicted vs. actual outcomes.

import fs from 'fs';
import path from 'path';

const INTEL_ROOT = path.join(process.cwd(), 'gumroad-output', '_intelligence');
const ARCHIVE_DIR = path.join(INTEL_ROOT, '_do_not_build_archive');

function slugify(s) {
  return String(s || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}

async function getPool() {
  if (!process.env.NEON_STORE_ID) return null;
  try {
    const { Pool } = await import('pg');
    return new Pool({ connectionString: process.env.NEON_STORE_ID });
  } catch { return null; }
}

async function ensureTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dynasty_offer_intelligence (
      id                      SERIAL PRIMARY KEY,
      model_version           TEXT NOT NULL,
      topic                   TEXT NOT NULL,
      topic_slug              TEXT NOT NULL,
      build_decision          TEXT NOT NULL,
      opportunity_score       NUMERIC(5,2) NOT NULL,
      status                  TEXT NOT NULL DEFAULT 'pending_review',
      input                   JSONB NOT NULL,
      report                  JSONB NOT NULL,
      model                   TEXT,
      provider                TEXT,
      approved_at             TIMESTAMPTZ,
      approved_by             TEXT,
      rejected_at             TIMESTAMPTZ,
      rejected_by             TEXT,
      rejection_reason        TEXT,
      operator_override       BOOLEAN NOT NULL DEFAULT FALSE,
      override_reason         TEXT,
      override_by             TEXT,
      override_at             TIMESTAMPTZ,
      outline_generated_at    TIMESTAMPTZ,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_oi_topic_slug ON dynasty_offer_intelligence(topic_slug);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_oi_decision ON dynasty_offer_intelligence(build_decision);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_oi_status ON dynasty_offer_intelligence(status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_oi_model_version ON dynasty_offer_intelligence(model_version);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dynasty_offer_intelligence_metrics (
      id                   SERIAL PRIMARY KEY,
      decision_id          INTEGER NOT NULL REFERENCES dynasty_offer_intelligence(id) ON DELETE CASCADE,
      recorded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      shipped              BOOLEAN NOT NULL DEFAULT FALSE,
      shipped_at           TIMESTAMPTZ,
      pageviews_30d        INTEGER,
      conversion_rate      NUMERIC(6,4),
      refund_rate          NUMERIC(6,4),
      review_quality_avg   NUMERIC(4,2),
      support_friction_events INTEGER,
      upsell_conversion_rate NUMERIC(6,4),
      predicted_vs_actual_delta NUMERIC(6,2),
      notes                TEXT DEFAULT ''
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_oim_decision ON dynasty_offer_intelligence_metrics(decision_id);`);
}

function writeLocalBestEffort(slug, record, { is_do_not_build } = {}) {
  try {
    const dir = path.join(INTEL_ROOT, slug);
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(dir, `${stamp}.json`), JSON.stringify(record, null, 2), 'utf8');
    if (is_do_not_build) {
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
      fs.writeFileSync(path.join(ARCHIVE_DIR, `${slug}_${stamp}.json`), JSON.stringify(record, null, 2), 'utf8');
    }
    const history = path.join(INTEL_ROOT, 'decision-history.md');
    const killFlags = record.report?.decision?.kill_flags_triggered || [];
    const reason = record.report?.decision?.build_decision_reason || '';
    const line = `- \`${record.created_at}\` — **${record.build_decision}** — [${record.model_version}] ${record.topic} — score ${record.opportunity_score} — id ${record.id || '?'}${killFlags.length ? ' — flags: ' + killFlags.join(', ') : ''}${reason ? ' — ' + reason.slice(0, 160) : ''}\n`;
    fs.appendFileSync(history, line, 'utf8');
    return { ok: true, path: dir };
  } catch {
    return { ok: false };
  }
}

export async function saveDecision({ input, report, model, provider }) {
  const topic = report?.topic || input?.topic || 'unknown';
  const slug = slugify(topic);
  const build_decision = report?.decision?.build_decision || 'DO_NOT_BUILD';
  const opportunity_score = Number(report?.scoring?.opportunity_score ?? 0);
  const model_version = report?.model_version || 'oie-unversioned';
  const status = 'pending_review';
  const now = new Date().toISOString();
  const is_do_not_build = build_decision === 'DO_NOT_BUILD';

  const pool = await getPool();
  let id = null;
  let warning = null;
  if (pool) {
    try {
      await ensureTables(pool);
      const r = await pool.query(
        `INSERT INTO dynasty_offer_intelligence
          (model_version, topic, topic_slug, build_decision, opportunity_score, status, input, report, model, provider)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, created_at`,
        [model_version, topic, slug, build_decision, opportunity_score, status, input, report, model || null, provider || null]
      );
      id = r.rows[0].id;
    } catch (e) {
      warning = `neon_failed: ${e.message}`;
    }
    await pool.end().catch(() => {});
  }

  const record = {
    id, model_version, topic, topic_slug: slug, build_decision, opportunity_score, status,
    input, report, model, provider, created_at: now,
  };
  const local = writeLocalBestEffort(slug, record, { is_do_not_build });
  return { ok: true, id, slug, model_version, build_decision, opportunity_score, persisted: { neon: !!pool && !warning, local: local.ok }, warning };
}

export async function listDecisions({ limit = 50, filter = 'all', model_version = null } = {}) {
  const pool = await getPool();
  if (!pool) return { ok: true, decisions: [], note: 'Neon not configured — decision history unavailable in serverless runtime' };
  try {
    await ensureTables(pool);
    const clauses = [];
    const params = [];
    if (filter === 'do_not_build') clauses.push(`build_decision = 'DO_NOT_BUILD'`);
    else if (filter === 'build') clauses.push(`build_decision = 'BUILD'`);
    else if (filter === 'approved') clauses.push(`status IN ('approved', 'approved_override')`);
    else if (filter === 'pending') clauses.push(`status = 'pending_review'`);
    else if (filter === 'override') clauses.push(`operator_override = TRUE`);
    if (model_version) {
      params.push(model_version);
      clauses.push(`model_version = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(Math.min(Math.max(parseInt(limit) || 50, 1), 200));
    const r = await pool.query(
      `SELECT id, model_version, topic, topic_slug, build_decision, opportunity_score, status,
              operator_override, override_reason, approved_at, rejected_at, outline_generated_at,
              model, provider, created_at
         FROM dynasty_offer_intelligence
         ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length}`,
      params
    );
    return { ok: true, decisions: r.rows };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await pool.end().catch(() => {});
  }
}

export async function getDecision(id) {
  const pool = await getPool();
  if (!pool) return { ok: false, error: 'Neon not configured' };
  try {
    await ensureTables(pool);
    const r = await pool.query(`SELECT * FROM dynasty_offer_intelligence WHERE id = $1`, [parseInt(id)]);
    if (!r.rows[0]) return { ok: false, error: 'not_found' };
    return { ok: true, decision: r.rows[0] };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await pool.end().catch(() => {});
  }
}

export async function approveDecision({ id, approved_by }) {
  const pool = await getPool();
  if (!pool) return { ok: false, error: 'Neon not configured — cannot track approval state' };
  try {
    await ensureTables(pool);
    const r = await pool.query(
      `UPDATE dynasty_offer_intelligence
         SET status = 'approved', approved_at = NOW(), approved_by = $2,
             rejected_at = NULL, rejection_reason = NULL
         WHERE id = $1 AND build_decision = 'BUILD'
         RETURNING id, status, approved_at, topic, topic_slug, build_decision`,
      [parseInt(id), approved_by || 'admin']
    );
    if (!r.rows[0]) return { ok: false, error: 'Cannot approve — decision not found, or its build_decision is DO_NOT_BUILD (use operator_override instead).' };
    return { ok: true, decision: r.rows[0] };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await pool.end().catch(() => {});
  }
}

// Explicit override of a DO_NOT_BUILD verdict. Requires a substantive
// override_reason (the endpoint enforces minimum length). Sets operator_override
// = true so downstream systems (outline, UI) can warn and track outcomes.
export async function overrideDecision({ id, override_by, override_reason }) {
  const pool = await getPool();
  if (!pool) return { ok: false, error: 'Neon not configured' };
  try {
    await ensureTables(pool);
    const r = await pool.query(
      `UPDATE dynasty_offer_intelligence
         SET status = 'approved_override',
             operator_override = TRUE,
             override_reason = $2,
             override_by = $3,
             override_at = NOW(),
             approved_at = NOW(),
             approved_by = $3
         WHERE id = $1
         RETURNING id, status, approved_at, operator_override, override_reason, topic, topic_slug, build_decision`,
      [parseInt(id), override_reason, override_by || 'admin']
    );
    if (!r.rows[0]) return { ok: false, error: 'not_found' };
    return { ok: true, decision: r.rows[0] };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await pool.end().catch(() => {});
  }
}

export async function rejectDecision({ id, rejected_by, reason }) {
  const pool = await getPool();
  if (!pool) return { ok: false, error: 'Neon not configured' };
  try {
    await ensureTables(pool);
    const r = await pool.query(
      `UPDATE dynasty_offer_intelligence
         SET status = 'rejected', rejected_at = NOW(), rejected_by = $2,
             rejection_reason = $3, approved_at = NULL
         WHERE id = $1
         RETURNING id, status, rejected_at, topic, topic_slug`,
      [parseInt(id), rejected_by || 'admin', reason || '']
    );
    if (!r.rows[0]) return { ok: false, error: 'not_found' };
    return { ok: true, decision: r.rows[0] };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await pool.end().catch(() => {});
  }
}

export async function markOutlineGenerated(id) {
  const pool = await getPool();
  if (!pool) return { ok: false, error: 'Neon not configured' };
  try {
    await ensureTables(pool);
    await pool.query(
      `UPDATE dynasty_offer_intelligence SET outline_generated_at = NOW() WHERE id = $1`,
      [parseInt(id)]
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await pool.end().catch(() => {});
  }
}

// Gatekeeper for outline generation. Allowed only when:
//   - decision exists
//   - build_decision === 'BUILD'  AND status === 'approved'       (normal path)
//   - OR  status === 'approved_override' AND operator_override    (friction path)
// Returns decision + warn flag so the outline generator can still mark its
// output as "override" and track post-launch outcomes separately.
export async function isOutlineAllowed(id) {
  const got = await getDecision(id);
  if (!got.ok) return { allowed: false, reason: got.error || 'decision_not_found' };
  const d = got.decision;
  if (d.status === 'approved' && d.build_decision === 'BUILD') {
    return { allowed: true, decision: d, warn_override: false };
  }
  if (d.status === 'approved_override' && d.operator_override) {
    return { allowed: true, decision: d, warn_override: true, override_reason: d.override_reason };
  }
  if (d.build_decision !== 'BUILD') {
    return { allowed: false, reason: 'OIE verdict is DO_NOT_BUILD — requires operator_override action (with reason) before outline generation.', decision: d };
  }
  return { allowed: false, reason: `Decision is in status "${d.status}" — requires human approval before outline generation.`, decision: d };
}

// Record post-launch reality for the feedback loop (spec §6).
// Called by ops tooling once metrics are known.
export async function recordPostLaunchMetrics({ decision_id, metrics }) {
  const pool = await getPool();
  if (!pool) return { ok: false, error: 'Neon not configured' };
  try {
    await ensureTables(pool);
    const m = metrics || {};
    const r = await pool.query(
      `INSERT INTO dynasty_offer_intelligence_metrics
         (decision_id, shipped, shipped_at, pageviews_30d, conversion_rate, refund_rate,
          review_quality_avg, support_friction_events, upsell_conversion_rate,
          predicted_vs_actual_delta, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, recorded_at`,
      [
        parseInt(decision_id),
        !!m.shipped,
        m.shipped_at || null,
        m.pageviews_30d ?? null,
        m.conversion_rate ?? null,
        m.refund_rate ?? null,
        m.review_quality_avg ?? null,
        m.support_friction_events ?? null,
        m.upsell_conversion_rate ?? null,
        m.predicted_vs_actual_delta ?? null,
        m.notes || '',
      ]
    );
    return { ok: true, metric_id: r.rows[0].id, recorded_at: r.rows[0].recorded_at };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await pool.end().catch(() => {});
  }
}

export async function listPostLaunchMetrics(decision_id) {
  const pool = await getPool();
  if (!pool) return { ok: false, error: 'Neon not configured' };
  try {
    await ensureTables(pool);
    const r = await pool.query(
      `SELECT * FROM dynasty_offer_intelligence_metrics WHERE decision_id = $1 ORDER BY recorded_at DESC`,
      [parseInt(decision_id)]
    );
    return { ok: true, metrics: r.rows };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await pool.end().catch(() => {});
  }
}
