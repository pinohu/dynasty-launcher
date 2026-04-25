-- scripts/migrations/003_agent_runs.sql
-- Phase 3: event-stream replay, resume-from-crash, time-travel debugging.
-- Extends the existing events_log with structured agent-run tracking.
--
-- Apply with: psql "$DATABASE_URL" -f scripts/migrations/003_agent_runs.sql
-- Idempotent (IF NOT EXISTS throughout).
-- -----------------------------------------------------------------------------

-- A run is one orchestrator invocation from user prompt to final submit.
create table if not exists agent_runs (
  run_id             uuid primary key,
  tenant_id          text references tenants(tenant_id) on delete cascade,
  status             text not null default 'in_progress',
    -- in_progress | complete | halted | errored | abandoned
  user_prompt        text not null,
  tier               text not null default 'foundation',
  plan               jsonb,
  operating_llc      text,
  started_at         timestamptz not null default now(),
  completed_at       timestamptz,
  last_event_id      bigint,
  halt_reason        text,
  halt_context       jsonb
);
create index if not exists agent_runs_tenant_idx on agent_runs (tenant_id);
create index if not exists agent_runs_status_idx on agent_runs (status);
create index if not exists agent_runs_started_idx on agent_runs (started_at desc);

-- Every event within a run. This is the replay log.
create table if not exists agent_events (
  event_id           bigserial primary key,
  run_id             uuid not null references agent_runs(run_id) on delete cascade,
  iteration          integer not null,
  subagent           text,
    -- orchestrator | provisioner | code-generator | integrator | deployer | auditor
  event_type         text not null,
    -- user_prompt | plan_emitted | tool_call | observation | submit_results |
    -- halt | escalation | resume | thinking_block
  tool_name          text,
  payload            jsonb not null default '{}'::jsonb,
  status             text not null default 'ok',
    -- ok | error | timeout | rejected
  created_at         timestamptz not null default now()
);
create index if not exists agent_events_run_idx on agent_events (run_id, event_id);
create index if not exists agent_events_type_idx on agent_events (event_type);
create index if not exists agent_events_subagent_idx on agent_events (subagent);

-- Schema version bookkeeping.
insert into schema_migrations (version, description)
values (3, 'agent_runs + agent_events for replay/resume/time-travel')
on conflict (version) do nothing;
