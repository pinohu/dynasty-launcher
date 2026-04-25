import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const targets = [
  'index.html',
  'marketplace.html',
  'site-shell.css',
  path.join('public', 'index.html'),
  path.join('public', 'marketplace.html'),
  path.join('public', 'site-shell.css'),
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(path.relative(root, full));
  }
  return out;
}

targets.push(...walk(path.join(root, 'public', 'automations')));
targets.push(...walk(path.join(root, 'public', 'launch')));
targets.push(...walk(path.join(root, 'public', 'plans')));
targets.push(...walk(path.join(root, 'public', 'editions')));
targets.push(...walk(path.join(root, 'public', 'suites')));
targets.push(...walk(path.join(root, 'public', 'setup')));

const uniqueTargets = [...new Set(targets)];
const failures = [];

for (const rel of uniqueTargets) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const lower = line.toLowerCase();
    const isButtonish =
      /class=["'][^"']*(btn|button|cta|yd-cta|secondary|primary)/i.test(line) ||
      /<button\b/i.test(line);
    if (!isButtonish) return;
    if (lower.includes('white-space:nowrap') || lower.includes('white-space: nowrap')) {
      failures.push(`${rel}:${idx + 1} button-like element forces nowrap`);
    }
    if (lower.includes('display:inline-block') || lower.includes('display: inline-block')) {
      failures.push(`${rel}:${idx + 1} button-like element uses inline-block instead of wrapping flex`);
    }
  });
}

const shellCss = fs.readFileSync(path.join(root, 'site-shell.css'), 'utf8');
for (const required of ['overflow-wrap: anywhere', 'max-width: 100%', 'white-space: normal']) {
  if (!shellCss.includes(required)) {
    failures.push(`site-shell.css missing containment rule: ${required}`);
  }
}

if (failures.length) {
  console.error('check-button-containment: failed');
  for (const failure of failures.slice(0, 80)) console.error(` - ${failure}`);
  if (failures.length > 80) console.error(` - ...and ${failures.length - 80} more`);
  process.exit(1);
}

console.log(`check-button-containment: ok (${uniqueTargets.length} files)`);
