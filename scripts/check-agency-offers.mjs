import fs from 'node:fs';
import path from 'node:path';
import {
  buildAgencyProvisionedPackage,
  buildAgencyProvisioningSchema,
  listAgencyOffers,
  offerExampleUrl,
  offerUrl,
} from '../api/agency-offers/_catalog.mjs';

const root = process.cwd();
const offers = listAgencyOffers();
const failures = [];
const forbidden = /\b(TODO|lorem ipsum|coming soon|placeholder)\b/i;

function fail(message) {
  failures.push(message);
}

function exists(relative) {
  return fs.existsSync(path.join(root, relative));
}

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

if (offers.length < 25) fail(`expected at least 25 agency offers, found ${offers.length}`);

const ids = new Set();
for (const item of offers) {
  if (!item.id || ids.has(item.id)) fail(`duplicate or missing id: ${item.id}`);
  ids.add(item.id);
  for (const field of [
    'name',
    'category',
    'buyer',
    'outcome',
    'promise',
    'description',
    'timeline',
    'best_for',
    'not_for',
  ]) {
    if (!item[field]) fail(`${item.id} missing ${field}`);
  }
  for (const field of ['deliverables', 'required_inputs', 'agent_workflow', 'approval_gates', 'provisioned_assets', 'sample_metrics']) {
    if (!Array.isArray(item[field]) || item[field].length < 3) fail(`${item.id} needs at least 3 ${field}`);
  }
  if (!item.required_inputs.includes('business_name')) fail(`${item.id} missing business_name intake`);
  if (!item.required_inputs.includes('owner_email')) fail(`${item.id} missing owner_email intake`);

  const offerPath = `${offerUrl(item.id).replace(/^\//, '')}.html`;
  const publicOfferPath = path.join('public', offerPath);
  const examplePath = `${offerExampleUrl(item.id).replace(/^\//, '')}.html`;
  const publicExamplePath = path.join('public', examplePath);
  for (const relative of [offerPath, publicOfferPath, examplePath, publicExamplePath]) {
    if (!exists(relative)) {
      fail(`${item.id} missing generated page ${relative}`);
      continue;
    }
    const html = read(relative);
    if (!html.includes('/site-shell.css')) fail(`${relative} missing site shell css`);
    if (!html.includes('/site-shell.js')) fail(`${relative} missing site shell js`);
    if (forbidden.test(html)) fail(`${relative} contains placeholder language`);
  }

  const schema = buildAgencyProvisioningSchema(item.id);
  if (!schema?.ok) fail(`${item.id} schema failed`);
  const schemaKeys = new Set(schema?.required_fields?.map((field) => field.key) || []);
  for (const required of ['business_name', 'owner_email']) {
    if (!schemaKeys.has(required)) fail(`${item.id} schema missing ${required}`);
  }

  const pack = buildAgencyProvisionedPackage(
    item.id,
    {
      business_name: 'Smoke Test Co',
      owner_email: 'ops@example.com',
    },
    'https://www.yourdeputy.com',
  );
  if (!pack.ok) fail(`${item.id} package failed`);
  for (const file of [
    'START-HERE.md',
    'DELIVERY-MANIFEST.json',
    'CUSTOMER-INTAKE-SCHEMA.json',
    'AGENT-WORKFLOW.json',
    'LAUNCH-CHECKLIST.md',
    'SAMPLE-DASHBOARD.json',
    'ACCEPTANCE-TESTS.md',
    'DELIVERY-RECEIPT.md',
  ]) {
    if (!pack.files?.[file]) fail(`${item.id} package missing ${file}`);
    if (forbidden.test(pack.files?.[file] || '')) fail(`${item.id} package ${file} contains placeholder language`);
  }
}

for (const relative of ['agency-offers.html', 'public/agency-offers.html']) {
  if (!exists(relative)) fail(`missing ${relative}`);
  else {
    const html = read(relative);
    if (!html.includes(`${offers.length}</strong>`)) fail(`${relative} does not show offer count`);
    if (forbidden.test(html)) fail(`${relative} contains placeholder language`);
  }
}

if (failures.length) {
  console.error('check-agency-offers: failed');
  for (const failure of failures.slice(0, 120)) console.error(`- ${failure}`);
  if (failures.length > 120) console.error(`...and ${failures.length - 120} more`);
  process.exit(1);
}

console.log(`check-agency-offers: ok (${offers.length} offers)`);
