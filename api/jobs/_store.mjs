import crypto from 'node:crypto';
import pg from 'pg';
import { z } from 'zod';

const { Pool } = pg;

const JobInput = z.object({
  type: z.string().min(2),
  payload: z.record(z.any()).default({}),
  tenant_id: z.string().optional().nullable(),
  queue: z.string().min(1).default('default'),
  priority: z.number().int().min(0).max(100).default(50),
  run_after: z.string().datetime().optional(),
  max_attempts: z.number().int().min(1).max(20).default(3),
  idempotency_key: z.string().min(2).optional(),
});

let pool = null;
const memoryJobs = [];

function nowIso() {
  return new Date().toISOString();
}

function newJobId() {
  return `job_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

function normalizedDatabaseUrl(value) {
  const raw = String(value || '');
  if (!raw) return raw;
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

function getPool() {
  if (!hasDatabase()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: normalizedDatabaseUrl(process.env.DATABASE_URL),
      max: 2,
      idleTimeoutMillis: 5000,
    });
  }
  return pool;
}

function normalizeJob(row) {
  if (!row) return null;
  return {
    job_id: row.job_id,
    tenant_id: row.tenant_id || null,
    queue: row.queue,
    type: row.type,
    status: row.status,
    priority: Number(row.priority || 0),
    attempts: Number(row.attempts || 0),
    max_attempts: Number(row.max_attempts || 1),
    run_after: typeof row.run_after === 'string' ? row.run_after : row.run_after?.toISOString?.(),
    locked_until:
      typeof row.locked_until === 'string'
        ? row.locked_until
        : row.locked_until?.toISOString?.() || null,
    worker_id: row.worker_id || null,
    idempotency_key: row.idempotency_key || null,
    payload: row.payload || {},
    last_error: row.last_error || null,
    result: row.result || null,
    created_at:
      typeof row.created_at === 'string' ? row.created_at : row.created_at?.toISOString?.(),
    updated_at:
      typeof row.updated_at === 'string' ? row.updated_at : row.updated_at?.toISOString?.(),
  };
}

function due(job, at = new Date()) {
  return new Date(job.run_after).getTime() <= at.getTime();
}

function sortJobs(a, b) {
  if (b.priority !== a.priority) return b.priority - a.priority;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

export async function enqueueJob(raw) {
  const input = JobInput.parse(raw);
  const createdAt = nowIso();
  const job = {
    job_id: newJobId(),
    tenant_id: input.tenant_id || null,
    queue: input.queue,
    type: input.type,
    status: 'queued',
    priority: input.priority,
    attempts: 0,
    max_attempts: input.max_attempts,
    run_after: input.run_after || createdAt,
    locked_until: null,
    worker_id: null,
    idempotency_key: input.idempotency_key || null,
    payload: input.payload,
    last_error: null,
    result: null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  const db = getPool();
  if (db) {
    const result = await db.query(
      `INSERT INTO factory_jobs
        (job_id, tenant_id, queue, type, status, priority, attempts, max_attempts, run_after,
         idempotency_key, payload, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
       ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO UPDATE
         SET updated_at = factory_jobs.updated_at
       RETURNING *`,
      [
        job.job_id,
        job.tenant_id,
        job.queue,
        job.type,
        job.status,
        job.priority,
        job.attempts,
        job.max_attempts,
        job.run_after,
        job.idempotency_key,
        JSON.stringify(job.payload),
        job.created_at,
        job.updated_at,
      ],
    );
    return normalizeJob(result.rows[0]);
  }

  if (job.idempotency_key) {
    const existing = memoryJobs.find(
      (candidate) => candidate.idempotency_key === job.idempotency_key,
    );
    if (existing) return { ...existing };
  }
  memoryJobs.push(job);
  return { ...job };
}

export async function claimNextJob({
  queue = 'default',
  worker_id = 'worker',
  lease_ms = 300000,
} = {}) {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + lease_ms).toISOString();
  const db = getPool();
  if (db) {
    const result = await db.query(
      `WITH candidate AS (
        SELECT job_id
        FROM factory_jobs
        WHERE queue = $1
          AND run_after <= now()
          AND (
            status = 'queued'
            OR (status = 'running' AND locked_until <= now())
            OR status = 'retry'
          )
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE factory_jobs
      SET status = 'running',
          attempts = attempts + 1,
          worker_id = $2,
          locked_until = $3,
          updated_at = now()
      FROM candidate
      WHERE factory_jobs.job_id = candidate.job_id
      RETURNING factory_jobs.*`,
      [queue, worker_id, lockedUntil],
    );
    return normalizeJob(result.rows[0]);
  }

  const candidate = memoryJobs
    .filter(
      (job) =>
        job.queue === queue &&
        due(job, now) &&
        (job.status === 'queued' ||
          job.status === 'retry' ||
          (job.status === 'running' && job.locked_until && new Date(job.locked_until) <= now)),
    )
    .sort(sortJobs)[0];
  if (!candidate) return null;
  candidate.status = 'running';
  candidate.attempts += 1;
  candidate.worker_id = worker_id;
  candidate.locked_until = lockedUntil;
  candidate.updated_at = nowIso();
  return { ...candidate };
}

export async function completeJob(jobId, result = {}) {
  const completedAt = nowIso();
  const db = getPool();
  if (db) {
    const response = await db.query(
      `UPDATE factory_jobs
       SET status = 'completed',
           result = $2::jsonb,
           locked_until = null,
           updated_at = $3
       WHERE job_id = $1
       RETURNING *`,
      [jobId, JSON.stringify(result), completedAt],
    );
    return normalizeJob(response.rows[0]);
  }
  const job = memoryJobs.find((candidate) => candidate.job_id === jobId);
  if (!job) return null;
  job.status = 'completed';
  job.result = result;
  job.locked_until = null;
  job.updated_at = completedAt;
  return { ...job };
}

export async function failJob(jobId, error, { retry_delay_ms = 60000 } = {}) {
  const failedAt = nowIso();
  const db = getPool();
  const message = String(error?.message || error || 'job_failed').slice(0, 1000);
  if (db) {
    const current = await db.query('SELECT * FROM factory_jobs WHERE job_id = $1', [jobId]);
    const row = current.rows[0];
    if (!row) return null;
    const nextStatus = row.attempts < row.max_attempts ? 'retry' : 'failed';
    const nextRun = new Date(Date.now() + retry_delay_ms).toISOString();
    const response = await db.query(
      `UPDATE factory_jobs
       SET status = $2,
           last_error = $3,
           run_after = CASE WHEN $2 = 'retry' THEN $4 ELSE run_after END,
           locked_until = null,
           updated_at = $5
       WHERE job_id = $1
       RETURNING *`,
      [jobId, nextStatus, message, nextRun, failedAt],
    );
    return normalizeJob(response.rows[0]);
  }
  const job = memoryJobs.find((candidate) => candidate.job_id === jobId);
  if (!job) return null;
  job.status = job.attempts < job.max_attempts ? 'retry' : 'failed';
  job.last_error = message;
  if (job.status === 'retry') job.run_after = new Date(Date.now() + retry_delay_ms).toISOString();
  job.locked_until = null;
  job.updated_at = failedAt;
  return { ...job };
}

export async function listJobs({ status = null, queue = null, limit = 100 } = {}) {
  const safeLimit = clampLimit(limit);
  const db = getPool();
  if (db) {
    const values = [];
    const where = [];
    if (status) {
      values.push(status);
      where.push(`status = $${values.length}`);
    }
    if (queue) {
      values.push(queue);
      where.push(`queue = $${values.length}`);
    }
    values.push(safeLimit);
    const result = await db.query(
      `SELECT * FROM factory_jobs
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC
       LIMIT $${values.length}`,
      values,
    );
    return result.rows.map(normalizeJob);
  }
  return memoryJobs
    .filter((job) => !status || job.status === status)
    .filter((job) => !queue || job.queue === queue)
    .slice(-safeLimit)
    .reverse()
    .map((job) => ({ ...job }));
}

function clampLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 100, 500));
}

export function _resetMemoryJobs() {
  memoryJobs.length = 0;
}

export async function _closeJobStore() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
