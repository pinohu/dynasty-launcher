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
    'app/sign-up/[[...sign-up]]/page.tsx': 'export default function Page(){ return <div>demo@example.com demo123</div> }',
    'frontend/app/dashboard/ventures/page.tsx': 'console.log("ventures"); export default function Page(){ return <div>Ventures and Agents</div> }',
    'frontend/lib/utils.ts.tmp': '',
    'backend/main.py': 'SECRET_KEY = "change-me"\napp.add_middleware(CORSMiddleware, allow_origins=["*"])\nBase.metadata.create_all(bind=engine)\n@app.get("/models")\ndef models(): pass\n',
    'migrations/versions/initial_migration.py': 'def upgrade(): op.create_table("ventures")',
    'next.config.js': 'module.exports = { typescript: { ignoreBuildErrors: true }, eslint: { ignoreDuringBuilds: true } }',
    'package.json': JSON.stringify({ dependencies: { next: '14.1.0', react: '^18.2.0' }, devDependencies: { vitest: '^3.0.0' } }),
    'package-lock.json': JSON.stringify({ lockfileVersion: 3, packages: { '': { dependencies: { next: '14.2.28', react: '^18.2.0' } } } }),
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
for (const code of ['duplicate_next_trees', 'next_root_layout_missing', 'package_lock_drift', 'template_residue', 'domain_drift', 'backend_schema_drift', 'api_contract_drift', 'env_contract_drift', 'missing_byoc_infra', 'central_config_missing', 'business_unit_structure_missing', 'full_sdlc_coverage_missing', 'mcp_tools_missing', 'pre_saas_revenue_missing', 'authority_content_engine_missing', 'video_asset_pipeline_missing', 'standards_alignment_missing', 'semantic_promise_coverage_missing']) {
  assert.ok(codes(before).has(code), `fixture should expose ${code}`);
}

const repaired = repairGeneratedRepoIssues(beforeFiles, contract);
assert.ok(repaired.telemetry.length > 0, 'repair should emit telemetry');
const after = verifyGeneratedRepo(repaired.files, contract);
assert.equal(after.ok, true, `repair should verify cleanly: ${JSON.stringify(after.issues, null, 2)}`);
for (const requiredPath of ['config/master.config.yaml', 'agents/tool-registry.json', 'products/product-catalog.yaml', 'revops/contract-templates/msa.md', 'workflows/lead-to-sale.yaml', 'src/providers/payment.ts', 'src/providers/analytics.ts', 'src/providers/video.ts', 'analytics/posthog-events.yaml', 'analytics/posthog-dashboards.yaml', 'analytics/posthog-feature-flags.yaml', 'builder-governance/karpathy-principles.yaml', 'builder-governance/repair-success-criteria.md', 'code-context/claude-context.yaml', 'code-context/semantic-repair-queries.yaml', 'context-optimization/rtk.yaml', 'agent-runtime/hermes-agent.yaml', 'media/voice/vibevoice.yaml', 'media/voice/responsible-ai-voice-policy.md', 'codex-operator/oh-my-codex.yaml', 'codex-operator/clarify-plan-execute-verify.md', 'codex-operator/doctor-checks.yaml', 'ai/open-weight-models.yaml', 'ai/model-routing-policy.yaml', 'content/video/launch-video-script.md', 'content/video/short-form-clips.yaml', 'content/video/video-seo-metadata.yaml', 'media/videos/README.md', 'sdlc/problem-discovery.md', 'sdlc/continuous-improvement-loop.md', 'pre-saas/revenue-reinvestment-loop.yaml', 'security/owasp-asvs-checklist.yaml', 'governance/nist-ai-rmf-risk-register.yaml', 'mcp/mcp-conformance.yaml', 'observability/otel-config.yaml', 'deployment/github-actions-protection.yaml', 'architecture/tenancy-decision.md', 'evals/semantic-niche-rubric.yaml', 'operations/unit-economics.yaml', 'tests/security-standards.test.ts', 'tests/mcp-conformance.test.ts', 'tests/observability.test.ts', 'tests/semantic-equivalence.test.ts', 'tests/revenue-loop.test.ts', 'tests/video-assets.test.ts', 'tests/analytics-provider.test.ts', 'tests/intelligence-capabilities.test.ts', 'tests/open-weight-models.test.ts', 'tests/build-completeness.test.ts']) {
  assert.ok(repaired.files[requiredPath], `repair should generate ${requiredPath}`);
}
const repairedPaths = Object.keys(repaired.files);
assert.equal(repairedPaths.filter((p) => /^content\/articles\/.+\.md$/.test(p)).length, 20, 'authority engine should generate 20 article briefs');
assert.equal(repairedPaths.filter((p) => /^content\/landing-pages\/.+\.md$/.test(p)).length, 5, 'funnel should generate 5 landing pages');
assert.equal(repairedPaths.filter((p) => /^content\/email-sequences\/.+\.md$/.test(p)).length, 10, 'nurture system should generate 10 emails');
assert.equal(repairedPaths.filter((p) => /^content\/social-posts\/.+\.md$/.test(p)).length, 20, 'distribution engine should generate 20 social posts');
assert.equal(repairedPaths.filter((p) => /^content\/video\/.+/.test(p)).length >= 10, true, 'video asset pipeline should generate source scripts, storyboards, captions, thumbnails, and metadata');
const semanticCorpus = Object.entries(repaired.files)
  .filter(([file]) => /^(sdlc|pre-saas|gtm|customer-success|operations|experiments|memory|ux|security|governance|mcp|observability|deployment|architecture|evals|analytics|content\/video|builder-governance|code-context|context-optimization|agent-runtime|media\/voice|codex-operator|ai)\//.test(file))
  .map(([, body]) => body)
  .join('\n')
  .toLowerCase();
for (const marker of ['tam', 'sam', 'som', 'prd', 'brd', 'rice', 'kano', 'uat', 'cac', 'ltv', 'a/b testing', 'revenue reinvestment', 'winner detection', 'saas transition', 'posthog', 'session replay', 'feature flags', 'experiments', 'surveys', 'karpathy', 'wrong assumptions', 'surgical changes', 'goal-driven execution', 'claude-context', 'semantic code search', 'incremental indexing', 'ast-aware chunking', 'hermes agent', 'persistent memory', 'skill creation', 'resume from failure', 'vibevoice', 'voiceover', 'transcription', 'deepfake prevention', 'rtk', 'token compression', 'context efficiency', 'oh-my-codex', 'omx', 'clarify', 'plan', 'execute', 'verify', 'doctor', 'hud', 'team status', '.omx', 'open-weight', 'gpt-oss', 'gemma 3', 'gemma 3n', 'qwen3', 'qwen3-coder', 'devstral', 'magistral', 'phi-4', 'deepseek r1', 'owasp asvs', 'owasp samm', 'nist ai rmf', 'model context protocol', 'opentelemetry', 'github actions', 'tenant isolation', 'video asset pipeline', 'launch video', 'video-use', 'ffmpeg', 'scaffold fallback']) {
  assert.ok(semanticCorpus.includes(marker), `semantic promise corpus should include ${marker}`);
}
const toolRegistry = JSON.parse(repaired.files['agents/tool-registry.json']);
assert.ok(toolRegistry.tools.some((tool) => tool.name === 'create_payment_link'), 'MCP registry should expose payment tools');
assert.ok(repaired.files['src/providers/payment.ts'].includes('interface PaymentProvider'), 'payment abstraction should be generated');
assert.ok(repaired.files['src/providers/analytics.ts'].includes('interface AnalyticsProvider'), 'analytics abstraction should be generated');
assert.ok(repaired.files['src/providers/analytics.ts'].includes('PostHogAnalyticsProvider'), 'PostHog optional analytics adapter should be generated');
assert.ok(repaired.files['config/master.config.yaml'].includes('optional_external: posthog'), 'master config should expose PostHog as optional analytics adapter');
assert.ok(repaired.files['analytics/posthog-events.yaml'].includes('session replay') || repaired.files['analytics/posthog-feature-flags.yaml'].includes('session_replay'), 'PostHog config should cover session replay');
assert.ok(repaired.files['analytics/posthog-feature-flags.yaml'].includes('feature flags') || repaired.files['analytics/posthog-feature-flags.yaml'].includes('flags:'), 'PostHog config should cover feature flags');
assert.ok(!/from ['"]posthog-js['"]|require\(['"]posthog-js['"]|from ['"]posthog-node['"]|require\(['"]posthog-node['"]/.test(repaired.files['src/analytics/metrics.ts']), 'core analytics must not import PostHog directly');
assert.ok(repaired.files['builder-governance/karpathy-principles.yaml'].includes('surgical_changes'), 'Karpathy-style builder governance should be generated');
assert.ok(repaired.files['code-context/claude-context.yaml'].includes('semantic_code_search'), 'Claude Context optional code intelligence should be generated');
assert.ok(repaired.files['agent-runtime/hermes-agent.yaml'].includes('cross_session_recall'), 'Hermes optional agent runtime should be generated');
assert.ok(repaired.files['media/voice/vibevoice.yaml'].includes('deepfake_prevention'), 'VibeVoice optional voice safeguards should be generated');
assert.ok(repaired.files['context-optimization/rtk.yaml'].includes('token compression'), 'RTK optional context optimization should be generated');
assert.ok(repaired.files['codex-operator/oh-my-codex.yaml'].includes('canonical_flow'), 'oh-my-codex operator workflow should be generated');
assert.ok(repaired.files['codex-operator/clarify-plan-execute-verify.md'].includes('Resume rule'), 'operator loop should enforce resume instead of restart');
assert.ok(repaired.files['ai/open-weight-models.yaml'].includes('gpt-oss-120b'), 'open-weight catalog should include GPT-OSS');
assert.ok(repaired.files['ai/open-weight-models.yaml'].includes('qwen3-coder-480b-a35b'), 'open-weight catalog should include Qwen3-Coder');
assert.ok(repaired.files['ai/model-routing-policy.yaml'].includes('open_weight_first_when_possible'), 'open-weight routing policy should be generated');
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

const orphanModuleDiag = classifyVercelFailure([{ text: "Module not found: Can't resolve '@/components/ui/button'\n./app/sign-in/page.tsx" }]);
assert.equal(orphanModuleDiag.class, 'module_not_found', 'Vercel parser should classify unresolved local module failures');
const orphanModuleRepair = repairDeploymentFailure({
  'package.json': '{"dependencies":{}}',
  'src/app/layout.tsx': 'export default function RootLayout({children}){return <html><body>{children}</body></html>}',
  'app/sign-in/page.tsx': "import { Button } from '@/components/ui/button'; export default function Page(){return <Button/>}",
}, orphanModuleDiag);
assert.equal(orphanModuleRepair.files['app/sign-in/page.tsx'], undefined, 'module repair should delete orphan root app files when src/app is canonical');
assert.ok(orphanModuleRepair.files['src/app/page.tsx'], 'module repair should ensure a safe deployable homepage');

const syntaxDiag = classifyVercelFailure([{ text: 'SyntaxError: Unexpected token\n./src/app/page.tsx' }]);
assert.equal(syntaxDiag.class, 'syntax_error', 'Vercel parser should classify syntax failures');
const syntaxRepair = repairDeploymentFailure({ 'package.json': '{"dependencies":{}}', 'src/app/page.tsx': 'export default function Page(){ return <main>' }, syntaxDiag);
assert.ok(syntaxRepair.files['src/app/layout.tsx'], 'syntax repair should add a safe root layout');
assert.ok(syntaxRepair.actions.some((a) => a.action === 'replace_broken_page_with_safe_route'), 'syntax repair should replace broken page routes when identifiable');

const qualityDiag = classifyVercelFailure([{ text: 'Quality gate flagged placeholders or invalid patterns: SaaS Template demo@example.com change-me' }]);
assert.equal(qualityDiag.class, 'quality', 'Vercel parser should classify quality gate failures');
const qualityRepair = repairDeploymentFailure({ 'package.json': '{"name":"revos-orchestrator","dependencies":{}}', 'src/app/page.tsx': 'export default function Page(){return <div>SaaS Template demo@example.com change-me</div>}' }, qualityDiag);
assert.ok(!qualityRepair.files['src/app/page.tsx'].includes('SaaS Template'), 'quality repair should scrub template branding');
assert.ok(qualityRepair.files['src/app/pricing/page.tsx'], 'quality repair should ensure route coverage');

const routeDiag = classifyVercelFailure([{ text: 'Required routes failed content checks: /docs /pricing missing route content check' }]);
assert.equal(routeDiag.class, 'route_or_live_content', 'Vercel parser should classify route coverage failures');
const routeRepair = repairDeploymentFailure({ 'package.json': '{"name":"route-test","dependencies":{}}' }, routeDiag);
assert.ok(routeRepair.files['src/app/docs/page.tsx'], 'route repair should generate docs route');
assert.ok(routeRepair.files['src/app/pricing/page.tsx'], 'route repair should generate pricing route');

const vercelDiag = classifyVercelFailure([{ text: 'Error: No Next.js version detected. Make sure your package.json has "next" in either "dependencies" or "devDependencies". Also check your Root Directory setting matches the directory of your package.json file.' }]);
assert.equal(vercelDiag.class, 'vercel_root_mismatch', 'Vercel parser should classify root/frontend mismatch');
const vercelRepair = repairDeploymentFailure({ 'package.json': '{"scripts":{},"engines":{"node":"20.x"}}' }, vercelDiag);
assert.equal(JSON.parse(vercelRepair.files['package.json']).scripts['vercel-build'], 'npm --prefix frontend run build', 'Vercel repair should write root vercel-build');
assert.equal(JSON.parse(vercelRepair.files['package.json']).devDependencies.next, '^15.2.4', 'Vercel repair should expose root Next version');
assert.equal(JSON.parse(vercelRepair.files['vercel.json']).outputDirectory, 'frontend/.next', 'Vercel repair should target frontend output');

const protectionDiag = classifyVercelFailure([{ text: '401 Unauthorized\nAuthentication Required\nVercel Deployment Protection' }]);
assert.equal(protectionDiag.class, 'deployment_protection', 'Vercel parser should classify deployment protection blocks');

const rootLayoutDiag = classifyVercelFailure([{ text: "sign-up/[[...sign-up]]/page.tsx doesn't have a root layout. To fix this error, make sure every page has a root layout." }]);
assert.equal(rootLayoutDiag.class, 'next_root_layout_missing', 'Vercel parser should classify root app layout failures');
const rootLayoutRepair = repairDeploymentFailure({
  'src/app/layout.tsx': 'export default function RootLayout({children}){return <html><body>{children}</body></html>}',
  'app/sign-up/[[...sign-up]]/page.tsx': 'export default function Page(){return null}',
}, rootLayoutDiag);
assert.equal(rootLayoutRepair.files['app/sign-up/[[...sign-up]]/page.tsx'], undefined, 'root layout repair should delete noncanonical app/ pages when src/app exists');

const lockDiag = classifyVercelFailure([{ text: 'npm ci can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync. Missing: next@14.1.0 from lock file' }]);
assert.equal(lockDiag.class, 'package_lock_drift', 'Vercel parser should classify npm lock drift failures');
const lockRepair = repairDeploymentFailure({ 'package-lock.json': '{}', 'package.json': '{}' }, lockDiag);
assert.equal(lockRepair.files['package-lock.json'], undefined, 'lock repair should delete stale lockfiles');

if (fs.existsSync(localFixture)) {
  const localResult = detectGeneratedRepoIssues(loadFilesFromDir(localFixture), contract);
  if (!localResult.ok) {
    const localRepair = repairGeneratedRepoIssues(loadFilesFromDir(localFixture), contract);
    assert.equal(verifyGeneratedRepo(localRepair.files, contract).ok, true, 'local AI Collision fixture should be repairable');
  }
}

console.log('generated-repo-regression: ok');
