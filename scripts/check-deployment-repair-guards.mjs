import fs from 'node:fs';

const failures = [];
const htmlFiles = ['app.html', 'public/app.html'];

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

if (failures.length) {
  console.error('check-deployment-repair-guards: failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('check-deployment-repair-guards: ok');
