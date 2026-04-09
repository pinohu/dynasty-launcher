export const maxDuration = 15;

// Patterns that indicate unfilled AI placeholders (not normal markdown syntax)
const PLACEHOLDER_PATTERNS = [
  /\[PLACEHOLDER\]/gi,
  /\[TODO\]/gi,
  /\[INSERT .*?\]/gi,
  /\[FILL IN .*?\]/gi,
  /\[YOUR .*? HERE\]/gi,
  /\[Generation incomplete\]/gi,
  /TODO:/gi,
  /FIXME:/gi,
  /your-domain\.com/gi,
  /example\.com/gi,
  /changeme/gi,
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { files } = req.body;
  const issues = {};
  let totalIssues = 0;

  for (const [filename, content] of Object.entries(files || {})) {
    if (!content || content.length < 50) {
      issues[filename] = ['File too short or empty'];
      totalIssues++;
      continue;
    }
    const fileIssues = [];
    for (const pattern of PLACEHOLDER_PATTERNS) {
      const matches = [...content.matchAll(pattern)];
      if (matches.length > 3) {
        fileIssues.push(`${matches.length} unfilled placeholders matching ${pattern}`);
      }
    }
    if (fileIssues.length) {
      issues[filename] = fileIssues;
      totalIssues += fileIssues.length;
    }
  }

  return res.json({
    ok: totalIssues === 0,
    total_issues: totalIssues,
    files_checked: Object.keys(files || {}).length,
    issues
  });
}
