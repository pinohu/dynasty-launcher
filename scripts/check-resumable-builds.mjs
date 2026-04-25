import fs from 'node:fs';

const targets = ['app.html', 'public/app.html'];
const required = [
  'DYNASTY_STAGE_ORDER',
  'function dynastyCheckpointReached',
  'window.__dynastyResumeCheckpoint',
  "stage: 'files_pushed'",
  "stage: 'report_pushed'",
  "stage: 'provisioned'",
  "stage: 'v3_modules'",
  "stage: 'verifying'",
  "stage: 'done'",
  'Resumed after GitHub push',
  'Resumed provisioned infrastructure from checkpoint',
  'Resume saved session',
];

let failed = false;
for (const file of targets) {
  if (!fs.existsSync(file)) {
    console.error(`[resume-check] missing ${file}`);
    failed = true;
    continue;
  }
  const source = fs.readFileSync(file, 'utf8');
  for (const needle of required) {
    if (!source.includes(needle)) {
      console.error(`[resume-check] ${file} missing guard: ${needle}`);
      failed = true;
    }
  }
  if (/eb\.textContent=.*Unknown error/.test(source) && !source.includes('resume.onclick=resumeBuildFromCheckpoint')) {
    console.error(`[resume-check] ${file} exposes an error recovery path without checkpoint resume`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('[resume-check] staged build resume guards present');
