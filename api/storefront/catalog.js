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
import { activateModule } from '../tenants/_activation.mjs';
import { requireTenantAccess, realSecret } from '../tenants/_auth.mjs';
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
// Tenant/Auth + Stripe helpers
// =============================================================================

function stripeSecret() {
  return realSecret(process.env.STRIPE_SECRET_KEY);
}

function stripeConfigured() {
  return !!stripeSecret();
}


function formEncode(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v == null) continue;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        const itemKey = `${key}[${i}]`;
        if (typeof item === 'object') out.push(formEncode(item, itemKey));
        else out.push(`${encodeURIComponent(itemKey)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === 'object') {
      out.push(formEncode(v, key));
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out.join('&');
}

async function stripeCall(path, opts = {}) {
  const key = stripeSecret();
  if (!key) throw new Error('stripe_secret_missing');
  const resp = await fetch(`https://api.stripe.com/v1${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: opts.body ? formEncode(opts.body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.error?.message || `stripe ${resp.status}`);
    err.status = resp.status;
    err.code = data.error?.code;
    err.type = data.error?.type;
    throw err;
  }
  return data;
}

function stripeCustomerId(tenant) {
  return tenant.stripe_customer_id
    || tenant.billing?.stripe_customer_id
    || tenant.profile?.stripe_customer_id
    || null;
}

function subscriptionPaymentConfirmed(subscription) {
  const status = subscription?.status;
  const invoice = subscription?.latest_invoice;
  const paymentIntent = invoice?.payment_intent;
  return status === 'active'
    || status === 'trialing'
    || invoice?.status === 'paid'
    || paymentIntent?.status === 'succeeded';
}

async function createPaidSubscription({ tenant, paymentMethodId, name, amount, metadata }) {
  if (!stripeConfigured()) {
    return { ok: true, stripe_subscription_id: null, payment_status: 'stub' };
  }

  const customer = stripeCustomerId(tenant);
  if (!customer) {
    return { ok: false, status: 402, error: 'stripe_customer_required' };
  }
  if (!paymentMethodId) {
    return { ok: false, status: 402, error: 'payment_method_required' };
  }

  let subscription = null;
  try {
    subscription = await stripeCall('/subscriptions', {
      method: 'POST',
      body: {
        customer,
        payment_behavior: 'error_if_incomplete',
        default_payment_method: paymentMethodId,
        expand: ['latest_invoice.payment_intent'],
        metadata,
        items: [{
          price_data: {
            currency: 'usd',
            product_data: { name, metadata },
            recurring: { interval: 'month' },
            unit_amount: Math.round(amount * 100),
          },
        }],
      },
    });
  } catch (err) {
    console.error('[storefront] Stripe subscription creation failed:', err.message);
    return {
      ok: false,
      status: err.status === 402 ? 402 : 502,
      error: 'stripe_subscription_failed',
      message: err.message,
    };
  }

  if (!subscriptionPaymentConfirmed(subscription)) {
    if (subscription?.id) {
      try { await stripeCall(`/subscriptions/${encodeURIComponent(subscription.id)}`, { method: 'DELETE' }); } catch (_) { /* best effort */ }
    }
    return { ok: false, status: 402, error: 'payment_not_confirmed' };
  }

  return {
    ok: true,
    stripe_subscription_id: subscription.id,
    payment_status: subscription.status || subscription.latest_invoice?.payment_intent?.status || 'confirmed',
  };
}

async function cancelPaidSubscription(stripeSubscriptionId) {
  if (!stripeSubscriptionId || !stripeConfigured()) return { ok: true, skipped: true };
  try {
    await stripeCall(`/subscriptions/${encodeURIComponent(stripeSubscriptionId)}`, { method: 'DELETE' });
    return { ok: true };
  } catch (err) {
    console.error('[storefront] Stripe subscription cancellation failed:', err.message);
    return { ok: false, error: 'stripe_cancellation_failed', message: err.message };
  }
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

function moduleAllowedForTenant(module, tenant) {
  const allowed = module?.tier_availability || [];
  return allowed.length === 0 || allowed.includes(tenant.plan) || tenant.plan === 'enterprise';
}

async function entitleAndActivateModule({ tenant_id, module_code, billing_source }) {
  await upsertEntitlement(tenant_id, module_code, {
    state: 'entitled',
    billing_source,
  });
  const activation = await activateModule({ tenant_id, module_code, user_input: {} });
  return {
    module_code,
    status: activation.status === 'ok' || activation.status === 'idempotent_ok'
      ? 'active'
      : activation.status,
    reason: activation.reason || null,
    missing_capabilities: activation.missing_capabilities || [],
  };
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
  if (!requireTenantAccess(req, res, tenant)) return;

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
  if (!requireTenantAccess(req, res, tenant)) return;

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
  if (!requireTenantAccess(req, res, tenant)) return;

  const catalog = getCatalog();
  const bundle = getBundleByCode(catalog, bundle_code);
  if (!bundle) {
    return res.status(404).json({ error: `bundle '${bundle_code}' not found` });
  }

  const moduleCodes = bundle.modules || [];
  const unavailable = moduleCodes
    .map((moduleCode) => getModuleByCode(catalog, moduleCode))
    .filter((module) => !module || !moduleAllowedForTenant(module, tenant))
    .map((module) => module?.module_code || 'unknown');
  if (unavailable.length) {
    return res.status(403).json({ error: 'module_not_available_for_tenant', modules: unavailable });
  }
  const price = bundle.price_monthly || 49;

  const billing = await createPaidSubscription({
    tenant,
    paymentMethodId: payment_method_id,
    name: bundle.name,
    amount: price,
    metadata: { tenant_id, bundle_code, sku_type: 'bundle' },
  });
  if (!billing.ok) {
    return res.status(billing.status || 402).json({
      error: billing.error,
      message: process.env.NODE_ENV === 'development' ? billing.message : undefined,
    });
  }

  const results = [];
  for (const moduleCode of moduleCodes) {
    const result = await entitleAndActivateModule({
      tenant_id,
      module_code: moduleCode,
      billing_source: {
        source_type: 'bundle',
        bundle_code,
        stripe_subscription_id: billing.stripe_subscription_id || undefined,
        payment_status: billing.payment_status,
      },
    });
    results.push(result);
  }

  return res.json({
    ok: true,
    tenant_id,
    bundle_code,
    modules_activated: results.filter((r) => r.status === 'active').map((r) => r.module_code),
    modules: results,
    billing: {
      amount: price,
      interval: 'month',
      stripe_subscription_id: billing.stripe_subscription_id || null,
      payment_status: billing.payment_status,
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
  if (!requireTenantAccess(req, res, tenant)) return;

  const catalog = getCatalog();
  const module = getModuleByCode(catalog, module_code);
  if (!module) {
    return res.status(404).json({ error: `module '${module_code}' not found` });
  }
  if (!moduleAllowedForTenant(module, tenant)) {
    return res.status(403).json({ error: 'module_not_available_for_tenant', module_code });
  }

  const price = getModulePrice(catalog, module_code);

  const billing = await createPaidSubscription({
    tenant,
    paymentMethodId: payment_method_id,
    name: module.name,
    amount: price,
    metadata: { tenant_id, module_code, sku_type: 'module' },
  });
  if (!billing.ok) {
    return res.status(billing.status || 402).json({
      error: billing.error,
      message: process.env.NODE_ENV === 'development' ? billing.message : undefined,
    });
  }

  const activation = await entitleAndActivateModule({
    tenant_id,
    module_code,
    billing_source: {
      source_type: 'module',
      stripe_subscription_id: billing.stripe_subscription_id || undefined,
      payment_status: billing.payment_status,
    },
  });

  return res.json({
    ok: true,
    tenant_id,
    module_code,
    status: activation.status,
    reason: activation.reason,
    missing_capabilities: activation.missing_capabilities,
    billing: {
      amount: price,
      interval: 'month',
      stripe_subscription_id: billing.stripe_subscription_id || null,
      payment_status: billing.payment_status,
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
  if (!requireTenantAccess(req, res, tenant)) return;

  const entitlement = await getEntitlement(tenant_id, module_code);
  if (!entitlement) {
    return res.status(404).json({ error: `entitlement not found for ${module_code}` });
  }

  // Cancel Stripe subscription if applicable
  const cancellation = await cancelPaidSubscription(entitlement.billing_source?.stripe_subscription_id);
  if (!cancellation.ok) {
    return res.status(502).json({
      error: cancellation.error,
      message: process.env.NODE_ENV === 'development' ? cancellation.message : undefined,
    });
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
  if (!requireTenantAccess(req, res, tenant)) return;

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
