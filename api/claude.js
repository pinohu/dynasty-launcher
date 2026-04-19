// DEPRECATED — Anthropic Claude routing removed as part of the zero-paid-model
// migration. This endpoint returns 410 Gone so callers fail fast instead of
// silently charging money. Use /api/ai (free-only router) for all generation.
export const maxDuration = 10;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  return res.status(410).json({
    error: 'Claude proxy disabled',
    detail: 'Anthropic routing was removed to guarantee zero inference cost. Use /api/ai for all generation — free-model router.',
  });
}
