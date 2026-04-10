// Serverless Function — proxies GitHub API using server-side GITHUB_TOKEN
// Security: validates path prefix to prevent abuse
export const maxDuration = 30;

const ALLOWED_PATH_PREFIXES = [
  '/repos/pinohu/',
  '/user/repos',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  const ghPath = req.query.path || '';

  // Validate path to prevent open relay abuse
  const allowed = ALLOWED_PATH_PREFIXES.some(p => ghPath.startsWith(p));
  if (!allowed) {
    return res.status(403).json({ error: 'Path not allowed', path: ghPath });
  }

  const method = req.method;
  const body = method !== 'GET' && method !== 'HEAD' ? JSON.stringify(req.body) : undefined;

  try {
    const upstream = await fetch(`https://api.github.com${ghPath}`, {
      method,
      headers: {
        'Authorization': `token ${ghToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'dynasty-launcher',
      },
      ...(body ? { body } : {}),
    });

    const data = await upstream.text();
    return res.status(upstream.status).send(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
