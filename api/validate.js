export const maxDuration = 15;

const PLACEHOLDER_PATTERNS = [
  /\[.*?\]/g,          // [placeholder text]
  /\[PLACEHOLDER\]/gi,
  /TODO:/gi,
  /FIXME:/gi,
  /your-domain\.com/gi,
  /example\.com/gi,
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { files } = req.body; // { filename: content }
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
      if (matches.length > 3) { // allow a few in templates
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
