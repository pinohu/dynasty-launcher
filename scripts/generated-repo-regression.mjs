import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildRepairTelemetry,
  detectGeneratedRepoIssues,
  repairGeneratedRepoIssues,
  verifyGeneratedRepo,
} from '../api/_generated_repo_repair.mjs';
import { classifyVercelFailure, repairDeploymentFailure } from '../api/_deployment_repair.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const localFixture = process.env.AI_COLLISION_FIXTURE
  || 'C:\\Users\\VRLab\\Downloads\\ai-collision-deploy-main\\ai-collision-deploy-main';

const contract = {
  product: 'RevOS',
  blueprint: {
    entities: ['tenants', 'vpc_deployments', 'integration_configs', 'revenue_goals', 'orchestration_workflows', 'performance_snapshots', 'xai_actions', 'audit_logs'],
    endpoints: ['/api/v1/revenue/baseline'],
    infrastructure: ['BYOC', 'Terraform', 'Kubernetes'],
  },
};

function loadFilesFromDir(dir) {
  const files = {};
  const skip = new Set(['.git', 'node_modules', '.next', '.vercel', 'coverage']);
  function walk(base) {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const abs = path.join(base, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else {
        const rel = path.relative(dir, abs).split(path.sep).join('/');
        const size = fs.statSync(abs).size;
        if (size < 1_000_000) files[rel] = fs.readFileSync(abs, 'utf8');
      }
    }
  }
  walk(dir);
  return files;
}

function syntheticBrokenFixture() {
  return {
    'SPEC.md': 'RevOS BYOC product with tenants, vpc_deployments, revenue_goals, xai_actions and audit_logs.',
    'src/app/page.tsx': 'export default function Page(){ return <div>RevOS</div> }',
    'app/sign-in/[[...sign-in]]/page.tsx': 'export default function Page(){ return <div>demo@example.com demo123</div> }',
    'frontend/app/dashboard/ventures/page.tsx': 'console.log("ventures"); export default function Page(){ return <div>Ventures and Agents</div> }',
    'frontend/lib/utils.ts.tmp': '',
    'backend/main.py': 'SECRET_KEY = "change-me"\napp.add_middleware(CORSMiddleware, allow_origins=["*"])\nBase.metadata.create_all(bind=engine)\n@app.get("/models")\ndef models(): pass\n',
    'migrations/versions/initial_migration.py': 'def upgrade(): op.create_table("ventures")',
    'next.config.js': 'module.exports = { typescript: { ignoreBuildErrors: true }, eslint: { ignoreDuringBuilds: true } }',
    '.env.example': 'CLERK_SECRET_KEY=\n',
  };
}

function getFixture() {
  if (fs.existsSync(localFixture)) return loadFilesFromDir(localFixture);
  return syntheticBrokenFixture();
}

function codes(result) {
  return new Set(result.issues.map((issue) => issue.code));
}

const beforeFiles = syntheticBrokenFixture();
const before = detectGeneratedRepoIssues(beforeFiles, contract);
assert.equal(before.ok, false, 'AI Collision fixture must be detected as broken');
for (const code of ['duplicate_next_trees', 'template_residue', 'domain_drift', 'backend_schema_drift', 'api_contract_drift', 'env_contract_drift', 'missing_byoc_infra']) {
  assert.ok(codes(before).has(code), `fixture should expose ${code}`);
}

const repaired = repairGeneratedRepoIssues(beforeFiles, contract);
assert.ok(repaired.telemetry.length > 0, 'repair should emit telemetry');
const after = verifyGeneratedRepo(repaired.files, contract);
assert.equal(after.ok, true, `repair should verify cleanly: ${JSON.stringify(after.issues, null, 2)}`);
const telemetry = buildRepairTelemetry(before, after, repaired.telemetry);
assert.equal(telemetry.verification_ok, true, 'repair telemetry should record success');

const tsDiag = classifyVercelFailure([{ text: './frontend/app/page.tsx\nType error: Type string is not assignable to number' }]);
assert.equal(tsDiag.class, 'ts_error', 'Vercel parser should classify TypeScript failures');

const envDiag = classifyVercelFailure([{ text: 'Error: process.env.SFDC_CLIENT_ID is required' }]);
assert.equal(envDiag.class, 'env_var_missing', 'Vercel parser should classify missing env failures');
const envRepair = repairDeploymentFailure({ '.env.example': 'DATABASE_URL=\n' }, envDiag);
assert.ok(envRepair.files['.env.example'].includes('SFDC_CLIENT_ID='), 'env repair should append missing env var');

const depDiag = classifyVercelFailure([{ text: "Module not found: Can't resolve 'zod'\n./frontend/app/page.tsx" }]);
assert.equal(depDiag.class, 'missing_dependency', 'Vercel parser should classify missing dependency failures');
const depRepair = repairDeploymentFailure({ 'frontend/package.json': '{"dependencies":{}}' }, depDiag);
assert.ok(JSON.parse(depRepair.files['frontend/package.json']).dependencies.zod, 'dependency repair should add missing package');

if (fs.existsSync(localFixture)) {
  const localResult = detectGeneratedRepoIssues(loadFilesFromDir(localFixture), contract);
  if (!localResult.ok) {
    const localRepair = repairGeneratedRepoIssues(loadFilesFromDir(localFixture), contract);
    assert.equal(verifyGeneratedRepo(localRepair.files, contract).ok, true, 'local AI Collision fixture should be repairable');
  }
}

console.log('generated-repo-regression: ok');
