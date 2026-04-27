import fs from 'node:fs';

const failures = [];
const htmlFiles = ['app.html', 'public/app.html'];
const vercelConfig = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const vercelFunctionCount = Object.keys(vercelConfig.functions || {}).length;

if (vercelFunctionCount > 50) {
  failures.push(`vercel.json: Vercel accepts at most 50 function config entries, found ${vercelFunctionCount}`);
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes("localStorage.getItem('dynasty_automation_mode') || 'zero_cost'")) {
    failures.push(`${file}: stale localStorage zero-cost default can poison paid builds`);
  }
  if (html.includes("localStorage.setItem('dynasty_automation_mode'")) {
    failures.push(`${file}: automation mode must be session-scoped, not persisted`);
  }
  if (!html.includes("automation_mode_confirmed: (window.DYNASTY_AUTOMATION_MODE || 'full') === 'zero_cost'")) {
    failures.push(`${file}: missing explicit zero-cost confirmation payload`);
  }
  if (html.includes('Vercel build failed after retry — check build logs') || html.includes('Vercel build failed after retry â€” check build logs')) {
    failures.push(`${file}: retry failures must invoke L2 repair, not stop at check-build-logs`);
  }
  if (!html.includes('Retry deployment failed — invoking L2 Vercel repair') && !html.includes('Retry deployment failed â€” invoking L2 Vercel repair')) {
    failures.push(`${file}: missing retry-to-L2 repair path`);
  }
  if (!html.includes("if (isNextJs && files['src/app/layout.tsx'])")) {
    failures.push(`${file}: missing root app/ precedence guard for src/app builds`);
  }
  if (!html.includes("'package-lock.json', 'npm-shrinkwrap.json', 'frontend/package-lock.json', 'frontend/npm-shrinkwrap.json'")) {
    failures.push(`${file}: missing stale lockfile removal before push`);
  }
}

const provision = fs.readFileSync('api/provision.js', 'utf8');
if (!provision.includes('function isExplicitZeroCostMode(project = {})')) {
  failures.push('api/provision.js: missing server-side explicit zero-cost guard');
}
if (!provision.includes("project?.automation_mode === 'zero_cost' && project?.automation_mode_confirmed === true")) {
  failures.push('api/provision.js: zero-cost skip is not gated by confirmation flag');
}
if (provision.includes('await fetch(`${n8nUrl}/api/v1/workflows/${wd.id}/activate`')) {
  failures.push('api/provision.js: stale n8nUrl typo remains in starter workflow activation');
}

const generatedRepair = fs.readFileSync('api/_generated_repo_repair.mjs', 'utf8');
if (!generatedRepair.includes("'next_root_layout_missing'")) {
  failures.push('api/_generated_repo_repair.mjs: missing root-layout generated repo detector');
}
if (!generatedRepair.includes("'package_lock_drift'")) {
  failures.push('api/_generated_repo_repair.mjs: missing package-lock drift detector');
}

const deploymentRepair = fs.readFileSync('api/_deployment_repair.mjs', 'utf8');
if (!deploymentRepair.includes("diagnostic.class = 'next_root_layout_missing'")) {
  failures.push('api/_deployment_repair.mjs: missing Vercel root-layout classifier');
}
if (!deploymentRepair.includes("diagnostic.class = 'package_lock_drift'")) {
  failures.push('api/_deployment_repair.mjs: missing Vercel package-lock classifier');
}
if (deploymentRepair.includes('needs_constructive_regeneration')) {
  failures.push('api/_deployment_repair.mjs: module_not_found must constructively repair, not defer to regeneration');
}
for (const guard of ['ensureDeployableNextScaffold', "diagnostic.class === 'route_or_live_content'", "diagnostic.class === 'quality'", 'scrubTemplateLeaks', 'constructive_next_scaffold_fallback']) {
  if (!deploymentRepair.includes(guard)) {
    failures.push(`api/_deployment_repair.mjs: missing deployment repair guard ${guard}`);
  }
}

if (failures.length) {
  console.error('check-deployment-repair-guards: failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('check-deployment-repair-guards: ok');
