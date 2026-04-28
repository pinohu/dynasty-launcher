import { dispatchEvent } from '../events/_dispatcher.mjs';
import { getLaunch, listLeads, saveLead } from './_fulfillment_store.mjs';

export const maxDuration = 30;

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let raw = '';
    req.on?.('data', (chunk) => {
      raw += chunk;
    });
    req.on?.('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    if (!req.on) resolve({});
  });
}

function publicLaunch(launch, leads = null) {
  return {
    launch_id: launch.launch_id,
    tenant_id: launch.tenant_id,
    offer_id: launch.offer_id,
    status: launch.status,
    launched_url: launch.launched_url,
    profile: launch.profile,
    runtime: launch.runtime,
    modules: launch.modules,
    components: launch.components,
    created_at: launch.created_at,
    updated_at: launch.updated_at,
    leads,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://www.yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ ok: false, error: 'GET or POST only' });
  }

  const body = req.method === 'POST' ? await readBody(req) : {};
  const launchId = req.query?.launch_id || req.query?.id || body.launch_id || '';
  if (!launchId) return res.status(400).json({ ok: false, error: 'launch_id required' });

  const launch = await getLaunch(launchId);
  if (!launch) return res.status(404).json({ ok: false, error: 'launch_not_found' });

  if (req.method === 'GET') {
    const includeLeads = req.query?.include_leads === '1';
    return res.status(200).json({
      ok: true,
      launch: publicLaunch(launch, includeLeads ? await listLeads(launchId) : null),
    });
  }

  const lead = await saveLead({
    launch_id: launch.launch_id,
    tenant_id: launch.tenant_id,
    payload: {
      name: body.name || '',
      contact: body.contact || '',
      email: body.email || '',
      phone: body.phone || '',
      need: body.need || '',
      source: body.source || 'launched_deliverable',
    },
  });
  const dispatch = await dispatchEvent({
    tenant_id: launch.tenant_id,
    event_type: 'form.submitted',
    payload: {
      ...lead.payload,
      source: lead.payload.source,
      email: lead.payload.email || lead.payload.contact,
      phone: lead.payload.phone || lead.payload.contact,
    },
  });

  return res.status(200).json({
    ok: true,
    lead,
    dispatch,
  });
}
