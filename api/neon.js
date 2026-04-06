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
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const config = JSON.parse(process.env.DYNASTY_TOOL_CONFIG || '{}');
  const NEON_API_KEY = process.env.NEON_API_KEY || config.infrastructure?.neon_api_key;
  const action = req.query?.action || req.body?.action;

  // ── CHECK / TEST KEY ─────────────────────────────────────────────────────
  if (action === 'check') {
    if (!NEON_API_KEY) return res.json({ ok: false, has_key: false, error: 'No NEON_API_KEY env var or config.infrastructure.neon_api_key' });
    const r = await neonRequest(NEON_API_KEY, 'GET', '/projects');
    if (r.ok) {
      return res.json({ ok: true, has_key: true, projects: r.data?.projects?.length || 0 });
    }
    return res.json({ ok: false, has_key: true, status: r.status, error: 'Key invalid or Neon API error' });
  }

  // ── CREATE PROJECT + DATABASE ────────────────────────────────────────────
  if (action === 'create_project') {
    const { project_name, region = 'aws-us-east-2' } = req.body || {};
    if (!project_name) return res.status(400).json({ ok: false, error: 'project_name required' });

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
        name: project_name,
        region_id: region,
        pg_version: 16,
        autoscaling_limit_min_cu: 0.25,
        autoscaling_limit_max_cu: 0.5
      }
    });

    if (!projResp.ok) {
      return res.json({
        ok: false,
        error: `Neon project creation failed: ${JSON.stringify(projResp.data).slice(0, 150)}`
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
      database_url: poolerUri || connectionUri,
      dashboard_url: `https://console.neon.tech/app/projects/${projectId}`,
      note: 'Add DATABASE_URL to your Vercel project env vars'
    });
  }

  // ── ADD DATABASE_URL TO VERCEL PROJECT ───────────────────────────────────
  if (action === 'set_vercel_db') {
    const { vercel_project_id, database_url } = req.body || {};
    if (!vercel_project_id || !database_url) {
      return res.status(400).json({ ok: false, error: 'vercel_project_id and database_url required' });
    }
    const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN || config.infrastructure?.vercel;
    const VERCEL_TEAM = 'team_fuTLGjBMk3NAD32Bm5hA7wkr';

    const payload = [{
      key: 'DATABASE_URL',
      value: database_url,
      type: 'encrypted',
      target: ['production', 'preview', 'development']
    }];

    const r = await fetch(
      `https://api.vercel.com/v10/projects/${vercel_project_id}/env?teamId=${VERCEL_TEAM}`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    return res.json({ ok: r.ok, status: r.status });
  }

  return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
}
