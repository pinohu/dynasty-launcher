// api/billing/create-checkout-session.js — POST
// -----------------------------------------------------------------------------
// Creates a Stripe Checkout session for a tenant to purchase a subscription
// item (module / pack / suite / edition / core tier) or one-time concierge.
//
// Body:
//   {
//     tenant_id: string,           (required)
//     items: [                     (required, non-empty)
//       { sku_type: "module" | "pack" | "suite" | "edition" | "tier" | "concierge",
//         sku_code: string,
//         quantity?: number }
//     ],
//     billing_cycle?: "monthly" | "annual"  (default monthly; concierge is always onetime),
//     success_url?: string,
//     cancel_url?: string
//   }
//
// Response:
//   { session: { id, url, stub? }, line_items, lookup_keys }
//
// Stripe lifecycle:
//   - In stub mode (no STRIPE_SECRET_KEY / DYNASTY_TOOL_CONFIG.payments.stripe_live)
//     the endpoint returns a fake session URL; the stub Stripe wrapper echoes
//     back synthetic price IDs built from the lookup_keys.
//   - In live mode:
//       1. We compute the lookup_key for each line (e.g. "module_webform_autoreply_monthly")
//       2. Call Stripe /prices?lookup_keys[]=... to resolve → real price ID
//       3. Pass those real IDs into Checkout
//     Lookup keys are created by /api/billing/catalog-sync. If a key doesn't
//     resolve, we return 409 with a pointer to run the sync.
// -----------------------------------------------------------------------------

import { corsPreflight, methodGuard, readBody } from './_lib.mjs';
import { createCheckoutSession, isConfigured, listPrices } from './_stripe.mjs';
import { getTenant } from '../tenants/_store.mjs';
import { getCatalog } from '../catalog/_lib.mjs';

export const maxDuration = 30;

function buildLookupKey(sku_type, sku_code, billing_cycle) {
  if (sku_type === 'concierge') return `concierge_${sku_code}_onetime`;
  const cycle = billing_cycle === 'annual' ? 'annual' : 'monthly';
  return `${sku_type}_${sku_code}_${cycle}`;
}

async function resolvePriceId(lookup_key) {
  // In stub mode _stripe.mjs returns { stub: true, data: [] }; we map to a
  // synthetic ID to keep smoke tests working.
  if (!isConfigured()) return `price_stub_${lookup_key}`;
  const result = await listPrices({ lookup_keys: [lookup_key] });
  const hit = (result?.data || [])[0];
  if (!hit) {
    const err = new Error(`price not found for lookup_key '${lookup_key}' — run /api/billing/catalog-sync`);
    err.code = 'lookup_key_not_found';
    err.lookup_key = lookup_key;
    throw err;
  }
  return hit.id;
}

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;

  let body;
  try { body = await readBody(req, { maxBytes: 64_000 }); } catch (e) {
    return res.status(e.code === 'payload_too_large' ? 413 : 400).json({
      error: e.code === 'payload_too_large' ? 'payload_too_large' : 'invalid_json',
    });
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
  const lookup_keys = [];
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

    const lookup_key = buildLookupKey(sku_type, sku_code, billing_cycle);
    try {
      const price_id = await resolvePriceId(lookup_key);
      line_items.push({ price: price_id, quantity: item.quantity || 1 });
      lookup_keys.push(lookup_key);
    } catch (e) {
      if (e.code === 'lookup_key_not_found') {
        return res.status(409).json({
          error: 'price_not_synced',
          lookup_key: e.lookup_key,
          hint: 'POST /api/billing/catalog-sync (admin) to create Stripe products + prices',
        });
      }
      return res.status(500).json({ error: 'stripe_lookup_failed', message: e.message });
    }
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
      lookup_keys,
      stripe_configured: isConfigured(),
    });
  } catch (e) {
    return res.status(500).json({ error: 'stripe_error', message: e.message });
  }
}
