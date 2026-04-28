// scripts/check-automation-schema-guards.mjs
// -----------------------------------------------------------------------------
// Guards against regressions where local tests pass on a fresh automation_runs
// table but production fails on an older table shape.
// -----------------------------------------------------------------------------

import fs from 'node:fs';

const automationRunFiles = [
  'api/automations/handler.js',
  'api/automations/webhook.js',
  'api/tenants/provision-automations.js',
];

const automationConfigFiles = [
  'api/automations/handler.js',
  'api/tenants/provision-automations.js',
  'api/tenants/_provision.mjs',
  'api/tenants/upgrade-module.js',
];

const requiredAutomationRunSql = [
  'alter table automation_runs add column if not exists trigger_type text',
  'alter table automation_runs add column if not exists result jsonb',
  'alter table automation_runs add column if not exists webhook_source text',
  'alter table automation_runs add column if not exists webhook_id text',
  'alter table automation_runs alter column tenant_id drop not null',
  'alter table automation_runs alter column module_code drop not null',
  'alter table automation_runs alter column trigger_type drop not null',
];

const requiredAutomationConfigSql = [
  'alter table automations_config add column if not exists state text',
  'alter table automations_config add column if not exists is_enabled boolean',
  "set state = case when coalesce(is_enabled, false) then 'enabled' else 'disabled' end",
  "update automations_config set is_enabled = (state = 'enabled') where is_enabled is null",
  "alter table automations_config alter column state set default 'disabled'",
  'alter table automations_config alter column is_enabled set default false',
  'alter table automations_config alter column state set not null',
  'alter table automations_config alter column is_enabled set not null',
];

let failures = 0;

function log(ok, name, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures += 1;
}

console.log('Check: automation schema compatibility guards');
console.log('-'.repeat(60));

for (const file of automationRunFiles) {
  const text = fs.readFileSync(file, 'utf8').toLowerCase();
  for (const sql of requiredAutomationRunSql) {
    log(text.includes(sql), `${file} includes ${sql}`);
  }
}

for (const file of automationConfigFiles) {
  const text = fs.readFileSync(file, 'utf8').toLowerCase();
  for (const sql of requiredAutomationConfigSql) {
    log(text.includes(sql), `${file} includes ${sql}`);
  }
}

{
  const webhook = fs.readFileSync('api/automations/webhook.js', 'utf8');
  const formHandlerStart = webhook.indexOf('async function handleFormWebhook');
  const formHandlerEnd = webhook.indexOf(
    '// =============================================================================\n// ROUTER',
    formHandlerStart,
  );
  const formHandler = webhook.slice(formHandlerStart, formHandlerEnd);
  log(
    formHandler.includes('return res.status(200).end();'),
    'Formaloo form webhook returns an empty 200 response on success',
  );
}

console.log('-'.repeat(60));
if (failures === 0) {
  console.log('OK - automation schema guards are present.');
} else {
  console.log(`FAIL - ${failures} automation schema guard check(s) failed.`);
  process.exitCode = 1;
}
