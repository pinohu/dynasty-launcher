// api/validate.js — placeholder, template-leak, and niche-grounding checks for generated artifacts
export const maxDuration = 15;

const VALIDATE_ATTEMPTS = new Map();
const VALIDATE_MAX = 30;
const VALIDATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 2_000_000;
const MAX_FILES = 50;
const MAX_FILENAME_LENGTH = 180;
const MAX_FILE_CHARS = 500_000;

function getClientIp(req) {
  const xf = (req.headers?.['x-forwarded-for'] || '').toString();
  return xf.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

function isValidateRateLimited(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const existing = VALIDATE_ATTEMPTS.get(ip);
  if (!existing || now - existing.windowStart > VALIDATE_WINDOW_MS) {
    VALIDATE_ATTEMPTS.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  existing.count += 1;
  if (VALIDATE_ATTEMPTS.size > 5000) {
    for (const [key, value] of VALIDATE_ATTEMPTS) {
      if (now - value.windowStart > VALIDATE_WINDOW_MS) VALIDATE_ATTEMPTS.delete(key);
    }
  }
  return existing.count > VALIDATE_MAX;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Any single match fails the file (template leaks, obvious placeholders). */
const ZERO_TOLERANCE = [
  { re: /\[PLACEHOLDER\]/i, label: '[PLACEHOLDER]' },
  { re: /\[Generation incomplete\]/i, label: '[Generation incomplete]' },
  { re: /\[INSERT [^\]]+\]/i, label: '[INSERT …]' },
  { re: /\[FILL IN [^\]]+\]/i, label: '[FILL IN …]' },
  { re: /\[YOUR [^\]]+ HERE\]/i, label: '[YOUR … HERE]' },
  { re: /\[TBD\]/i, label: '[TBD]' },
  { re: /\[REPLACE[^\]]*\]/i, label: '[REPLACE…]' },
  { re: /<\s*!\s*--\s*TODO\s*-->/i, label: 'HTML TODO comment' },
  { re: /\bSaaS Template\b/i, label: 'template branding (SaaS Template)' },
  { re: /\bIxartz\b/i, label: 'template branding (Ixartz)' },
  { re: /nextjs-boilerplate/i, label: 'template slug (nextjs-boilerplate)' },
  { re: /\blorem ipsum\b/i, label: 'lorem ipsum' },
  // Case-sensitive so prose like "your company name" in gov checklists is not flagged
  { re: /\bCompany Name\b/, label: 'generic Company Name' },
  { re: /\bYour Company\b/, label: 'generic Your Company' },
  { re: /\bMy Awesome SaaS\b/i, label: 'boilerplate product name' },
];

/** Need several hits before failing (avoids flagging legitimate "example.com" in API docs). */
const REPEAT_THRESHOLD = [
  { re: /\[TODO\]/gi, min: 2, label: '[TODO]' },
  { re: /\bTODO:/gi, min: 4, label: 'TODO:' },
  { re: /\bFIXME:/gi, min: 2, label: 'FIXME:' },
  { re: /your-domain\.com/gi, min: 4, label: 'your-domain.com' },
  { re: /example\.com/gi, min: 5, label: 'example.com' },
  { re: /changeme/gi, min: 3, label: 'changeme' },
  { re: /xxx\.xxx/gi, min: 2, label: 'xxx.xxx' },
  { re: /\bTBD\b/g, min: 6, label: 'TBD (word)' },
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateNicheGrounding({ filename, content, projectName }) {
  const issues = [];
  const name = (projectName || '').trim();
  if (name.length < 4) return issues;
  const narrativeFiles = new Set(['BUSINESS-SYSTEM.md', 'SPEC.md']);
  if (!narrativeFiles.has(filename)) return issues;

  // Prefer the exact project name, but accept if a majority of its distinctive
  // words (≥4 chars, non-stopword) appear — AI output often drops suffixes like
  // "NG" or expands abbreviations ("NG" → "Nigeria") without losing the niche.
  try {
    const exact = new RegExp(escapeRegExp(name), 'i');
    if (exact.test(content)) return issues;
  } catch {
    issues.push('Niche grounding: could not verify project name (invalid characters)');
    return issues;
  }

  const stop = new Set([
    'the',
    'and',
    'for',
    'with',
    'from',
    'into',
    'your',
    'their',
    'inc',
    'llc',
    'ltd',
    'co',
  ]);
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ''))
    .filter((w) => w.length >= 4 && !stop.has(w.toLowerCase()));

  if (words.length === 0) {
    // Single short name like "NG" or "X" — fall back to substring match; already failed.
    issues.push(`Niche grounding: project name "${name.slice(0, 80)}" not found in this file`);
    return issues;
  }

  const lower = content.toLowerCase();
  const hits = words.filter((w) => lower.includes(w.toLowerCase())).length;
  const needed = Math.max(1, Math.ceil(words.length * 0.5));
  if (hits < needed) {
    issues.push(
      `Niche grounding: project name "${name.slice(0, 80)}" (or ${needed}/${words.length} of its key words) not found in this file`,
    );
  }
  return issues;
}

function validateCategoryHints({ filename, content, category }) {
  const issues = [];
  if (!category || !content) return issues;
  const c = String(category).toLowerCase();
  // Light signals — one missing keyword is a warning only for SPEC (product truth)
  if (filename !== 'SPEC.md') return issues;
  const need = [];
  if (c === 'ecom' && !/\b(cart|checkout|product|inventory|order)\b/i.test(content)) {
    need.push('e-commerce SPEC should mention products, cart/checkout, or orders');
  }
  if (c === 'directory' && !/\b(listing|directory|search|profile|vendor|member)\b/i.test(content)) {
    need.push('directory/marketplace SPEC should mention listings, search, or profiles');
  }
  if (c === 'ai' && !/\b(model|llm|agent|chat|embedding|rag|stream)\b/i.test(content)) {
    need.push('AI application SPEC should mention models, agents, chat, RAG, or streaming');
  }
  if (c === 'dashboard' && !/\b(dashboard|admin|role|chart|table|report|kpi)\b/i.test(content)) {
    need.push('dashboard SPEC should mention dashboard/admin, roles, or data views');
  }
  if (c === 'service' && !/\b(book|schedul|calendar|lead|client|appointment)\b/i.test(content)) {
    need.push('service-business SPEC should mention booking, leads, clients, or scheduling');
  }
  if (
    (c === 'saas' || c === 'enterprise') &&
    !/\b(subscrip|billing|tenant|auth|sso|role|plan)\b/i.test(content)
  ) {
    need.push(
      'SaaS / enterprise SPEC should mention auth, roles, billing, subscriptions, or plans',
    );
  }
  if (need.length) issues.push(...need);
  return issues;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (isValidateRateLimited(req)) {
    res.setHeader('Retry-After', '600');
    return res
      .status(429)
      .json({ ok: false, error: 'Too many validation requests. Try again later.' });
  }

  const bodyStr = JSON.stringify(req.body || {});
  if (bodyStr.length > MAX_BODY_BYTES)
    return res.status(413).json({ ok: false, error: 'Payload too large (2MB max)' });

  const { files, projectName, category } = req.body || {};
  if (!isPlainObject(files) || Object.keys(files).length > MAX_FILES) {
    return res.status(400).json({ ok: false, error: 'Invalid files input (max 50 files)' });
  }
  const issues = Object.create(null);
  let totalIssues = 0;

  // Files the client declares "always required" even when empty. Everything
  // else is only validated when content exists — Next.js/TS projects don't
  // ship backend/main.py, so an empty string there must not fail the gate.
  const REQUIRED_FILES = new Set(['DESIGN.md', 'SPEC.md', 'BUSINESS-SYSTEM.md']);

  for (const [filename, content] of Object.entries(files || {})) {
    if (filename.length > MAX_FILENAME_LENGTH) {
      issues[filename.slice(0, MAX_FILENAME_LENGTH)] = ['Filename too long'];
      totalIssues++;
      continue;
    }
    if (typeof content !== 'string') {
      issues[filename] = ['File content must be a string'];
      totalIssues++;
      continue;
    }
    if (content.length > MAX_FILE_CHARS) {
      issues[filename] = [`File too large (${MAX_FILE_CHARS} character max)`];
      totalIssues++;
      continue;
    }
    if (!content || content.length < 50) {
      if (REQUIRED_FILES.has(filename)) {
        issues[filename] = ['File too short or empty'];
        totalIssues++;
      }
      continue;
    }
    const fileIssues = [];

    for (const { re, label } of ZERO_TOLERANCE) {
      const matches = content.match(re);
      if (matches && matches.length > 0) {
        fileIssues.push(`Blocked pattern: ${label} (${matches.length}×)`);
      }
    }
    for (const { re, min, label } of REPEAT_THRESHOLD) {
      const all = [...content.matchAll(re)];
      if (all.length >= min) {
        fileIssues.push(`${all.length}× ${label} (threshold ${min})`);
      }
    }

    fileIssues.push(...validateNicheGrounding({ filename, content, projectName }));
    fileIssues.push(...validateCategoryHints({ filename, content, category }));

    if (fileIssues.length) {
      issues[filename] = fileIssues;
      totalIssues += fileIssues.length;
    }
  }

  return res.json({
    ok: totalIssues === 0,
    total_issues: totalIssues,
    files_checked: Object.keys(files || {}).length,
    issues,
  });
}
