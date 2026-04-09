// ── Your Deputy — Project Memory ────────────────────────────────────────
// Inspired by Claude Code's autoDream memory consolidation pattern.
// Tracks: what was built, what customizations were made, what failed.
// Over time, the launcher learns your patterns and avoids repeating mistakes.
export const maxDuration = 30;

// Memory is stored in Neon via Vercel storage integration.
// Falls back to in-memory (ephemeral) if Neon is unavailable.

const MEMORY_TABLE = 'dynasty_launcher_memory';

async function getPool() {
  const connStr = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connStr) return null;
  // Use pg-pool via dynamic import (available in Vercel Node runtime)
  try {
    const { Pool } = await import('pg');
    return new Pool({ connectionString: connStr, max: 3, idleTimeoutMillis: 5000 });
  } catch { return null; }
}

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${MEMORY_TABLE} (
      id SERIAL PRIMARY KEY,
      project_slug TEXT NOT NULL,
      project_type TEXT,
      niche_name TEXT,
      build_config JSONB DEFAULT '{}',
      build_result JSONB DEFAULT '{}',
      files_generated TEXT[] DEFAULT '{}',
      infra_provisioned JSONB DEFAULT '{}',
      errors TEXT[] DEFAULT '{}',
      model_used TEXT,
      total_cost NUMERIC(10,6) DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      build_duration_ms INTEGER,
      context_snapshot JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_memory_slug ON ${MEMORY_TABLE}(project_slug);
    CREATE INDEX IF NOT EXISTS idx_memory_type ON ${MEMORY_TABLE}(project_type);
    CREATE INDEX IF NOT EXISTS idx_memory_created ON ${MEMORY_TABLE}(created_at DESC);
  `);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.method === 'GET'
    ? req.query?.action
    : (req.body?.action || req.query?.action);

  const pool = await getPool();

  // ── No DB — return empty results gracefully ────────────────────────────
  if (!pool) {
    if (action === 'list' || action === 'stats') {
      return res.json({ entries: [], stats: {}, note: 'No database configured — memory is disabled' });
    }
    if (action === 'record') {
      return res.json({ ok: true, note: 'Memory disabled — no database' });
    }
    return res.json({ available: false, note: 'Set POSTGRES_URL to enable project memory' });
  }

  try {
    await ensureTable(pool);

    // ── RECORD a build ──────────────────────────────────────────────────────
    if (action === 'record' && req.method === 'POST') {
      const b = req.body || {};
      const result = await pool.query(
        `INSERT INTO ${MEMORY_TABLE}
         (project_slug, project_type, niche_name, build_config, build_result,
          files_generated, infra_provisioned, errors, model_used,
          total_cost, total_tokens, build_duration_ms, context_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [
          b.project_slug || 'unknown',
          b.project_type || '',
          b.niche_name || '',
          JSON.stringify(b.build_config || {}),
          JSON.stringify(b.build_result || {}),
          b.files_generated || [],
          JSON.stringify(b.infra_provisioned || {}),
          b.errors || [],
          b.model_used || '',
          b.total_cost || 0,
          b.total_tokens || 0,
          b.build_duration_ms || 0,
          JSON.stringify(b.context_snapshot || {}),
        ]
      );
      return res.json({ ok: true, id: result.rows[0].id });
    }

    // ── LIST recent builds ──────────────────────────────────────────────────
    if (action === 'list') {
      const limit = Math.min(parseInt(req.query?.limit || '20'), 100);
      const type_filter = req.query?.type;
      let query = `SELECT * FROM ${MEMORY_TABLE}`;
      const params = [];
      if (type_filter) {
        query += ` WHERE project_type = $1`;
        params.push(type_filter);
      }
      query += ` ORDER BY created_at DESC LIMIT ${limit}`;
      const result = await pool.query(query, params);
      return res.json({ entries: result.rows });
    }

    // ── GET specific project history ────────────────────────────────────────
    if (action === 'project') {
      const slug = req.query?.slug || req.body?.slug;
      if (!slug) return res.status(400).json({ error: 'slug required' });
      const result = await pool.query(
        `SELECT * FROM ${MEMORY_TABLE} WHERE project_slug = $1 ORDER BY created_at DESC`,
        [slug]
      );
      return res.json({ entries: result.rows });
    }

    // ── STATS — aggregate learning ──────────────────────────────────────────
    if (action === 'stats') {
      const stats = await pool.query(`
        SELECT
          COUNT(*) as total_builds,
          COUNT(DISTINCT project_type) as unique_types,
          SUM(total_cost) as lifetime_cost,
          SUM(total_tokens) as lifetime_tokens,
          AVG(build_duration_ms) as avg_build_ms,
          AVG(total_cost) as avg_cost_per_build,
          (SELECT project_type FROM ${MEMORY_TABLE}
           GROUP BY project_type ORDER BY COUNT(*) DESC LIMIT 1) as most_built_type,
          (SELECT model_used FROM ${MEMORY_TABLE}
           WHERE model_used != '' GROUP BY model_used ORDER BY COUNT(*) DESC LIMIT 1) as most_used_model,
          (SELECT ARRAY_AGG(DISTINCT unnest_err)
           FROM ${MEMORY_TABLE}, UNNEST(errors) AS unnest_err
           WHERE created_at > NOW() - INTERVAL '7 days') as recent_errors
        FROM ${MEMORY_TABLE}
      `);
      return res.json({ stats: stats.rows[0] || {} });
    }

    // ── CONTEXT — get compressed context for smart builds ───────────────────
    // Returns a compact "what we've learned" object for feeding into new builds
    if (action === 'context') {
      const type_filter = req.query?.type || req.body?.type;
      let query = `
        SELECT project_type, model_used, total_cost, errors, build_duration_ms,
               build_config->'stack' as stack, build_config->'revenue_model' as revenue
        FROM ${MEMORY_TABLE}
      `;
      const params = [];
      if (type_filter) {
        query += ` WHERE project_type = $1`;
        params.push(type_filter);
      }
      query += ` ORDER BY created_at DESC LIMIT 10`;
      const result = await pool.query(query, params);

      // Compress into actionable context
      const context = {
        builds_analyzed: result.rows.length,
        common_errors: [...new Set(result.rows.flatMap(r => r.errors || []))].slice(0, 10),
        avg_cost: result.rows.length
          ? (result.rows.reduce((s, r) => s + parseFloat(r.total_cost || 0), 0) / result.rows.length).toFixed(4)
          : '0',
        preferred_models: [...new Set(result.rows.map(r => r.model_used).filter(Boolean))],
        avg_duration_sec: result.rows.length
          ? Math.round(result.rows.reduce((s, r) => s + (r.build_duration_ms || 0), 0) / result.rows.length / 1000)
          : 0,
        hint: result.rows.length > 3
          ? 'Launcher has enough history to optimize model selection and prompt patterns.'
          : 'Building history — patterns will improve after a few more builds.',
      };
      return res.json({ context });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  } finally {
    if (pool) await pool.end();
  }
}
