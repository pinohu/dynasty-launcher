// api/validate.js — placeholder, template-leak, and niche-grounding checks for generated artifacts
export const maxDuration = 15;

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
  try {
    const re = new RegExp(escapeRegExp(name), 'i');
    if (!re.test(content)) {
      issues.push(`Niche grounding: project name "${name.slice(0, 80)}" not found in this file`);
    }
  } catch {
    issues.push('Niche grounding: could not verify project name (invalid characters)');
  }
  return issues;
}

function validateCategoryHints({ filename, content, category }) {
  const issues = [];
  if (!category || !content) return issues;
  const c = String(category).toLowerCase();
  const lower = content.toLowerCase();
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
  if ((c === 'saas' || c === 'enterprise') && !/\b(subscrip|billing|tenant|auth|sso|role|plan)\b/i.test(content)) {
    need.push('SaaS / enterprise SPEC should mention auth, roles, billing, subscriptions, or plans');
  }
  if (need.length) issues.push(...need);
  return issues;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  const bodyStr = JSON.stringify(req.body || {});
  if (bodyStr.length > 2_000_000) return res.status(413).json({ ok: false, error: 'Payload too large (2MB max)' });

  const { files, projectName, category } = req.body || {};
  if (!files || Object.keys(files).length > 50) return res.status(400).json({ ok: false, error: 'Invalid files input (max 50 files)' });
  const issues = {};
  let totalIssues = 0;

  for (const [filename, content] of Object.entries(files || {})) {
    if (!content || content.length < 50) {
      issues[filename] = ['File too short or empty'];
      totalIssues++;
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
