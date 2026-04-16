// api/billing/catalog-sync.js — POST (admin-gated)
// -----------------------------------------------------------------------------
// Walks the product catalog (tiers, modules, packs, suites, editions, concierge)
// and creates the matching Stripe Products + Prices so /api/billing/create-
// checkout-session can resolve real price IDs at call time.
//
// Idempotent:
//   - Products are created with stable IDs (e.g. "mod_webform_autoreply").
//     retrieveProduct(id) skips re-create on second run.
//   - Prices are keyed by stable lookup_key (e.g. "module_webform_autoreply_monthly").
//     listPrices({ lookup_keys }) skips re-create on second run.
//
// Pricing math:
//   - Monthly price -> `price_monthly` from the catalog.
//   - Annual price  -> `price_monthly * 12 * (1 - annual_discount_pct/100)`,
//                       rounded to whole dollars (default 20% off = x9.6).
//   - Concierge -> one-time price at `price_onetime`.
//
// Body:
//   {
//     dry_run?: boolean,               (default false; if true, lists intended ops only)
//     scope?: "all" | "modules" | "packs" | "suites" | "editions" | "tiers" | "concierge"
//                                      (default "all")
//   }
//
// Response:
//   {
//     configured: true,                // false in stub mode
//     dry_run: boolean,
//     summary: { products_created, products_existing, prices_created, prices_existing, skipped },
//     operations: [ { sku_type, sku_code, product_id, prices: [...] } ]
//   }
//
// Guard: requires x-admin-key header matching ADMIN_KEY (or TEST_ADMIN_KEY in
// non-prod). Anyone hitting this endpoint without a key gets 401.
// -----------------------------------------------------------------------------

import { corsPreflight, methodGuard, readBody } from './_lib.mjs';
import {
  isConfigured,
  retrieveProduct,
  createProduct,
  listPrices,
  createPrice,
} from './_stripe.mjs';
import { getCatalog } from '../catalog/_lib.mjs';

export const maxDuration = 60;

// -----------------------------------------------------------------------------
// Auth
// -----------------------------------------------------------------------------

function isAuthorized(req) {
  const supplied = req.headers['x-admin-key'] || req.headers['X-Admin-Key'];
  const expected = process.env.ADMIN_KEY || process.env.TEST_ADMIN_KEY;
  if (!expected) return false;
  return supplied && supplied === expected;
}

// -----------------------------------------------------------------------------
// Pricing helpers
// -----------------------------------------------------------------------------

function dollarsToCents(d) {
  if (d == null) return null;
  return Math.round(Number(d) * 100);
}

// Apply annual discount to a monthly rate. Rounds to whole dollars so invoices
// look clean ($19/mo → $183/yr, not $182.40).
function annualFromMonthly(monthly_usd, discount_pct) {
  if (monthly_usd == null) return null;
  const gross = monthly_usd * 12;
  const discounted = gross * (1 - (discount_pct || 0) / 100);
  return Math.round(discounted);
}

// -----------------------------------------------------------------------------
// Product + price upsert primitives
// -----------------------------------------------------------------------------

async function ensureProduct({ id, name, description, metadata, dry_run }) {
  if (dry_run) return { created: false, dry_run: true, id, name };
  try {
    const existing = await retrieveProduct(id);
    return { created: false, id: existing.id, name: existing.name };
  } catch (e) {
    if (e.status === 404) {
      const p = await createProduct({ id, name, description, metadata });
      return { created: true, id: p.id, name: p.name };
    }
    throw e;
  }
}

async function ensurePrice({ product_id, lookup_key, unit_amount_usd, interval, nickname, metadata, dry_run }) {
  const unit_amount = dollarsToCents(unit_amount_usd);
  if (unit_amount == null) return { skipped: true, reason: 'no_price' };
  if (dry_run) {
    return { created: false, dry_run: true, lookup_key, unit_amount };
  }
  const existing = await listPrices({ lookup_keys: [lookup_key] });
  if (existing && Array.isArray(existing.data) && existing.data.length > 0) {
    const hit = existing.data[0];
    return { created: false, id: hit.id, lookup_key: hit.lookup_key, unit_amount: hit.unit_amount };
  }
  const recurring = interval ? { interval } : undefined;
  const p = await createPrice({
    product: product_id,
    unit_amount,
    currency: 'usd',
    recurring,
    nickname,
    metadata,
    lookup_key,
  });
  return { created: true, id: p.id, lookup_key, unit_amount };
}

// -----------------------------------------------------------------------------
// SKU walkers
// -----------------------------------------------------------------------------

function annualPct(tiers) {
  return tiers?.commercial_essentials?.annual_discount_pct || 20;
}

async function syncTiers({ catalog, summary, operations, dry_run }) {
  const { tiers } = catalog;
  if (!tiers) return;
  const pct = annualPct(tiers);
  for (const t of tiers.tiers || []) {
    if (!t.tier_code || t.price_monthly == null) continue;
    const product_id = `tier_${t.tier_code}`;
    const prod = await ensureProduct({
      id: product_id,
      name: t.name,
      description: t.description || t.positioning,
      metadata: { sku_type: 'tier', sku_code: t.tier_code },
      dry_run,
    });
    prod.created ? summary.products_created++ : summary.products_existing++;
    const prices = [];
    prices.push(await ensurePrice({
      product_id,
      lookup_key: `tier_${t.tier_code}_monthly`,
      unit_amount_usd: t.price_monthly,
      interval: 'month',
      nickname: `${t.name} (monthly)`,
      metadata: { sku_type: 'tier', sku_code: t.tier_code, billing_cycle: 'monthly' },
      dry_run,
    }));
    prices.push(await ensurePrice({
      product_id,
      lookup_key: `tier_${t.tier_code}_annual`,
      unit_amount_usd: annualFromMonthly(t.price_monthly, pct),
      interval: 'year',
      nickname: `${t.name} (annual)`,
      metadata: { sku_type: 'tier', sku_code: t.tier_code, billing_cycle: 'annual' },
      dry_run,
    }));
    tallyPrices(prices, summary);
    operations.push({ sku_type: 'tier', sku_code: t.tier_code, product_id, product: prod, prices });
  }
}

async function syncModules({ catalog, summary, operations, dry_run }) {
  const { tiers, modules } = catalog;
  const pct = annualPct(tiers);
  const monthlyDefault = tiers?.pricing_rules?.module_price_monthly || 19;
  for (const m of modules || []) {
    if (!m.module_code) continue;
    const monthly = m.price_monthly ?? monthlyDefault;
    const product_id = `mod_${m.module_code}`;
    const prod = await ensureProduct({
      id: product_id,
      name: m.name,
      description: m.description_short || m.outcome,
      metadata: { sku_type: 'module', sku_code: m.module_code, category: m.category || '' },
      dry_run,
    });
    prod.created ? summary.products_created++ : summary.products_existing++;
    const prices = [];
    prices.push(await ensurePrice({
      product_id,
      lookup_key: `module_${m.module_code}_monthly`,
      unit_amount_usd: monthly,
      interval: 'month',
      nickname: `${m.name} (monthly)`,
      metadata: { sku_type: 'module', sku_code: m.module_code, billing_cycle: 'monthly' },
      dry_run,
    }));
    prices.push(await ensurePrice({
      product_id,
      lookup_key: `module_${m.module_code}_annual`,
      unit_amount_usd: annualFromMonthly(monthly, pct),
      interval: 'year',
      nickname: `${m.name} (annual)`,
      metadata: { sku_type: 'module', sku_code: m.module_code, billing_cycle: 'annual' },
      dry_run,
    }));
    tallyPrices(prices, summary);
    operations.push({ sku_type: 'module', sku_code: m.module_code, product_id, product: prod, prices });
  }
}

async function syncPacks({ catalog, summary, operations, dry_run }) {
  const { tiers, bundles, bundle_pricing } = catalog;
  const pct = annualPct(tiers);
  const priceByCode = {};
  for (const p of bundle_pricing?.packs || []) priceByCode[p.bundle_code] = p.price_monthly;
  for (const b of bundles || []) {
    if (!b.bundle_code) continue;
    const monthly = priceByCode[b.bundle_code] ?? b.price_monthly;
    if (monthly == null) continue;
    const product_id = `pack_${b.bundle_code}`;
    const prod = await ensureProduct({
      id: product_id,
      name: b.name || b.bundle_code,
      description: b.description_short || b.outcome || b.description,
      metadata: { sku_type: 'pack', sku_code: b.bundle_code },
      dry_run,
    });
    prod.created ? summary.products_created++ : summary.products_existing++;
    const prices = [];
    prices.push(await ensurePrice({
      product_id,
      lookup_key: `pack_${b.bundle_code}_monthly`,
      unit_amount_usd: monthly,
      interval: 'month',
      nickname: `${b.name || b.bundle_code} (monthly)`,
      metadata: { sku_type: 'pack', sku_code: b.bundle_code, billing_cycle: 'monthly' },
      dry_run,
    }));
    prices.push(await ensurePrice({
      product_id,
      lookup_key: `pack_${b.bundle_code}_annual`,
      unit_amount_usd: annualFromMonthly(monthly, pct),
      interval: 'year',
      nickname: `${b.name || b.bundle_code} (annual)`,
      metadata: { sku_type: 'pack', sku_code: b.bundle_code, billing_cycle: 'annual' },
      dry_run,
    }));
    tallyPrices(prices, summary);
    operations.push({ sku_type: 'pack', sku_code: b.bundle_code, product_id, product: prod, prices });
  }
}

async function syncSuites({ catalog, summary, operations, dry_run }) {
  const { tiers } = catalog;
  if (!tiers) return;
  const pct = annualPct(tiers);
  for (const s of tiers.suites || []) {
    if (!s.suite_code || s.price_monthly == null) continue;
    const product_id = `suite_${s.suite_code}`;
    const prod = await ensureProduct({
      id: product_id,
      name: s.name,
      description: s.positioning || s.notes,
      metadata: { sku_type: 'suite', sku_code: s.suite_code },
      dry_run,
    });
    prod.created ? summary.products_created++ : summary.products_existing++;
    const prices = [];
    prices.push(await ensurePrice({
      product_id,
      lookup_key: `suite_${s.suite_code}_monthly`,
      unit_amount_usd: s.price_monthly,
      interval: 'month',
      nickname: `${s.name} (monthly)`,
      metadata: { sku_type: 'suite', sku_code: s.suite_code, billing_cycle: 'monthly' },
      dry_run,
    }));
    prices.push(await ensurePrice({
      product_id,
      lookup_key: `suite_${s.suite_code}_annual`,
      unit_amount_usd: annualFromMonthly(s.price_monthly, pct),
      interval: 'year',
      nickname: `${s.name} (annual)`,
      metadata: { sku_type: 'suite', sku_code: s.suite_code, billing_cycle: 'annual' },
      dry_run,
    }));
    tallyPrices(prices, summary);
    operations.push({ sku_type: 'suite', sku_code: s.suite_code, product_id, product: prod, prices });
  }
}

async function syncEditions({ catalog, summary, operations, dry_run }) {
  const { tiers } = catalog;
  if (!tiers) return;
  const pct = annualPct(tiers);
  for (const e of tiers.editions || []) {
    // Enterprise is "Talk to sales" — no price, no Stripe product needed.
    if (!e.edition_code || e.price_monthly == null) {
      summary.skipped.push({ sku_type: 'edition', sku_code: e.edition_code, reason: 'no_price' });
      continue;
    }
    const product_id = `edition_${e.edition_code}`;
    const prod = await ensureProduct({
      id: product_id,
      name: e.name,
      description: e.positioning,
      metadata: { sku_type: 'edition', sku_code: e.edition_code, for: e.for || '' },
      dry_run,
    });
    prod.created ? summary.products_created++ : summary.products_existing++;
    const prices = [];
    prices.push(await ensurePrice({
      product_id,
      lookup_key: `edition_${e.edition_code}_monthly`,
      unit_amount_usd: e.price_monthly,
      interval: 'month',
      nickname: `${e.name} (monthly)`,
      metadata: { sku_type: 'edition', sku_code: e.edition_code, billing_cycle: 'monthly' },
      dry_run,
    }));
    prices.push(await ensurePrice({
      product_id,
      lookup_key: `edition_${e.edition_code}_annual`,
      unit_amount_usd: annualFromMonthly(e.price_monthly, pct),
      interval: 'year',
      nickname: `${e.name} (annual)`,
      metadata: { sku_type: 'edition', sku_code: e.edition_code, billing_cycle: 'annual' },
      dry_run,
    }));
    tallyPrices(prices, summary);
    operations.push({ sku_type: 'edition', sku_code: e.edition_code, product_id, product: prod, prices });
  }
}

async function syncConcierge({ catalog, summary, operations, dry_run }) {
  const { tiers } = catalog;
  if (!tiers?.concierge_setup) return;
  for (const [code, cfg] of Object.entries(tiers.concierge_setup)) {
    if (cfg.price_onetime == null) continue;
    const product_id = `concierge_${code}`;
    const prod = await ensureProduct({
      id: product_id,
      name: `Concierge Setup (${code})`,
      description: cfg.description,
      metadata: { sku_type: 'concierge', sku_code: code, delivery_mode: cfg.delivery_mode || '' },
      dry_run,
    });
    prod.created ? summary.products_created++ : summary.products_existing++;
    const prices = [];
    prices.push(await ensurePrice({
      product_id,
      lookup_key: `concierge_${code}_onetime`,
      unit_amount_usd: cfg.price_onetime,
      interval: null, // one-time
      nickname: `Concierge Setup (${code})`,
      metadata: { sku_type: 'concierge', sku_code: code, billing_cycle: 'onetime' },
      dry_run,
    }));
    tallyPrices(prices, summary);
    operations.push({ sku_type: 'concierge', sku_code: code, product_id, product: prod, prices });
  }
}

function tallyPrices(prices, summary) {
  for (const p of prices || []) {
    if (p?.skipped) continue;
    if (p?.created) summary.prices_created++;
    else summary.prices_existing++;
  }
}

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;

  if (!isAuthorized(req)) return res.status(401).json({ error: 'admin_key_required' });

  let body = {};
  try { body = await readBody(req); } catch (_) { body = {}; }
  const dry_run = !!body.dry_run;
  const scope = body.scope || 'all';

  const catalog = getCatalog();
  const summary = {
    products_created: 0,
    products_existing: 0,
    prices_created: 0,
    prices_existing: 0,
    skipped: [],
  };
  const operations = [];

  try {
    if (scope === 'all' || scope === 'tiers') await syncTiers({ catalog, summary, operations, dry_run });
    if (scope === 'all' || scope === 'modules') await syncModules({ catalog, summary, operations, dry_run });
    if (scope === 'all' || scope === 'packs') await syncPacks({ catalog, summary, operations, dry_run });
    if (scope === 'all' || scope === 'suites') await syncSuites({ catalog, summary, operations, dry_run });
    if (scope === 'all' || scope === 'editions') await syncEditions({ catalog, summary, operations, dry_run });
    if (scope === 'all' || scope === 'concierge') await syncConcierge({ catalog, summary, operations, dry_run });
  } catch (e) {
    return res.status(500).json({
      error: 'stripe_sync_failed',
      message: e.message,
      partial_summary: summary,
      partial_operations: operations,
    });
  }

  return res.status(200).json({
    configured: isConfigured(),
    dry_run,
    scope,
    summary,
    operations,
  });
}
