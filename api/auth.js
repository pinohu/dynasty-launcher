// ── Dynasty Launcher Access Gate ──────────────────────────────────────────────
// Password-protects the launcher. Set LAUNCHER_PASSWORD env var in Vercel.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }

  const { password } = req.body || {};
  const CORRECT = process.env.LAUNCHER_PASSWORD || 'DYNASTY-2026-IKE';

  if (!password || password !== CORRECT) {
    // Small delay to slow brute force
    await new Promise(r => setTimeout(r, 500));
    return res.status(401).json({ ok: false, error: 'Wrong password' });
  }

  // Return a simple session token: base64 of "dynasty:timestamp:secret"
  const SECRET = process.env.LAUNCHER_SECRET || 'dyn_s3cr3t_2026';
  const now = Date.now();
  // Token valid for 12 hours
  const expiry = now + (12 * 60 * 60 * 1000);
  const raw = `dynasty:${expiry}:${SECRET}`;
  const token = Buffer.from(raw).toString('base64');

  return res.json({ ok: true, token, expiry });
}
