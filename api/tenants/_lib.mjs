// api/tenants/_lib.mjs — shared helpers for api/tenants/*
// -----------------------------------------------------------------------------
// HTTP helpers, body parsing, and CORS shared by every tenant endpoint.
// -----------------------------------------------------------------------------

export function corsPreflight(req, res) {
  const origin = process.env.CORS_ORIGIN || 'https://yourdeputy.com';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-key');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function methodGuard(req, res, allowed) {
  if (!allowed.includes(req.method)) {
    res.status(405).json({ error: `${allowed.join(', ')} only` });
    return false;
  }
  return true;
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (chunk) => { buf += chunk; });
    req.on('end', () => {
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

export function adminOnly(req, res) {
  const key = req.headers['x-admin-key'] || req.query?.key;
  const expected = process.env.ADMIN_KEY || process.env.TEST_ADMIN_KEY;
  if (!expected || key !== expected) {
    res.status(403).json({ error: 'admin_only' });
    return false;
  }
  return true;
}
