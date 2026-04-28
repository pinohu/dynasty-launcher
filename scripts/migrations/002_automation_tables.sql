-- Migration 002: Core automation tables for Dynasty Launcher
-- Created: 2026-04-16
-- Supports 347 automations across 45 categories serving 8 verticals

-- 1. CONTACTS - Master contact records
CREATE TABLE IF NOT EXISTS contacts (
  contact_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  email text,
  phone text,
  company text,
  tags jsonb DEFAULT '[]',
  attributes jsonb DEFAULT '{}',
  source text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_tenant_id ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(tenant_id, created_at);

-- 2. LEADS - Sales leads linked to contacts
CREATE TABLE IF NOT EXISTS leads (
  lead_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  contact_id text NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  source text,
  status text DEFAULT 'new',
  score integer DEFAULT 0,
  service_type text,
  assigned_to text,
  page_url text,
  campaign_id text,
  campaign_name text,
  referral_code text,
  attributes jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_contact_id ON leads(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON leads(tenant_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(tenant_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(tenant_id, created_at);

-- 3. APPOINTMENTS - Scheduling
CREATE TABLE IF NOT EXISTS appointments (
  appointment_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  contact_id text NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  lead_id text REFERENCES leads(lead_id) ON DELETE SET NULL,
  service_type text,
  status text DEFAULT 'scheduled',
  scheduled_at timestamptz,
  duration_minutes integer DEFAULT 60,
  location text,
  provider text,
  notes text,
  reminder_sent_at timestamptz,
  confirmation_sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_id ON appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_contact_id ON appointments(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_lead_id ON appointments(tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(tenant_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_provider ON appointments(tenant_id, provider);

-- 4. JOBS - Service jobs/work orders
CREATE TABLE IF NOT EXISTS jobs (
  job_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  contact_id text NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  appointment_id text REFERENCES appointments(appointment_id) ON DELETE SET NULL,
  status text DEFAULT 'pending',
  service_type text,
  description text,
  assigned_to text,
  scheduled_date date,
  completed_at timestamptz,
  total_amount numeric(12,2),
  notes text,
  attributes jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_tenant_id ON jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jobs_contact_id ON jobs(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_jobs_appointment_id ON jobs(tenant_id, appointment_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_to ON jobs(tenant_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_date ON jobs(tenant_id, scheduled_date);

-- 5. ESTIMATES - Quotes/proposals
CREATE TABLE IF NOT EXISTS estimates (
  estimate_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  contact_id text NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  lead_id text REFERENCES leads(lead_id) ON DELETE SET NULL,
  status text DEFAULT 'draft',
  line_items jsonb DEFAULT '[]',
  subtotal numeric(12,2),
  tax numeric(12,2),
  total numeric(12,2),
  valid_until date,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimates_tenant_id ON estimates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_estimates_contact_id ON estimates(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_estimates_lead_id ON estimates(tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_estimates_valid_until ON estimates(tenant_id, valid_until);

-- 6. INVOICES - Billing
CREATE TABLE IF NOT EXISTS invoices (
  invoice_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  contact_id text NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  job_id text REFERENCES jobs(job_id) ON DELETE SET NULL,
  estimate_id text REFERENCES estimates(estimate_id) ON DELETE SET NULL,
  status text DEFAULT 'draft',
  line_items jsonb DEFAULT '[]',
  subtotal numeric(12,2),
  tax numeric(12,2),
  total numeric(12,2),
  amount_paid numeric(12,2) DEFAULT 0,
  due_date date,
  sent_at timestamptz,
  paid_at timestamptz,
  stripe_invoice_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contact_id ON invoices(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_invoices_job_id ON invoices(tenant_id, job_id);
CREATE INDEX IF NOT EXISTS idx_invoices_estimate_id ON invoices(tenant_id, estimate_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(tenant_id, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_invoice_id ON invoices(tenant_id, stripe_invoice_id);

-- 7. PAYMENTS - Payment records
CREATE TABLE IF NOT EXISTS payments (
  payment_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  invoice_id text REFERENCES invoices(invoice_id) ON DELETE CASCADE,
  contact_id text NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  method text,
  status text DEFAULT 'completed',
  stripe_payment_id text,
  processed_at timestamptz DEFAULT now(),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_contact_id ON payments(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_payment_id ON payments(tenant_id, stripe_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_processed_at ON payments(tenant_id, processed_at);

-- 8. MESSAGES - SMS/email log
CREATE TABLE IF NOT EXISTS messages (
  message_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  contact_id text NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  channel text NOT NULL,
  direction text NOT NULL,
  status text DEFAULT 'queued',
  provider text,
  provider_message_id text,
  to_address text,
  from_address text,
  subject text,
  body text,
  template_ref text,
  module_code text,
  metadata jsonb DEFAULT '{}',
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_tenant_id ON messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_contact_id ON messages(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(tenant_id, channel);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_module_code ON messages(tenant_id, module_code);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_provider_message_id ON messages(tenant_id, provider_message_id);

-- 9. REVIEWS - Review management
CREATE TABLE IF NOT EXISTS reviews (
  review_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  contact_id text NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  job_id text REFERENCES jobs(job_id) ON DELETE SET NULL,
  platform text,
  rating integer,
  review_text text,
  reviewer_name text,
  review_url text,
  response_text text,
  response_sent_at timestamptz,
  request_sent_at timestamptz,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_tenant_id ON reviews(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reviews_contact_id ON reviews(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_reviews_job_id ON reviews(tenant_id, job_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_platform ON reviews(tenant_id, platform);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(tenant_id, created_at);

-- 10. TICKETS - Customer support
CREATE TABLE IF NOT EXISTS tickets (
  ticket_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  contact_id text NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  subject text,
  description text,
  status text DEFAULT 'open',
  priority text DEFAULT 'normal',
  category text,
  assigned_to text,
  resolved_at timestamptz,
  closed_at timestamptz,
  attributes jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_tenant_id ON tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tickets_contact_id ON tickets(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(tenant_id, priority);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(tenant_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(tenant_id, created_at);

-- 11. TEMPLATES - Message/email templates
CREATE TABLE IF NOT EXISTS templates (
  template_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  module_code text,
  channel text NOT NULL,
  name text NOT NULL,
  subject text,
  body text NOT NULL,
  variables jsonb DEFAULT '[]',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_templates_tenant_id ON templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_templates_module_code ON templates(tenant_id, module_code);
CREATE INDEX IF NOT EXISTS idx_templates_channel ON templates(tenant_id, channel);
CREATE INDEX IF NOT EXISTS idx_templates_is_active ON templates(tenant_id, is_active);

-- 12. AUTOMATIONS_CONFIG - Per-tenant automation settings
CREATE TABLE IF NOT EXISTS automations_config (
  config_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  module_code text NOT NULL,
  state text NOT NULL DEFAULT 'disabled',
  is_enabled boolean DEFAULT false,
  settings jsonb DEFAULT '{}',
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text DEFAULT 'America/New_York',
  last_triggered_at timestamptz,
  trigger_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, module_code)
);

ALTER TABLE automations_config ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE automations_config ADD COLUMN IF NOT EXISTS is_enabled boolean;
ALTER TABLE automations_config ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE automations_config ADD COLUMN IF NOT EXISTS module_code text;
ALTER TABLE automations_config ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}';
ALTER TABLE automations_config ADD COLUMN IF NOT EXISTS quiet_hours_start time;
ALTER TABLE automations_config ADD COLUMN IF NOT EXISTS quiet_hours_end time;
ALTER TABLE automations_config ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/New_York';
ALTER TABLE automations_config ADD COLUMN IF NOT EXISTS last_triggered_at timestamptz;
ALTER TABLE automations_config ADD COLUMN IF NOT EXISTS trigger_count integer DEFAULT 0;
ALTER TABLE automations_config ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE automations_config ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
UPDATE automations_config
  SET state = CASE WHEN COALESCE(is_enabled, false) THEN 'enabled' ELSE 'disabled' END
  WHERE state IS NULL;
UPDATE automations_config SET is_enabled = (state = 'enabled') WHERE is_enabled IS NULL;
ALTER TABLE automations_config ALTER COLUMN state SET DEFAULT 'disabled';
ALTER TABLE automations_config ALTER COLUMN is_enabled SET DEFAULT false;
ALTER TABLE automations_config ALTER COLUMN state SET NOT NULL;
ALTER TABLE automations_config ALTER COLUMN is_enabled SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_automations_config_tenant_id ON automations_config(tenant_id);
CREATE INDEX IF NOT EXISTS idx_automations_config_module_code ON automations_config(tenant_id, module_code);
CREATE INDEX IF NOT EXISTS idx_automations_config_is_enabled ON automations_config(tenant_id, is_enabled);

-- 13. AUTOMATION_RUNS - Execution log
CREATE TABLE IF NOT EXISTS automation_runs (
  run_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  module_code text NOT NULL,
  trigger_event_id text,
  status text DEFAULT 'running',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  actions_executed integer DEFAULT 0,
  error_message text,
  input_payload jsonb,
  output_payload jsonb
);

ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS trigger_type text;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS result jsonb;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS webhook_source text;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS webhook_id text;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS module_code text;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS trigger_event_id text;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS started_at timestamptz DEFAULT now();
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS duration_ms integer;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS actions_executed integer DEFAULT 0;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS input_payload jsonb;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS output_payload jsonb;
ALTER TABLE automation_runs ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE automation_runs ALTER COLUMN module_code DROP NOT NULL;
ALTER TABLE automation_runs ALTER COLUMN trigger_type DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_automation_runs_tenant_id ON automation_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_module_code ON automation_runs(tenant_id, module_code);
CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON automation_runs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_automation_runs_started_at ON automation_runs(tenant_id, started_at);

-- 14. SMS_OPT_OUTS - Compliance
CREATE TABLE IF NOT EXISTS sms_opt_outs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  phone text NOT NULL,
  opted_out_at timestamptz DEFAULT now(),
  reason text,
  UNIQUE(tenant_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_sms_opt_outs_tenant_id ON sms_opt_outs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_opt_outs_phone ON sms_opt_outs(tenant_id, phone);

-- 15. WAITLIST_ENTRIES - Appointment waitlist
CREATE TABLE IF NOT EXISTS waitlist_entries (
  waitlist_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  contact_id text NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  service_type text,
  preferred_times jsonb DEFAULT '[]',
  status text DEFAULT 'waiting',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_entries_tenant_id ON waitlist_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_contact_id ON waitlist_entries(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_status ON waitlist_entries(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_created_at ON waitlist_entries(tenant_id, created_at);

-- 16. REFERRALS - Referral program tracking
CREATE TABLE IF NOT EXISTS referrals (
  referral_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  referrer_contact_id text NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  referred_contact_id text NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  status text DEFAULT 'pending',
  reward_type text,
  reward_amount numeric(12,2),
  converted_at timestamptz,
  rewarded_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_tenant_id ON referrals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_contact_id ON referrals(tenant_id, referrer_contact_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_contact_id ON referrals(tenant_id, referred_contact_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(tenant_id, status);

-- 17. CAMPAIGNS - Marketing campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  campaign_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name text NOT NULL,
  type text,
  status text DEFAULT 'draft',
  audience_filter jsonb DEFAULT '{}',
  schedule jsonb DEFAULT '{}',
  metrics jsonb DEFAULT '{}',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_id ON campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(tenant_id, created_at);

-- Record migration version
INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('002', 'Core automation tables (contacts, leads, appointments, jobs, estimates, invoices, payments, messages, reviews, tickets, templates, automations_config, automation_runs, sms_opt_outs, waitlist_entries, referrals, campaigns)', now())
ON CONFLICT (version) DO NOTHING;
