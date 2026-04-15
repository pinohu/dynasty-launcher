-- scripts/migrations/001_initial.sql
-- -----------------------------------------------------------------------------
-- Initial schema for the tenant + entitlement control plane. Matches the
-- interface in api/tenants/_store_postgres.mjs. Apply with:
--
--   psql "$DATABASE_URL" -f scripts/migrations/001_initial.sql
--
-- Runs once. Idempotent (uses IF NOT EXISTS throughout).
-- -----------------------------------------------------------------------------

create table if not exists tenants (
  tenant_id            text primary key,
  business_name        text not null,
  business_type        text not null default 'general',
  plan                 text not null default 'core',
  subscription_status  text not null default 'active',
  onboarding_status    text not null default 'in_progress',
  timezone             text not null default 'America/New_York',
  locale               text not null default 'en-US',
  profile              jsonb not null default '{}'::jsonb,
  capabilities_enabled jsonb not null default '[]'::jsonb,
  modules_active       jsonb not null default '[]'::jsonb,
  blueprint_installed  text,
  compliance_mode      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists tenants_blueprint_idx on tenants (blueprint_installed);
create index if not exists tenants_plan_idx on tenants (plan);

create table if not exists entitlements (
  entitlement_id   text primary key,
  tenant_id        text not null references tenants(tenant_id) on delete cascade,
  module_code      text not null,
  state            text not null default 'entitled',
  billing_source   jsonb not null default '{"source_type":"module"}'::jsonb,
  activated_at     timestamptz,
  deactivated_at   timestamptz,
  config_state     jsonb,
  prereq_check     jsonb,
  unique (tenant_id, module_code)
);

create index if not exists entitlements_tenant_idx on entitlements (tenant_id);
create index if not exists entitlements_state_idx on entitlements (state);
create index if not exists entitlements_module_idx on entitlements (module_code);

create table if not exists events_log (
  event_id     text primary key,
  event_type   text not null,
  tenant_id    text,
  module_code  text,
  payload      jsonb,
  emitted_at   timestamptz not null default now()
);

create index if not exists events_tenant_idx on events_log (tenant_id);
create index if not exists events_type_idx on events_log (event_type);
create index if not exists events_emitted_idx on events_log (emitted_at desc);

-- -----------------------------------------------------------------------------
-- Future migrations: add a schema_version table and record applied migrations.
-- -----------------------------------------------------------------------------
create table if not exists schema_migrations (
  version     int primary key,
  applied_at  timestamptz not null default now(),
  description text
);

insert into schema_migrations (version, description)
values (1, 'initial: tenants, entitlements, events_log')
on conflict (version) do nothing;
