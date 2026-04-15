/**
 * 2.01 — Web Form → CRM
 *
 * Vercel serverless function. Receives form POST, validates, normalizes,
 * creates contact in the tenant's CRM via vendor-agnostic adapter.
 *
 * Deployed as api/auto-2.01-web-form-to-crm.js on the tenant's Vercel project.
 */

const REQUIRED_FIELDS = ['email'];
const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const origin = req.headers.origin || '';
  if (process.env.ALLOWED_ORIGIN && origin && origin !== process.env.ALLOWED_ORIGIN) {
    res.status(403).json({ error: 'origin not allowed' });
    return;
  }
  const body = req.body || {};
  for (const k of REQUIRED_FIELDS) {
    if (!body[k]) {
      res.status(400).json({ error: `missing required field: ${k}` });
      return;
    }
  }
  const contact = {
    email: String(body.email).trim().toLowerCase(),
    first_name: (body.first_name || body.firstName || '').trim(),
    last_name: (body.last_name || body.lastName || '').trim(),
    phone: body.phone || body.tel || null,
    source: 'web-form',
    utm: Object.fromEntries(UTM_FIELDS.map((k) => [k, body[k] || null]).filter(([, v]) => v)),
    custom_fields: body.custom_fields || {},
    created_at: new Date().toISOString(),
  };
  try {
    const result = await dispatchToCrm(contact);
    res.status(200).json({ ok: true, contact_id: result.id, vendor: result.vendor });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}

async function dispatchToCrm(contact) {
  const vendor = (process.env.CRM_VENDOR || 'suitedash').toLowerCase();
  switch (vendor) {
    case 'suitedash':
      return await suitedashUpsert(contact);
    case 'hubspot':
      return await hubspotUpsert(contact);
    default:
      throw new Error(`unsupported CRM vendor: ${vendor}`);
  }
}

async function suitedashUpsert(contact) {
  const key = process.env.SUITEDASH_API_KEY;
  if (!key) throw new Error('SUITEDASH_API_KEY missing');
  const resp = await fetch('https://app.suitedash.com/secure-api/contacts', {
    method: 'POST',
    headers: { 'x-public-id': key.split(':')[0], 'x-secret-key': key.split(':')[1], 'content-type': 'application/json' },
    body: JSON.stringify({
      emailAddress: contact.email,
      firstName: contact.first_name,
      lastName: contact.last_name,
      phone: contact.phone,
      source: contact.source,
      customFields: contact.utm,
    }),
  });
  if (!resp.ok) throw new Error(`suitedash ${resp.status}`);
  const data = await resp.json();
  return { id: data.uid || data.id, vendor: 'suitedash' };
}

async function hubspotUpsert(contact) {
  const key = process.env.HUBSPOT_API_KEY;
  if (!key) throw new Error('HUBSPOT_API_KEY missing');
  const resp = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      properties: {
        email: contact.email,
        firstname: contact.first_name,
        lastname: contact.last_name,
        phone: contact.phone,
        hs_lead_source: contact.source,
        ...Object.fromEntries(Object.entries(contact.utm).map(([k, v]) => [k, v])),
      },
    }),
  });
  if (!resp.ok) throw new Error(`hubspot ${resp.status}`);
  const data = await resp.json();
  return { id: data.id, vendor: 'hubspot' };
}
