import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { OfferIntelligenceSchema } from './_schemas.js';

export const maxDuration = 30;

const OutlineRequest = z.object({
  operator_approved: z.literal(true),
  oie_report: OfferIntelligenceSchema.output,
});

function verifyAdminToken(req) {
  const ADMIN_KEY = process.env.ADMIN_KEY || '';
  const TEST_ADMIN_KEY = process.env.TEST_ADMIN_KEY || '';
  if (!ADMIN_KEY && !TEST_ADMIN_KEY) return false;

  const adminHeader = (req.headers['x-dynasty-admin-token'] || '').toString().trim();
  const bearer = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const token = adminHeader || bearer;
  if (!token) return false;

  try {
    const parts = token.split(':');
    if (parts.length !== 3) return false;
    const [prefix, expiry, hash] = parts;
    const tokenSecret = prefix === 'admin' ? ADMIN_KEY : (prefix === 'admin_test' ? TEST_ADMIN_KEY : '');
    if (!tokenSecret) return false;
    const payload = `${prefix}:${expiry}`;
    const expected = createHmac('sha256', tokenSecret).update(payload).digest('hex');
    if (expected.length !== hash.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) return false;
    if (Date.now() > Number.parseInt(expiry, 10)) return false;
    return true;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-dynasty-admin-token');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!verifyAdminToken(req)) return res.status(401).json({ error: 'admin_token_required' });

  const parsed = OutlineRequest.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: 'invalid_input', details: parsed.error.flatten() });

  const { oie_report: report } = parsed.data;

  if (report.build_decision !== 'BUILD') {
    return res.status(409).json({
      ok: false,
      error: 'outline_blocked',
      reason: 'OIE decision is DO_NOT_BUILD. Human approval cannot bypass this gate here.',
    });
  }

  const outline = {
    topic: report.topic,
    format: report.best_delivery_format,
    lead_magnet: report.best_lead_magnet,
    sections: [
      'Problem framing and quantified pain cost',
      'Diagnostic criteria and score thresholds',
      'Implementation steps and execution checklist',
      'Proof package requirements and validation examples',
      'Ascension CTA into audit / DFY / retainer path',
      'Risk controls and exclusions to reduce refund/liability exposure',
    ],
    recommended_price: report.recommended_price,
    generated_at: new Date().toISOString(),
    approved_from_model_version: report.model_version,
  };

  return res.status(200).json({ ok: true, outline, next_step: 'human_review_then_pdf_workflow' });
}
