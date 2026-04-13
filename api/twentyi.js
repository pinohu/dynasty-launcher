export const maxDuration = 60;

// ── 20i Hosting Provisioner ───────────────────────────────────────────────
// Used for: wp-theme, static, portfolio project types
// Docs: https://api.20i.com

function getAuth(config) {
  // 20i API: the General API key IS the Bearer token (no encoding needed)
  const general = config?.infrastructure?.twentyi_general;
  if (!general) return null;
  return `Bearer ${general}`;
}

async function twentyiRequest(auth, method, path, body) {
  const resp = await fetch(`https://api.20i.com${path}`, {
    method,
    headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await resp.text();
  try { return { ok: resp.ok, status: resp.status, data: JSON.parse(text) }; }
  catch { return { ok: resp.ok, status: resp.status, data: text }; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Security: require paid session or admin token ──────────────────
  const _adminTok = (req.headers['x-dynasty-admin-token'] || '').toString();
  const _paidTok = (req.body?.access_token || req.headers['x-dynasty-access-token'] || '').toString();
  let _authed = false;
  if (_adminTok) {
    try {
      const parts = _adminTok.split(':');
      if (parts.length === 3) {
        const [prefix, expiry, hash] = parts;
        const secret = prefix === 'admin' ? (process.env.ADMIN_KEY || '') : (prefix === 'admin_test' ? (process.env.TEST_ADMIN_KEY || '') : '');
        if (secret && parseInt(expiry) > Date.now()) {
          const { createHmac } = await import('crypto');
          const expected = createHmac('sha256', secret).update(prefix + ':' + expiry).digest('hex');
          if (hash === expected) _authed = true;
        }
      }
    } catch {}
  }
  if (!_authed && _paidTok) {
    try {
      const parts = _paidTok.split(':');
      if (parts.length >= 6 && parts[0] === 'pay') {
        const exp = parseInt(parts[4]);
        if (exp > Date.now()) _authed = true;
      }
    } catch {}
  }
  if (!_authed) return res.status(401).json({ ok: false, error: 'Authentication required' });


  const config = JSON.parse(process.env.DYNASTY_TOOL_CONFIG || '{}');
  const auth = getAuth(config);

  if (!auth) {
    return res.status(400).json({
      ok: false,
      error: 'No 20i API keys in DYNASTY_TOOL_CONFIG. Add: infrastructure.twentyi_general and infrastructure.twentyi_oauth',
      manual: true
    });
  }

  const action = req.query?.action || req.body?.action;

  // ── CHECK KEYS ──────────────────────────────────────────────────────────
  if (action === 'check') {
    const r = await twentyiRequest(auth, 'GET', '/package');
    if (r.ok) {
      const packages = Array.isArray(r.data) ? r.data : r.data?.packages || [];
      return res.json({ ok: true, active: true, package_count: packages.length });
    }
    return res.json({ ok: false, active: false, status: r.status,
      error: '20i API keys invalid or expired. Update twentyi_general and twentyi_oauth in DYNASTY_TOOL_CONFIG' });
  }

  // ── CREATE PACKAGE (WordPress or Static) ────────────────────────────────
  if (action === 'create_package') {
    const { site_name, domain, type, stack_user } = req.body;
    if (!site_name || !domain) return res.status(400).json({ ok: false, error: 'site_name and domain required' });

    // Determine bundle — WordPress vs Static HTML
    const isWordPress = type === 'wp-theme' || type === 'wordpress';
    const bundleId = isWordPress ? 88291 : 80359; // 88291=WordPress Pinnacle, 80359=Linux Pinnacle

    // 1. Create package
    const pkgResp = await twentyiRequest(auth, 'POST', '/reseller/10455/addWeb', {
      domain_name: domain,
      type: bundleId
    });

    if (!pkgResp.ok) {
      return res.json({
        ok: false,
        error: `Package creation failed: ${JSON.stringify(pkgResp.data).slice(0, 120)}`,
        keys_expired: pkgResp.status === 401
      });
    }

    const pkg = pkgResp.data;
    const packageId = pkg?.result || pkg?.id;

    // 2. Get FTP/SSH credentials if available
    let credentials = {};
    if (packageId) {
      const credResp = await twentyiRequest(auth, 'GET', `/package/${packageId}/web`);
      if (credResp.ok) {
        credentials = {
          ftp_host: credResp.data?.ftpHost,
          ftp_user: credResp.data?.ftpUser,
          ssh_host: credResp.data?.sshHost,
        };
      }
    }

    return res.json({
      ok: true,
      package_id: packageId,
      domain,
      control_panel: `https://my.20i.com/package/${packageId}`,
      ...credentials,
      type: isWordPress ? 'WordPress' : 'Static'
    });
  }

  // ── LIST PACKAGES ────────────────────────────────────────────────────────
  if (action === 'list') {
    const r = await twentyiRequest(auth, 'GET', '/package');
    if (!r.ok) return res.json({ ok: false, status: r.status, error: r.data });
    const packages = Array.isArray(r.data) ? r.data : [];
    return res.json({
      ok: true,
      count: packages.length,
      packages: packages.slice(0, 20).map(p => ({ id: p.id, name: p.name }))
    });
  }

  return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
}
