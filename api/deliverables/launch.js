import { dispatchEvent } from '../events/_dispatcher.mjs';
import { getLaunch, saveLead } from './_fulfillment_store.mjs';

export const maxDuration = 30;

const MAX_PUBLIC_BODY_BYTES = 16 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_POSTS = 12;

function rateBuckets() {
  if (!globalThis.__yourDeputyLaunchRateBuckets) {
    globalThis.__yourDeputyLaunchRateBuckets = new Map();
  }
  return globalThis.__yourDeputyLaunchRateBuckets;
}

function clientKey(req, launchId) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
  return `${launchId}:${ip}`;
}

function consumePublicPost(req, launchId) {
  const key = clientKey(req, launchId);
  const now = Date.now();
  const buckets = rateBuckets();
  const current = buckets.get(key);
  if (!current || current.reset_at <= now) {
    buckets.set(key, { count: 1, reset_at: now + RATE_WINDOW_MS });
    return { ok: true };
  }
  current.count += 1;
  if (current.count > RATE_MAX_POSTS) {
    return {
      ok: false,
      status: 429,
      error: 'lead_capture_rate_limited',
      retry_after_seconds: Math.ceil((current.reset_at - now) / 1000),
    };
  }
  return { ok: true };
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let raw = '';
    req.on?.('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_PUBLIC_BODY_BYTES) {
        req.destroy?.();
        resolve({ __too_large: true });
      }
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

function publicLaunch(launch) {
  return {
    launch_id: launch.launch_id,
    offer_id: launch.offer_id,
    status: launch.status,
    launched_url: launch.launched_url,
    profile: launch.profile,
    runtime: launch.runtime,
    modules: launch.modules,
    components: launch.components,
    created_at: launch.created_at,
    updated_at: launch.updated_at,
  };
}

function publicLead(lead) {
  return {
    lead_id: lead.lead_id,
    status: lead.status,
    created_at: lead.created_at,
  };
}

function validateLeadBody(body) {
  if (body.__too_large) return { ok: false, status: 413, error: 'lead_payload_too_large' };
  if (body.website || body.url || body.company_site) {
    return { ok: false, status: 400, error: 'spam_rejected' };
  }
  const email = String(body.email || '').trim();
  const contact = String(body.contact || '').trim();
  const phone = String(body.phone || '').trim();
  const need = String(body.need || '').trim();
  if (!email && !contact && !phone) {
    return { ok: false, status: 400, error: 'lead_contact_required' };
  }
  if ([email, contact, phone, need, String(body.name || '')].some((v) => v.length > 1000)) {
    return { ok: false, status: 400, error: 'lead_field_too_long' };
  }
  return { ok: true, email, contact, phone, need, name: String(body.name || '').trim() };
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
    return res.status(200).json({
      ok: true,
      launch: publicLaunch(launch),
    });
  }

  const rate = consumePublicPost(req, launchId);
  if (!rate.ok) return res.status(rate.status).json(rate);

  const validated = validateLeadBody(body);
  if (!validated.ok) return res.status(validated.status).json(validated);

  const lead = await saveLead({
    launch_id: launch.launch_id,
    tenant_id: launch.tenant_id,
    payload: {
      name: validated.name,
      contact: validated.contact,
      email: validated.email,
      phone: validated.phone,
      need: validated.need,
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
    lead: publicLead(lead),
    dispatch,
  });
}
