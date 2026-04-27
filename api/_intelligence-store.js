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
      shipped_at              TIMESTAMPTZ,
      shipped_url             TEXT,
      shipped_vercel_project_id  TEXT,
      shipped_stripe_product_id  TEXT,
      shipped_posthog_event_prefix TEXT,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Forward-compatible: add ship columns when upgrading from a phase-1 schema.
  // These no-op when columns already exist.
  await pool.query(`ALTER TABLE dynasty_offer_intelligence ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;`).catch(() => {});
  await pool.query(`ALTER TABLE dynasty_offer_intelligence ADD COLUMN IF NOT EXISTS shipped_url TEXT;`).catch(() => {});
  await pool.query(`ALTER TABLE dynasty_offer_intelligence ADD COLUMN IF NOT EXISTS shipped_vercel_project_id TEXT;`).catch(() => {});
  await pool.query(`ALTER TABLE dynasty_offer_intelligence ADD COLUMN IF NOT EXISTS shipped_stripe_product_id TEXT;`).catch(() => {});
  await pool.query(`ALTER TABLE dynasty_offer_intelligence ADD COLUMN IF NOT EXISTS shipped_posthog_event_prefix TEXT;`).catch(() => {});

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_oi_topic_slug ON dynasty_offer_intelligence(topic_slug);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_oi_decision ON dynasty_offer_intelligence(build_decision);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_oi_status ON dynasty_offer_intelligence(status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_oi_model_version ON dynasty_offer_intelligence(model_version);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_oi_shipped_at ON dynasty_offer_intelligence(shipped_at);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dynasty_offer_intelligence_metrics (
      id                   SERIAL PRIMARY KEY,
      decision_id          INTEGER NOT NULL REFERENCES dynasty_offer_intelligence(id) ON DELETE CASCADE,
      recorded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source               TEXT NOT NULL DEFAULT 'manual',
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
  await pool.query(`ALTER TABLE dynasty_offer_intelligence_metrics ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';`).catch(() => {});
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
// `source` distinguishes manual entry from automated vendor pulls so the
// allocator can weight automated data higher when computing
// avg_predicted_vs_actual_delta.
export async function recordPostLaunchMetrics({ decision_id, metrics, source }) {
  const pool = await getPool();
  if (!pool) return { ok: false, error: 'Neon not configured' };
  try {
    await ensureTables(pool);
    const m = metrics || {};
    const r = await pool.query(
      `INSERT INTO dynasty_offer_intelligence_metrics
         (decision_id, source, shipped, shipped_at, pageviews_30d, conversion_rate, refund_rate,
          review_quality_avg, support_friction_events, upsell_conversion_rate,
          predicted_vs_actual_delta, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, recorded_at`,
      [
        parseInt(decision_id),
        String(source || 'manual'),
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

// Link an approved decision to vendor IDs so automated metrics collection
// can find the right PostHog project / Stripe product / Vercel deployment.
// Only decisions in approved/approved_override status can be marked shipped.
export async function markShipped({ decision_id, shipped_url, shipped_vercel_project_id, shipped_stripe_product_id, shipped_posthog_event_prefix, shipped_at }) {
  const pool = await getPool();
  if (!pool) return { ok: false, error: 'Neon not configured' };
  try {
    await ensureTables(pool);
    const r = await pool.query(
      `UPDATE dynasty_offer_intelligence
         SET shipped_at = COALESCE($2, NOW()),
             shipped_url = $3,
             shipped_vercel_project_id = $4,
             shipped_stripe_product_id = $5,
             shipped_posthog_event_prefix = $6
         WHERE id = $1 AND status IN ('approved', 'approved_override')
         RETURNING id, status, shipped_at, shipped_url, topic, topic_slug,
                   shipped_vercel_project_id, shipped_stripe_product_id,
                   shipped_posthog_event_prefix`,
      [
        parseInt(decision_id),
        shipped_at || null,
        shipped_url || '',
        shipped_vercel_project_id || '',
        shipped_stripe_product_id || '',
        shipped_posthog_event_prefix || '',
      ]
    );
    if (!r.rows[0]) return { ok: false, error: 'Cannot mark shipped — decision not found or not in approved/approved_override status.' };
    return { ok: true, decision: r.rows[0] };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await pool.end().catch(() => {});
  }
}

// Used by the metrics collector cron to find what to fetch metrics for.
export async function listShippedDecisions() {
  const pool = await getPool();
  if (!pool) return { ok: false, decisions: [], error: 'Neon not configured' };
  try {
    await ensureTables(pool);
    const r = await pool.query(
      `SELECT id, topic, topic_slug, shipped_at, shipped_url,
              shipped_vercel_project_id, shipped_stripe_product_id,
              shipped_posthog_event_prefix, opportunity_score, report
         FROM dynasty_offer_intelligence
         WHERE shipped_at IS NOT NULL
         ORDER BY shipped_at DESC`
    );
    return { ok: true, decisions: r.rows };
  } catch (e) {
    return { ok: false, decisions: [], error: e.message };
  } finally {
    await pool.end().catch(() => {});
  }
}

export async function listPostLaunchMetricsAll() {
  const pool = await getPool();
  if (!pool) return { ok: false, metrics: [] };
  try {
    await ensureTables(pool);
    const r = await pool.query(
      `SELECT decision_id,
              MAX(recorded_at) as last_recorded_at,
              MAX(predicted_vs_actual_delta) as latest_predicted_vs_actual_delta,
              COUNT(*) as record_count
         FROM dynasty_offer_intelligence_metrics
         WHERE source != 'manual' OR predicted_vs_actual_delta IS NOT NULL
         GROUP BY decision_id`
    );
    return { ok: true, metrics: r.rows };
  } catch (e) {
    return { ok: false, metrics: [], error: e.message };
  } finally {
    await pool.end().catch(() => {});
  }
}

// Deterministic snapshot of the current portfolio. Computed without AI.
// Drives the PortfolioAllocation report so two consecutive allocator runs
// see the same numbers.
export async function computeCurrentState() {
  const pool = await getPool();
  const empty = {
    total_decisions: 0, approved_count: 0, shipped_count: 0, pending_count: 0,
    rejected_count: 0, do_not_build_count: 0, override_count: 0,
    by_portfolio_role: {}, by_upsell_role: {}, by_authority_role: {},
    by_category: {}, by_delivery_format: {}, identity_risk_concentration: { low: 0, medium: 0, high: 0 },
    avg_opportunity_score: 0, avg_predicted_vs_actual_delta: null, shipped_with_metrics_count: 0,
  };
  if (!pool) return { ok: false, state: empty, error: 'Neon not configured' };
  try {
    await ensureTables(pool);
    const counts = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('approved','approved_override')) as approved,
        COUNT(*) FILTER (WHERE shipped_at IS NOT NULL) as shipped,
        COUNT(*) FILTER (WHERE status = 'pending_review') as pending,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE build_decision = 'DO_NOT_BUILD') as do_not_build,
        COUNT(*) FILTER (WHERE operator_override = TRUE) as overrides,
        AVG(opportunity_score) FILTER (WHERE status IN ('approved','approved_override')) as avg_score
      FROM dynasty_offer_intelligence;
    `);
    const c = counts.rows[0] || {};

    // Status filter for breakdowns: only approved+shipped products count
    // toward the allocator's "current portfolio". Pending/rejected are noise.
    const breakdownWhere = `WHERE status IN ('approved','approved_override')`;

    const tally = async (jsonField) => {
      const r = await pool.query(`
        SELECT report->'decision'->'portfolio_metadata'->>'${jsonField}' as k, COUNT(*) as n
        FROM dynasty_offer_intelligence ${breakdownWhere}
        GROUP BY k;
      `);
      const out = {};
      for (const row of r.rows) {
        const k = row.k || 'unknown';
        out[k] = (out[k] || 0) + parseInt(row.n);
      }
      return out;
    };
    const tallyByPath = async (path) => {
      const r = await pool.query(`
        SELECT report->'decision'->>'${path}' as k, COUNT(*) as n
        FROM dynasty_offer_intelligence ${breakdownWhere}
        GROUP BY k;
      `);
      const out = {};
      for (const row of r.rows) {
        const k = row.k || 'unknown';
        out[k] = (out[k] || 0) + parseInt(row.n);
      }
      return out;
    };
    const tallyDeliveryFormat = async () => {
      const r = await pool.query(`
        SELECT report->'decision'->'best_delivery_format'->>'format' as k, COUNT(*) as n
        FROM dynasty_offer_intelligence ${breakdownWhere}
        GROUP BY k;
      `);
      const out = {};
      for (const row of r.rows) {
        const k = row.k || 'unknown';
        out[k] = (out[k] || 0) + parseInt(row.n);
      }
      return out;
    };
    const tallyIdentityRisk = async () => {
      const r = await pool.query(`
        SELECT report->'judgment'->'identity_safety'->>'score' as score
        FROM dynasty_offer_intelligence ${breakdownWhere};
      `);
      const out = { low: 0, medium: 0, high: 0 };
      for (const row of r.rows) {
        const s = parseFloat(row.score);
        if (Number.isFinite(s)) {
          if (s >= 7) out.low++;
          else if (s >= 4) out.medium++;
          else out.high++;
        }
      }
      return out;
    };
    const [byPortfolioRole, byUpsellRole, byAuthorityRole, byCategory, byDeliveryFormat, identityConc, deltaAgg, withMetrics] = await Promise.all([
      tally('portfolio_role'),
      tally('upsell_role'),
      tally('authority_role'),
      tallyByPath('category'),
      tallyDeliveryFormat(),
      tallyIdentityRisk(),
      pool.query(`SELECT AVG(predicted_vs_actual_delta) as avg_delta FROM dynasty_offer_intelligence_metrics WHERE predicted_vs_actual_delta IS NOT NULL;`),
      pool.query(`SELECT COUNT(DISTINCT decision_id) as n FROM dynasty_offer_intelligence_metrics;`),
    ]);
    const state = {
      total_decisions: parseInt(c.total) || 0,
      approved_count: parseInt(c.approved) || 0,
      shipped_count: parseInt(c.shipped) || 0,
      pending_count: parseInt(c.pending) || 0,
      rejected_count: parseInt(c.rejected) || 0,
      do_not_build_count: parseInt(c.do_not_build) || 0,
      override_count: parseInt(c.overrides) || 0,
      by_portfolio_role: byPortfolioRole,
      by_upsell_role: byUpsellRole,
      by_authority_role: byAuthorityRole,
      by_category: byCategory,
      by_delivery_format: byDeliveryFormat,
      identity_risk_concentration: identityConc,
      avg_opportunity_score: parseFloat(c.avg_score) || 0,
      avg_predicted_vs_actual_delta: deltaAgg.rows[0]?.avg_delta != null ? parseFloat(deltaAgg.rows[0].avg_delta) : null,
      shipped_with_metrics_count: parseInt(withMetrics.rows[0]?.n) || 0,
    };
    return { ok: true, state };
  } catch (e) {
    return { ok: false, state: empty, error: e.message };
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
