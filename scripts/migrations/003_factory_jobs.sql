-- Migration 003: Durable business factory job queue
-- Supports autonomous launch, retry, recovery, and worker leasing.

CREATE TABLE IF NOT EXISTS factory_jobs (
  job_id text PRIMARY KEY,
  tenant_id text REFERENCES tenants(tenant_id) ON DELETE SET NULL,
  queue text NOT NULL DEFAULT 'default',
  type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  priority integer NOT NULL DEFAULT 50,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  worker_id text,
  idempotency_key text,
  payload jsonb NOT NULL DEFAULT '{}',
  last_error text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_factory_jobs_idempotency_key
  ON factory_jobs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_factory_jobs_claim
  ON factory_jobs(queue, status, run_after, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_factory_jobs_tenant_id
  ON factory_jobs(tenant_id);

CREATE INDEX IF NOT EXISTS idx_factory_jobs_type
  ON factory_jobs(type);

INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('003', 'Durable business factory job queue', now())
ON CONFLICT (version) DO NOTHING;
