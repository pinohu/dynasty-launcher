/**
 * GET /api/health — liveness probe.
 */
export default function handler(_req, res) {
  res.status(200).json({ ok: true, service: 'automation-deployer', time: new Date().toISOString() });
}
