import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildInstantPackage, listInstantOffers } from '../api/deliverables/_instant.mjs';
import { buildProvisionedDeliverable, buildProvisioningSchema } from '../api/deliverables/_provisioner.mjs';

const root = process.cwd();
const outDir = path.join(root, 'public', 'live-deliverables');
const offers = listInstantOffers();

assert.ok(offers.length >= 50, `expected at least 50 live deliverable offers, got ${offers.length}`);
assert.ok(fs.existsSync(path.join(outDir, 'index.html')), 'live deliverables index must exist');

const requiredTypes = new Set([
  'launch_offer',
  'setup',
  'core',
  'module',
  'pack',
  'suite',
  'edition',
  'blueprint',
]);
const actualTypes = new Set(offers.map((offer) => offer.type));
for (const type of requiredTypes) {
  assert.ok(actualTypes.has(type), `missing live deliverable type: ${type}`);
}

for (const offer of offers) {
  const file = path.join(outDir, `${offer.id}.html`);
  assert.ok(fs.existsSync(file), `missing generated live deliverable page: ${offer.id}`);
  const html = fs.readFileSync(file, 'utf8');
  assert.ok(html.includes('Full live deliverable - not a demo'), `${offer.id} must be marked as live deliverable`);
  assert.ok(html.includes('/api/deliverables/instant'), `${offer.id} must link to instant package API`);
  assert.ok(html.includes('/api/deliverables/provision'), `${offer.id} must link to provisioning API`);
  assert.ok(html.includes('/sign-up?offer='), `${offer.id} must link to the credential form`);
  assert.ok(html.includes('Manual package creation'), `${offer.id} must state manual package creation boundary`);

  const pkg = buildInstantPackage(offer.id, { business_name: 'Regression Test Business' });
  assert.equal(pkg.ok, true, `${offer.id} instant package must return ok`);
  assert.equal(pkg.instant_delivery, true, `${offer.id} must be instant`);
  assert.equal(
    pkg.no_manual_step_required_for_package_creation,
    true,
    `${offer.id} must not require manual package creation`,
  );
  assert.ok(Array.isArray(pkg.files) && pkg.files.length >= 6, `${offer.id} must include package files`);
  for (const name of [
    'START-HERE.md',
    'DELIVERY-MANIFEST.json',
    'OUTCOME-BRIEF.md',
    'WORKFLOW.json',
    'ACCEPTANCE-TESTS.md',
    'DELIVERY-RECEIPT.md',
  ]) {
    assert.ok(pkg.files.some((file) => file.name === name), `${offer.id} missing ${name}`);
  }

  const schema = buildProvisioningSchema(offer.id);
  assert.equal(schema.ok, true, `${offer.id} provisioning schema must return ok`);
  assert.ok(schema.credential_fields.some((field) => field.key === 'business_name'), `${offer.id} must ask for business name`);
  const sample = Object.fromEntries(schema.credential_fields.map((field) => {
    if (field.type === 'checkbox') return [field.key, true];
    if (field.secret) return [field.key, 'test-secret-value'];
    if (field.type === 'email') return [field.key, 'owner@example.com'];
    if (field.type === 'url') return [field.key, 'https://example.com'];
    if (field.type === 'tel') return [field.key, '+15551234567'];
    return [field.key, field.key === 'launch_slug' ? `test-${offer.id}` : `test ${field.key}`];
  }));
  const provisioned = await buildProvisionedDeliverable(offer.id, sample, 'https://www.yourdeputy.com', {
    admin: true,
    subject: 'regression@example.com',
    auth_type: 'admin_test',
  });
  assert.equal(provisioned.ok, true, `${offer.id} must provision successfully with required credentials`);
  assert.equal(provisioned.status_text, 'created_and_launched', `${offer.id} must create and launch`);
  assert.ok(provisioned.launched_url.includes('/launched-deliverable.html?launch_id='), `${offer.id} must return durable launched URL`);
  for (const name of ['app/index.html', 'app/api/leads.js', 'app/api/events.js', 'app/automation-rules.json', 'app/crm-seed.json']) {
    assert.ok(provisioned.files.some((file) => file.name === name), `${offer.id} missing runtime file ${name}`);
  }
  const serialized = JSON.stringify(provisioned);
  assert.ok(!serialized.includes('test-secret-value'), `${offer.id} must not leak secret credential values`);
}

console.log(`check-live-deliverables: ok (${offers.length} offers)`);
