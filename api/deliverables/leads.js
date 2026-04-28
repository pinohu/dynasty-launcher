import { getTenant } from '../tenants/_store.mjs';
import { privilegedCorsHeaders, verifyAdminCredential, verifyTenantCredential } from '../tenants/_auth.mjs';
import { getLaunch, listLeads } from './_fulfillment_store.mjs';

export const maxDuration = 15;

function redactLead(lead) {
  return {
    lead_id: lead.lead_id,
    launch_id: lead.launch_id,
    tenant_id: lead.tenant_id,
    payload: lead.payload || {},
    status: lead.status,
    created_at: lead.created_at,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://www.yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', privilegedCorsHeaders());
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'GET only' });
  }

  const launchId = req.query?.launch_id || req.query?.id || '';
  if (!launchId) return res.status(400).json({ ok: false, error: 'launch_id required' });

  const launch = await getLaunch(launchId);
  if (!launch) return res.status(404).json({ ok: false, error: 'launch_not_found' });

  const admin = verifyAdminCredential(req);
  if (!admin.ok) {
    const tenant = launch.tenant_id ? await getTenant(launch.tenant_id) : null;
    if (!tenant) return res.status(403).json({ ok: false, error: 'tenant_not_bound' });
    const tenantAuth = verifyTenantCredential(req, tenant);
    if (!tenantAuth.ok) {
      return res.status(tenantAuth.status || 403).json({ ok: false, error: tenantAuth.error });
    }
  }

  const leads = await listLeads(launchId);
  return res.status(200).json({
    ok: true,
    launch_id: launch.launch_id,
    tenant_id: launch.tenant_id,
    count: leads.length,
    leads: leads.map(redactLead),
  });
}
