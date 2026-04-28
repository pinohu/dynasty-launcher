import { buildProvisionedDeliverable, buildProvisioningSchema } from './_provisioner.mjs';
import { listInstantOffers } from './_instant.mjs';

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

function baseUrl(req) {
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'www.yourdeputy.com';
  const proto = req.headers?.['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
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
  const offerId = req.query?.offer || req.query?.id || body.offer || body.offer_id || '';

  if (!offerId || req.query?.list === '1') {
    return res.status(200).json({
      ok: true,
      provisioning: true,
      count: listInstantOffers().length,
      offers: listInstantOffers(),
    });
  }

  if (req.method === 'GET') {
    const schema = buildProvisioningSchema(offerId);
    if (!schema) {
      return res.status(404).json({
        ok: false,
        error: 'unknown_deliverable_offer',
        available_offers: listInstantOffers().map((offer) => offer.id),
      });
    }
    return res.status(200).json(schema);
  }

  const result = buildProvisionedDeliverable(offerId, body, baseUrl(req));
  return res.status(result.status || 200).json(result);
}
