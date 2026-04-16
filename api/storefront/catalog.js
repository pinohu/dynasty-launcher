// api/storefront/catalog.js — Client-facing storefront catalog API
// =============================================================================
// Multi-action endpoint for browsing, purchasing, and managing entitlements.
//
// Actions:
//   - browse: Full catalog organized by category with per-tenant status
//   - my-automations: Active modules for this tenant
//   - purchase-pack: Buy a full bundle
//   - purchase-module: Buy a single module
//   - deactivate: Deactivate a module
//   - billing-summary: Current subscriptions and billing status
//
// Requires DATABASE_URL for production; falls back to in-memory in dev.
// Stripe integration optional (via STRIPE_SECRET_KEY env var).
// =============================================================================

import { corsPreflight, methodGuard, readBody } from '../tenants/_lib.mjs';
import { getCatalog } from '../catalog/_lib.mjs';
import {
  getTenant,
  listTenantEntitlements,
  upsertEntitlement,
  getEntitlement,
} from '../tenants/_store.mjs';
import pg from 'pg';

const { Pool } = pg;

export const maxDuration = 30;

// =============================================================================
// Database Pool (Postgres)
// =============================================================================

let _pool = null;

function pool() {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null; // In-memory mode
  _pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
  return _pool;
}

// =============================================================================
// Stripe Integration (optional)
// =============================================================================

let _stripe = null;
let _stripeLoaded = false;

async function stripe() {
  if (_stripeLoaded) return _stripe;
  _stripeLoaded = true;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('STUB-')) return null; // Dev mode
  try {
    const Stripe = (await import('stripe')).default;
    _stripe = new Stripe(key);
  } catch (e) {
    console.error('[storefront] Stripe import failed:', e.message);
    _stripe = null;
  }
  return _stripe;
}

// =============================================================================
// ID Generation
// =============================================================================

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// =============================================================================
// Catalog Helpers
// =============================================================================

function getModulePrice(catalog, moduleCode) {
  const pricing = catalog.module_pricing || {};
  if (pricing.overrides && pricing.overrides[moduleCode]) {
    return pricing.overrides[moduleCode];
  }
  return pricing.default_price_monthly || 19;
}

function getBundleByCode(catalog, bundleCode) {
  return (catalog.bundles || []).find((b) => b.bundle_code === bundleCode);
}

function getModuleByCode(catalog, moduleCode) {
  return (catalog.modules || []).find((m) => m.module_code === moduleCode);
}

// Build module item with tenant-specific status
function buildModuleItem(catalog, module, tenantEntitlements, tenantId) {
  if (!module) return null;
  const entitlement = tenantEntitlements.find((e) => e.module_code === module.module_code);
  return {
    code: module.module_code,
    name: module.name,
    description: module.description_short || module.description || '',
    outcome: module.outcome || '',
    category: module.category || 'general',
    price_monthly: getModulePrice(catalog, module.module_code),
    status: entitlement?.state || 'dormant', // dormant, entitled, active, paused, revoked
    activated_at: entitlement?.activated_at || null,
    deactivated_at: entitlement?.deactivated_at || null,
  };
}

// Build bundle item with modules and status
function buildBundleItem(catalog, bundle, tenantEntitlements) {
  if (!bundle) return null;
  const modules = (bundle.modules || [])
    .map((code) => getModuleByCode(catalog, code))
    .filter(Boolean);
  const moduleStatuses = modules.map((m) => {
    const ent = tenantEntitlements.find((e) => e.module_code === m.module_code);
    return ent?.state || 'dormant';
  });
  // Pack status: active if all modules active, entitled if any entitled, dormant otherwise
  let status = 'dormant';
  if (moduleStatuses.some((s) => s === 'active')) status = 'active';
  else if (moduleStatuses.some((s) => s === 'entitled')) status = 'entitled';

  return {
    code: bundle.bundle_code,
    name: bundle.name,
    tagline: bundle.tagline || '',
    description: bundle.description || '',
    outcome: bundle.outcome || '',
    price_monthly: bundle.price_monthly || 49,
    modules: modules.map((m) => ({
      code: m.module_code,
      name: m.name,
    })),
    status,
  };
}

// Organize catalog by category
function buildBrowseResponse(catalog, tenantEntitlements) {
  const modules = (catalog.modules || []).map((m) =>
    buildModuleItem(catalog, m, tenantEntitlements)
  ).filter(Boolean);

  const bundles = (catalog.bundles || []).map((b) =>
    buildBundleItem(catalog, b, tenantEntitlements)
  ).filter(Boolean);

  // Group modules by category
  const byCategory = {};
  modules.forEach((m) => {
    if (!byCategory[m.category]) byCategory[m.category] = [];
    byCategory[m.category].push(m);
  });

  return {
    schema_version: '1.0.0',
    catalog: {
      bundles,
      modules_by_category: byCategory,
      all_modules: modules,
    },
  };
}

// =============================================================================
// Action: browse
// =============================================================================

async function actionBrowse(req, res) {
  const tenantId = req.query?.tenant_id;
  if (!tenantId) {
    return res.status(400).json({ error: 'tenant_id required' });
  }

  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return res.status(404).json({ error: `tenant '${tenantId}' not found` });
  }

  const catalog = getCatalog();
  const entitlements = await listTenantEntitlements(tenantId);
  const browseData = buildBrowseResponse(catalog, entitlements || []);

  return res.json({
    ok: true,
    tenant_id: tenantId,
    ...browseData,
  });
}

// =============================================================================
// Action: my-automations
// =============================================================================

async function actionMyAutomations(req, res) {
  const tenantId = req.query?.tenant_id;
  if (!tenantId) {
    return res.status(400).json({ error: 'tenant_id required' });
  }

  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return res.status(404).json({ error: `tenant '${tenantId}' not found` });
  }

  const catalog = getCatalog();
  const entitlements = await listTenantEntitlements(tenantId);

  // Only return active entitlements
  const active = (entitlements || []).filter((e) => e.state === 'active');

  // Group by bundle
  const bundleCode = (bundle) => {
    const b = (catalog.bundles || []).find((bd) => bd.modules?.includes(bundle.module_code));
    return b?.bundle_code || null;
  };

  const byBundle = {};
  const standalone = [];

  active.forEach((ent) => {
    const bc = bundleCode(ent);
    const module = getModuleByCode(catalog, ent.module_code);
    if (!module) return;

    const item = buildModuleItem(catalog, module, [ent], tenantId);
    if (bc) {
      if (!byBundle[bc]) byBundle[bc] = [];
      byBundle[bc].push(item);
    } else {
      standalone.push(item);
    }
  });

  return res.json({
    ok: true,
    tenant_id: tenantId,
    automations: {
      by_bundle: byBundle,
      standalone,
      total_active: active.length,
    },
  });
}

// =============================================================================
// Action: purchase-pack
// =============================================================================

async function actionPurchasePack(req, res) {
  const body = await readBody(req);
  const { tenant_id, bundle_code, payment_method_id } = body;

  if (!tenant_id || !bundle_code) {
    return res.status(400).json({ error: 'tenant_id and bundle_code required' });
  }

  const tenant = await getTenant(tenant_id);
  if (!tenant) {
    return res.status(404).json({ error: `tenant '${tenant_id}' not found` });
  }

  const catalog = getCatalog();
  const bundle = getBundleByCode(catalog, bundle_code);
  if (!bundle) {
    return res.status(404).json({ error: `bundle '${bundle_code}' not found` });
  }

  const moduleCodes = bundle.modules || [];
  const price = bundle.price_monthly || 49;

  // Handle Stripe billing if configured
  let stripeSubscriptionId = null;
  const stripeClient = await stripe();
  if (stripeClient && tenant.stripe_customer_id && payment_method_id) {
    try {
      const sub = await stripeClient.subscriptions.create({
        customer: tenant.stripe_customer_id,
        items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: bundle.name,
                metadata: { bundle_code },
              },
              recurring: { interval: 'month' },
              unit_amount: Math.round(price * 100),
            },
          },
        ],
        default_payment_method: payment_method_id,
        expand: ['latest_invoice.payment_intent'],
      });
      stripeSubscriptionId = sub.id;
    } catch (err) {
      console.error('[storefront] Stripe subscription creation failed:', err.message);
      // Continue without billing; just activate
    }
  }

  // Activate all modules in the pack
  const activated = [];
  for (const moduleCode of moduleCodes) {
    const existing = await getEntitlement(tenant_id, moduleCode);
    const update = {
      state: 'active',
      activated_at: new Date().toISOString(),
      billing_source: {
        source_type: 'bundle',
        bundle_code,
        stripe_subscription_id: stripeSubscriptionId || undefined,
      },
    };
    await upsertEntitlement(tenant_id, moduleCode, update);
    activated.push(moduleCode);
  }

  return res.json({
    ok: true,
    tenant_id,
    bundle_code,
    modules_activated: activated,
    billing: {
      amount: price,
      interval: 'month',
      stripe_subscription_id: stripeSubscriptionId || null,
    },
  });
}

// =============================================================================
// Action: purchase-module
// =============================================================================

async function actionPurchaseModule(req, res) {
  const body = await readBody(req);
  const { tenant_id, module_code, payment_method_id } = body;

  if (!tenant_id || !module_code) {
    return res.status(400).json({ error: 'tenant_id and module_code required' });
  }

  const tenant = await getTenant(tenant_id);
  if (!tenant) {
    return res.status(404).json({ error: `tenant '${tenant_id}' not found` });
  }

  const catalog = getCatalog();
  const module = getModuleByCode(catalog, module_code);
  if (!module) {
    return res.status(404).json({ error: `module '${module_code}' not found` });
  }

  const price = getModulePrice(catalog, module_code);

  // Handle Stripe billing if configured
  let stripeSubscriptionId = null;
  const stripeClient = await stripe();
  if (stripeClient && tenant.stripe_customer_id && payment_method_id) {
    try {
      const sub = await stripeClient.subscriptions.create({
        customer: tenant.stripe_customer_id,
        items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: module.name,
                metadata: { module_code },
              },
              recurring: { interval: 'month' },
              unit_amount: Math.round(price * 100),
            },
          },
        ],
        default_payment_method: payment_method_id,
        expand: ['latest_invoice.payment_intent'],
      });
      stripeSubscriptionId = sub.id;
    } catch (err) {
      console.error('[storefront] Stripe subscription creation failed:', err.message);
    }
  }

  // Activate module
  const update = {
    state: 'active',
    activated_at: new Date().toISOString(),
    billing_source: {
      source_type: 'module',
      stripe_subscription_id: stripeSubscriptionId || undefined,
    },
  };
  await upsertEntitlement(tenant_id, module_code, update);

  return res.json({
    ok: true,
    tenant_id,
    module_code,
    status: 'active',
    billing: {
      amount: price,
      interval: 'month',
      stripe_subscription_id: stripeSubscriptionId || null,
    },
  });
}

// =============================================================================
// Action: deactivate
// =============================================================================

async function actionDeactivate(req, res) {
  const body = await readBody(req);
  const { tenant_id, module_code } = body;

  if (!tenant_id || !module_code) {
    return res.status(400).json({ error: 'tenant_id and module_code required' });
  }

  const tenant = await getTenant(tenant_id);
  if (!tenant) {
    return res.status(404).json({ error: `tenant '${tenant_id}' not found` });
  }

  const entitlement = await getEntitlement(tenant_id, module_code);
  if (!entitlement) {
    return res.status(404).json({ error: `entitlement not found for ${module_code}` });
  }

  // Cancel Stripe subscription if applicable
  const stripeClient = stripe();
  if (stripeClient && entitlement.billing_source?.stripe_subscription_id) {
    try {
      await stripeClient.subscriptions.del(entitlement.billing_source.stripe_subscription_id);
    } catch (err) {
      console.error('[storefront] Stripe subscription cancellation failed:', err.message);
    }
  }

  // Deactivate module
  const update = {
    state: 'paused', // Paused allows re-activation later
    deactivated_at: new Date().toISOString(),
    billing_source: {
      ...entitlement.billing_source,
      cancelled_at: new Date().toISOString(),
    },
  };
  await upsertEntitlement(tenant_id, module_code, update);

  return res.json({
    ok: true,
    tenant_id,
    module_code,
    status: 'paused',
  });
}

// =============================================================================
// Action: billing-summary
// =============================================================================

async function actionBillingSummary(req, res) {
  const tenantId = req.query?.tenant_id;
  if (!tenantId) {
    return res.status(400).json({ error: 'tenant_id required' });
  }

  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return res.status(404).json({ error: `tenant '${tenantId}' not found` });
  }

  const catalog = getCatalog();
  const entitlements = await listTenantEntitlements(tenantId);

  // Filter to active subscriptions only
  const active = (entitlements || []).filter((e) => e.state === 'active');

  // Calculate monthly total
  let monthlyTotal = 0;
  const subscriptions = [];

  active.forEach((ent) => {
    const price = getModulePrice(catalog, ent.module_code);
    const module = getModuleByCode(catalog, ent.module_code);

    monthlyTotal += price;
    subscriptions.push({
      module_code: ent.module_code,
      module_name: module?.name || ent.module_code,
      price_monthly: price,
      activated_at: ent.activated_at,
      source: ent.billing_source?.source_type || 'unknown',
      stripe_subscription_id: ent.billing_source?.stripe_subscription_id || null,
    });
  });

  // Estimate next billing date (start of next month)
  const now = new Date();
  const nextBilling = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return res.json({
    ok: true,
    tenant_id: tenantId,
    billing: {
      monthly_total: monthlyTotal,
      subscription_count: subscriptions.length,
      subscriptions,
      next_billing_date: nextBilling.toISOString().split('T')[0],
      estimated_annual: monthlyTotal * 12,
    },
  });
}

// =============================================================================
// Main Handler
// =============================================================================

export default async function handler(req, res) {
  // CORS preflight
  if (corsPreflight(req, res)) return;

  // Route by action
  const action = req.query?.action;

  if (!action) {
    return res.status(400).json({ error: 'action query param required' });
  }

  try {
    switch (action) {
      case 'browse':
        if (!methodGuard(req, res, ['GET'])) return;
        return await actionBrowse(req, res);

      case 'my-automations':
        if (!methodGuard(req, res, ['GET'])) return;
        return await actionMyAutomations(req, res);

      case 'purchase-pack':
        if (!methodGuard(req, res, ['POST'])) return;
        return await actionPurchasePack(req, res);

      case 'purchase-module':
        if (!methodGuard(req, res, ['POST'])) return;
        return await actionPurchaseModule(req, res);

      case 'deactivate':
        if (!methodGuard(req, res, ['POST'])) return;
        return await actionDeactivate(req, res);

      case 'billing-summary':
        if (!methodGuard(req, res, ['GET'])) return;
        return await actionBillingSummary(req, res);

      default:
        return res.status(400).json({ error: `unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`[storefront] action=${action} failed:`, err.message);
    return res.status(500).json({
      error: 'internal_server_error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}
