// Serverless Function — proxies GitHub API using server-side GITHUB_TOKEN
export const maxDuration = 30;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  const ghPath = req.query.path || '';
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
