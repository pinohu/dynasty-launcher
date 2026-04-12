export const maxDuration = 60;

// ── Neon DB Provisioner ───────────────────────────────────────────────────
// Creates new Neon projects/databases for SaaS, directory, compliance projects
// API docs: https://api.neon.tech/docs

async function neonRequest(apiKey, method, path, body) {
  const resp = await fetch(`https://console.neon.tech/api/v2${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await resp.text();
  try { return { ok: resp.ok, status: resp.status, data: JSON.parse(text) }; }
  catch { return { ok: resp.ok, status: resp.status, data: text }; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let config = {};
  try { config = JSON.parse(process.env.DYNASTY_TOOL_CONFIG || '{}'); } catch { config = {}; }
  const NEON_API_KEY = process.env.NEON_API_KEY || config.infrastructure?.neon_api_key;
  const action = req.query?.action || req.body?.action;

  // Auth: require admin token for mutating actions
  const ADMIN_SECRET = process.env.DYNASTY_ADMIN_TOKEN || process.env.ADMIN_TOKEN || '';
  const reqToken = req.headers['x-dynasty-admin-token'] || req.body?.admin_token || '';
  const isMutating = action === 'create_project' || action === 'set_vercel_db';
  if (isMutating) {
    if (!ADMIN_SECRET) return res.status(500).json({ ok: false, error: 'Admin token not configured' });
    if (reqToken !== ADMIN_SECRET) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  // ── CHECK / TEST KEY ─────────────────────────────────────────────────────
  if (action === 'check') {
    const keyMissing = !NEON_API_KEY || NEON_API_KEY.startsWith('REPLACE');
    if (keyMissing) return res.json({ ok: false, has_key: false,
      error: 'NEON_API_KEY not set. Get from console.neon.tech → Account Settings → API Keys',
      action: 'Add NEON_API_KEY env var to dynasty-launcher Vercel project' });
    const r = await neonRequest(NEON_API_KEY, 'GET', '/projects');
    if (r.ok) {
      return res.json({ ok: true, has_key: true });
    }
    return res.json({ ok: false, has_key: true, status: r.status, error: 'Key invalid or Neon API error' });
  }

  // ── CREATE PROJECT + DATABASE ────────────────────────────────────────────
  if (action === 'create_project') {
    const { project_name, region = 'aws-us-east-2' } = req.body || {};
    if (!project_name) return res.status(400).json({ ok: false, error: 'project_name required' });
    const safeName = String(project_name).replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 80);
    if (!safeName) return res.status(400).json({ ok: false, error: 'Invalid project_name' });
    const ALLOWED_REGIONS = ['aws-us-east-2', 'aws-us-east-1', 'aws-us-west-2', 'aws-eu-central-1', 'aws-ap-southeast-1'];
    const safeRegion = ALLOWED_REGIONS.includes(region) ? region : 'aws-us-east-2';

    if (!NEON_API_KEY) {
      return res.json({
        ok: false,
        manual: true,
        error: 'NEON_API_KEY not set. Add to Vercel env vars at dynasty-launcher project, then retry.',
        instructions: [
          '1. Go to console.neon.tech → Account Settings → API Keys → Create Key',
          '2. Add NEON_API_KEY to dynasty-launcher Vercel project env vars',
          '3. Add to DYNASTY_TOOL_CONFIG: infrastructure.neon_api_key',
          '4. Re-run provision to auto-create the database'
        ]
      });
    }

    // Create Neon project
    const projResp = await neonRequest(NEON_API_KEY, 'POST', '/projects', {
      project: {
        name: safeName,
        region_id: safeRegion,
        pg_version: 16,
        autoscaling_limit_min_cu: 0.25,
        autoscaling_limit_max_cu: 0.5
      }
    });

    if (!projResp.ok) {
      return res.json({
        ok: false,
        error: 'Neon project creation failed. Check API key and try again.'
      });
    }

    const project = projResp.data?.project;
    const connection = projResp.data?.connection_uris?.[0];
    const projectId = project?.id;

    // Rename default database to match project slug
    const dbName = project_name.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    if (projectId && dbName !== 'neondb') {
      try {
        const branchId = projResp.data?.branch?.id;
        if (branchId) {
          await neonRequest(NEON_API_KEY, 'POST', `/projects/${projectId}/branches/${branchId}/databases`, {
            database: { name: dbName, owner_name: 'neondb_owner' }
          });
        }
      } catch {}
    }

    const connectionUri = connection?.connection_uri || '';
    const poolerUri = connectionUri.replace('.neon.tech', '-pooler.neon.tech') +
      (connectionUri.includes('?') ? '&sslmode=require' : '?sslmode=require');

    return res.json({
      ok: true,
      project_id: projectId,
      project_name: project?.name,
      region: project?.region_id,
      database_url_set: !!(poolerUri || connectionUri),
      dashboard_url: `https://console.neon.tech/app/projects/${projectId}`,
      note: 'Retrieve DATABASE_URL from the Neon dashboard and add it to your Vercel project env vars'
    });
  }

  // ── ADD DATABASE_URL TO VERCEL PROJECT (handoff only — never auto-inject secrets) ──
  if (action === 'set_vercel_db') {
    const { vercel_project_id, database_url } = req.body || {};
    if (!vercel_project_id || !database_url) {
      return res.status(400).json({ ok: false, error: 'vercel_project_id and database_url required' });
    }
    return res.json({
      ok: true,
      pushed: false,
      note:
        'DATABASE_URL is not written to Vercel by this endpoint. Add it in the customer Vercel project (Settings → Environment Variables, encrypted) or follow MANUAL-ACTIONS.md.',
      vercel_project_id,
    });
  }

  return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
}
