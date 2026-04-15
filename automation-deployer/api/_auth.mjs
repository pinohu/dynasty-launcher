/**
 * Shared admin-auth helper for API endpoints.
 */
export function requireAuth(req, res) {
  const adminKey = process.env.DEPLOYER_ADMIN_KEY;
  if (!adminKey) {
    res.status(500).json({ error: 'server missing DEPLOYER_ADMIN_KEY' });
    return false;
  }
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || token !== adminKey) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}
