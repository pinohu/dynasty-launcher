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
for (const code of ['duplicate_next_trees', 'template_residue', 'domain_drift', 'backend_schema_drift', 'api_contract_drift', 'env_contract_drift', 'missing_byoc_infra', 'central_config_missing', 'business_unit_structure_missing', 'full_sdlc_coverage_missing', 'mcp_tools_missing', 'pre_saas_revenue_missing', 'authority_content_engine_missing', 'video_asset_pipeline_missing', 'standards_alignment_missing', 'semantic_promise_coverage_missing']) {
  assert.ok(codes(before).has(code), `fixture should expose ${code}`);
}

const repaired = repairGeneratedRepoIssues(beforeFiles, contract);
assert.ok(repaired.telemetry.length > 0, 'repair should emit telemetry');
const after = verifyGeneratedRepo(repaired.files, contract);
assert.equal(after.ok, true, `repair should verify cleanly: ${JSON.stringify(after.issues, null, 2)}`);
for (const requiredPath of ['config/master.config.yaml', 'agents/tool-registry.json', 'products/product-catalog.yaml', 'revops/contract-templates/msa.md', 'workflows/lead-to-sale.yaml', 'src/providers/payment.ts', 'src/providers/video.ts', 'content/video/launch-video-script.md', 'content/video/short-form-clips.yaml', 'content/video/video-seo-metadata.yaml', 'media/videos/README.md', 'sdlc/problem-discovery.md', 'sdlc/continuous-improvement-loop.md', 'pre-saas/revenue-reinvestment-loop.yaml', 'security/owasp-asvs-checklist.yaml', 'governance/nist-ai-rmf-risk-register.yaml', 'mcp/mcp-conformance.yaml', 'observability/otel-config.yaml', 'deployment/github-actions-protection.yaml', 'architecture/tenancy-decision.md', 'evals/semantic-niche-rubric.yaml', 'operations/unit-economics.yaml', 'tests/security-standards.test.ts', 'tests/mcp-conformance.test.ts', 'tests/observability.test.ts', 'tests/semantic-equivalence.test.ts', 'tests/revenue-loop.test.ts', 'tests/video-assets.test.ts', 'tests/build-completeness.test.ts']) {
  assert.ok(repaired.files[requiredPath], `repair should generate ${requiredPath}`);
}
const repairedPaths = Object.keys(repaired.files);
assert.equal(repairedPaths.filter((p) => /^content\/articles\/.+\.md$/.test(p)).length, 20, 'authority engine should generate 20 article briefs');
assert.equal(repairedPaths.filter((p) => /^content\/landing-pages\/.+\.md$/.test(p)).length, 5, 'funnel should generate 5 landing pages');
assert.equal(repairedPaths.filter((p) => /^content\/email-sequences\/.+\.md$/.test(p)).length, 10, 'nurture system should generate 10 emails');
assert.equal(repairedPaths.filter((p) => /^content\/social-posts\/.+\.md$/.test(p)).length, 20, 'distribution engine should generate 20 social posts');
assert.equal(repairedPaths.filter((p) => /^content\/video\/.+/.test(p)).length >= 10, true, 'video asset pipeline should generate source scripts, storyboards, captions, thumbnails, and metadata');
const semanticCorpus = Object.entries(repaired.files)
  .filter(([file]) => /^(sdlc|pre-saas|gtm|customer-success|operations|experiments|memory|ux|security|governance|mcp|observability|deployment|architecture|evals|content\/video)\//.test(file))
  .map(([, body]) => body)
  .join('\n')
  .toLowerCase();
for (const marker of ['tam', 'sam', 'som', 'prd', 'brd', 'rice', 'kano', 'uat', 'cac', 'ltv', 'a/b testing', 'revenue reinvestment', 'winner detection', 'saas transition', 'owasp asvs', 'owasp samm', 'nist ai rmf', 'model context protocol', 'opentelemetry', 'github actions', 'tenant isolation', 'video asset pipeline', 'launch video', 'video-use', 'ffmpeg', 'scaffold fallback']) {
  assert.ok(semanticCorpus.includes(marker), `semantic promise corpus should include ${marker}`);
}
const toolRegistry = JSON.parse(repaired.files['agents/tool-registry.json']);
assert.ok(toolRegistry.tools.some((tool) => tool.name === 'create_payment_link'), 'MCP registry should expose payment tools');
assert.ok(repaired.files['src/providers/payment.ts'].includes('interface PaymentProvider'), 'payment abstraction should be generated');
assert.ok(repaired.files['src/providers/video.ts'].includes('interface VideoProvider'), 'video abstraction should be generated');
assert.ok(repaired.files['content/video/short-form-clips.yaml'].includes('fallback_status: scaffold_ready'), 'video pipeline should define verified scaffold fallback');
assert.ok(!/from ['"]stripe['"]|require\(['"]stripe['"]/.test(repaired.files['src/billing/payments.ts']), 'core billing must not import Stripe directly');
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

const vercelDiag = classifyVercelFailure([{ text: 'Error: No Next.js version detected. Make sure your package.json has "next" in either "dependencies" or "devDependencies". Also check your Root Directory setting matches the directory of your package.json file.' }]);
assert.equal(vercelDiag.class, 'vercel_root_mismatch', 'Vercel parser should classify root/frontend mismatch');
const vercelRepair = repairDeploymentFailure({ 'package.json': '{"scripts":{},"engines":{"node":"20.x"}}' }, vercelDiag);
assert.equal(JSON.parse(vercelRepair.files['package.json']).scripts['vercel-build'], 'npm --prefix frontend run build', 'Vercel repair should write root vercel-build');
assert.equal(JSON.parse(vercelRepair.files['package.json']).devDependencies.next, '^15.2.4', 'Vercel repair should expose root Next version');
assert.equal(JSON.parse(vercelRepair.files['vercel.json']).outputDirectory, 'frontend/.next', 'Vercel repair should target frontend output');

const protectionDiag = classifyVercelFailure([{ text: '401 Unauthorized\nAuthentication Required\nVercel Deployment Protection' }]);
assert.equal(protectionDiag.class, 'deployment_protection', 'Vercel parser should classify deployment protection blocks');

if (fs.existsSync(localFixture)) {
  const localResult = detectGeneratedRepoIssues(loadFilesFromDir(localFixture), contract);
  if (!localResult.ok) {
    const localRepair = repairGeneratedRepoIssues(loadFilesFromDir(localFixture), contract);
    assert.equal(verifyGeneratedRepo(localRepair.files, contract).ok, true, 'local AI Collision fixture should be repairable');
  }
}

console.log('generated-repo-regression: ok');
