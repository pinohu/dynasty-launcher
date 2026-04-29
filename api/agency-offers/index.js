import { agencyOfferCategories, getAgencyOffer, listAgencyOffers } from './_catalog.mjs';

export const maxDuration = 10;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://www.yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });

  const offerId = req.query?.offer || req.query?.id || '';
  if (offerId) {
    const offer = getAgencyOffer(offerId);
    if (!offer) {
      return res.status(404).json({
        ok: false,
        error: 'unknown_agency_offer',
        available_offers: listAgencyOffers().map((item) => item.id),
      });
    }
    return res.status(200).json({ ok: true, offer });
  }

  const offers = listAgencyOffers();
  return res.status(200).json({
    ok: true,
    count: offers.length,
    categories: agencyOfferCategories,
    offers,
  });
}
