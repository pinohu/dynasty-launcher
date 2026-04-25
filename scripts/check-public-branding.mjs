import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const explicitPages = [
  'index.html',
  'marketplace.html',
  'maturity.html',
  'deliverables.html',
  'docs.html',
  'contact.html',
  'privacy.html',
  'terms.html',
  'public/index.html',
  'public/marketplace.html',
  'public/maturity.html',
  'public/deliverables.html',
  'public/docs.html',
  'public/contact.html',
  'public/privacy.html',
  'public/terms.html',
];

const recursiveRoots = ['for', 'public/for', 'deliverables', 'public/deliverables'];
const files = new Set(explicitPages);

function walk(dir) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(next);
    if (entry.isFile() && entry.name.endsWith('.html')) files.add(next.replace(/\\/g, '/'));
  }
}

for (const dir of recursiveRoots) walk(dir);

const allowedPatterns = [
  /dynastyempire\.com/i,
  /@dynastyempire\.com/i,
  /DYNASTY_TOOL_CONFIG/,
  /DYNASTY-SITE-FACTORY/,
  /dynasty-launcher/i,
  /dynasty_[a-z0-9_]+/i,
];

const failures = [];
for (const rel of files) {
  const absolute = path.join(root, rel);
  if (!fs.existsSync(absolute)) continue;
  const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!/\b(DYNASTY|Dynasty)\b/.test(line)) return;
    if (allowedPatterns.some((pattern) => pattern.test(line))) return;
    failures.push(`${rel}:${index + 1}: ${line.trim().slice(0, 180)}`);
  });
}

if (failures.length) {
  console.error('Public-facing DYNASTY brand references found. Use "Your Deputy" on marketing pages.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Public branding check passed across ${files.size} HTML pages.`);
