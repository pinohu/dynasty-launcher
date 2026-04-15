// api/billing/create-checkout-session.js — POST
// -----------------------------------------------------------------------------
// Creates a Stripe Checkout session for a tenant to purchase a subscription
// item (module / pack / suite / edition / core tier) or one-time concierge.
//
// Body:
//   {
//     tenant_id: string,           (required)
//     items: [                     (required, non-empty)
//       { sku_type: "module" | "pack" | "suite" | "edition" | "concierge",
//         sku_code: string,
//         quantity?: number }
//     ],
//     billing_cycle?: "monthly" | "annual"  (default monthly),
//     success_url?: string,
//     cancel_url?: string
//   }
//
// Response:
//   { session: { id, url, stub? }, line_items }
//
// Stripe product/price IDs are not yet provisioned; this endpoint therefore
// runs in STUB mode and returns a fake session URL when stripe_live is
// unconfigured. Wire Stripe by:
//   1. set STRIPE_SECRET_KEY (or DYNASTY_TOOL_CONFIG.payments.stripe_live)
//   2. run /api/billing/catalog-sync (not yet built) to create Products+Prices
//   3. this endpoint auto-flips to live mode
// -----------------------------------------------------------------------------

import { corsPreflight, methodGuard, readBody } from './_lib.mjs';
import { createCheckoutSession, isConfigured } from './_stripe.mjs';
import { getTenant } from '../tenants/_store.mjs';
import { getCatalog } from '../catalog/_lib.mjs';

export const maxDuration = 30;

function resolvePrice(sku_type, sku_code, billing_cycle) {
  // In stub mode we return synthetic price IDs. Once catalog-sync runs, the
  // Stripe price IDs will live in product/pricing/ or a mapping file.
  const suffix = billing_cycle === 'annual' ? '_annual' : '_monthly';
  return `price_${sku_type}_${sku_code}${suffix}`;
}

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;

  let body;
  try { body = await readBody(req); } catch (e) {
    return res.status(400).json({ error: 'invalid_json' });
  }

  const { tenant_id, items, billing_cycle, success_url, cancel_url } = body || {};
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items[] required' });

  const tenant = await getTenant(tenant_id);
  if (!tenant) return res.status(404).json({ error: 'tenant_not_found' });

  // Validate sku_codes exist in the catalog
  const { modules, bundles, tiers } = getCatalog();
  const moduleCodes = new Set(modules.map((m) => m.module_code));
  const bundleCodes = new Set(bundles.map((b) => b.bundle_code));
  const editionCodes = new Set((tiers.editions || []).map((e) => e.edition_code));
  const suiteCodes = new Set((tiers.suites || []).map((s) => s.suite_code));
  const tierCodes = new Set((tiers.tiers || []).map((t) => t.tier_code));

  const line_items = [];
  for (const item of items) {
    const { sku_type, sku_code } = item;
    let ok = false;
    switch (sku_type) {
      case 'module': ok = moduleCodes.has(sku_code); break;
      case 'pack': ok = bundleCodes.has(sku_code); break;
      case 'suite': ok = suiteCodes.has(sku_code); break;
      case 'edition': ok = editionCodes.has(sku_code); break;
      case 'tier': ok = tierCodes.has(sku_code); break;
      case 'concierge': ok = ['starter', 'guided', 'premium'].includes(sku_code); break;
      default: ok = false;
    }
    if (!ok) return res.status(400).json({ error: `unknown ${sku_type} '${sku_code}'` });

    line_items.push({
      price: resolvePrice(sku_type, sku_code, billing_cycle),
      quantity: item.quantity || 1,
    });
  }

  const mode = items.every((i) => i.sku_type === 'concierge') ? 'payment' : 'subscription';

  try {
    const session = await createCheckoutSession({
      tenant_id,
      line_items,
      mode,
      billing_cycle: billing_cycle || 'monthly',
      success_url: success_url || 'https://yourdeputy.com/dashboard?checkout=success',
      cancel_url: cancel_url || 'https://yourdeputy.com/dashboard?checkout=cancel',
      metadata: {
        billing_cycle: billing_cycle || 'monthly',
        sku_types: items.map((i) => i.sku_type).join(','),
        sku_codes: items.map((i) => i.sku_code).join(','),
      },
    });
    return res.status(200).json({
      session: { id: session.id, url: session.url, stub: session.stub || false },
      line_items,
      stripe_configured: isConfigured(),
    });
  } catch (e) {
    return res.status(500).json({ error: 'stripe_error', message: e.message });
  }
}
