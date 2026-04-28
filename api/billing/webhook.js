// api/billing/webhook.js — POST /api/billing/webhook
// -----------------------------------------------------------------------------
// Receives Stripe events and translates them into entitlement mutations.
//
// Accepted events:
//   checkout.session.completed  → grant entitlement(s) for each line item
//   invoice.paid                → reactivate paused entitlements on the sub
//   invoice.payment_failed      → pause entitlements on the sub
//   customer.subscription.deleted → revoke entitlements on the sub
//
// Signature verification uses STRIPE_WEBHOOK_SECRET (or
// DYNASTY_TOOL_CONFIG.payments.stripe_webhook_secret). In stub mode (no
// secret), the body is accepted verbatim — tests exercise this path.
//
// This endpoint replaces itself with a signed-webhook contract as soon as
// keys are set; no code change is needed.
// -----------------------------------------------------------------------------

import { corsPreflight, methodGuard, readRawBody, getStripeConfig } from './_lib.mjs';
import { constructEvent } from './_stripe.mjs';
import {
  activateModule,
  grantEntitlement,
  pauseModule,
  resumeModule,
  deactivateModule,
} from '../tenants/_activation.mjs';
import { getTenant, listTenantEntitlements, setTenantCapability } from '../tenants/_store.mjs';
import { getCatalog, indexModules } from '../catalog/_lib.mjs';
import { emit } from '../events/_bus.mjs';

export const maxDuration = 30;

function extractTenantId(event) {
  const obj = event.data?.object || {};
  return obj.metadata?.tenant_id
    || obj.subscription_details?.metadata?.tenant_id
    || null;
}

function extractSkuCodes(event) {
  const obj = event.data?.object || {};
  const codes = obj.metadata?.sku_codes || '';
  const types = obj.metadata?.sku_types || '';
  if (!codes) return [];
  const codeList = codes.split(',').map((s) => s.trim()).filter(Boolean);
  const typeList = types.split(',').map((s) => s.trim()).filter(Boolean);
  return codeList.map((code, i) => ({ sku_code: code, sku_type: typeList[i] || 'module' }));
}

function normalizeCode(code) {
  return String(code || '').trim().replace(/-/g, '_');
}

function expandSkuToModules(sku_type, sku_code) {
  const catalog = getCatalog();
  const modulesByCode = indexModules(catalog.modules || []);
  const bundlesByCode = Object.fromEntries((catalog.bundles || []).map((b) => [normalizeCode(b.bundle_code), b]));
  const suitesByCode = Object.fromEntries(((catalog.tiers?.suites) || []).map((s) => [normalizeCode(s.suite_code), s]));
  const editionsByCode = Object.fromEntries(((catalog.tiers?.editions) || []).map((e) => [normalizeCode(e.edition_code), e]));
  const tiersByCode = Object.fromEntries(((catalog.tiers?.tiers) || []).map((t) => [normalizeCode(t.tier_code), t]));

  const moduleCodes = [];
  const skipped = [];
  const addModule = (code, via) => {
    const normalized = normalizeCode(code);
    if (modulesByCode[normalized]) moduleCodes.push(normalized);
    else skipped.push({ code, via, reason: 'module_not_found' });
  };
  const addBundle = (code, via = 'bundle') => {
    const bundle = bundlesByCode[normalizeCode(code)];
    if (!bundle) {
      skipped.push({ code, via, reason: 'bundle_not_found' });
      return;
    }
    for (const moduleCode of bundle.modules || []) addModule(moduleCode, bundle.bundle_code);
  };
  const addSuite = (code, via = 'suite') => {
    const suite = suitesByCode[normalizeCode(code)];
    if (!suite) {
      skipped.push({ code, via, reason: 'suite_not_found' });
      return;
    }
    for (const packCode of suite.packs || []) addBundle(packCode, suite.suite_code);
    for (const extraCode of suite.extras || []) addModule(extraCode, suite.suite_code);
  };

  if (sku_type === 'module') addModule(sku_code, 'module');
  else if (sku_type === 'pack' || sku_type === 'bundle') addBundle(sku_code);
  else if (sku_type === 'suite') addSuite(sku_code);
  else if (sku_type === 'edition') {
    const edition = editionsByCode[normalizeCode(sku_code)];
    if (!edition) skipped.push({ code: sku_code, via: 'edition', reason: 'edition_not_found' });
    else {
      const includes = edition.includes || {};
      if (Array.isArray(includes.suites)) includes.suites.forEach((code) => addSuite(code, edition.edition_code));
      else if (includes.suites === 'all') Object.values(suitesByCode).forEach((suite) => addSuite(suite.suite_code, edition.edition_code));
      if (Array.isArray(includes.packs)) includes.packs.forEach((code) => addBundle(code, edition.edition_code));
      else if (includes.packs === 'all') Object.values(bundlesByCode).forEach((bundle) => addBundle(bundle.bundle_code, edition.edition_code));
      const baseTier = tiersByCode[normalizeCode(includes.tier)];
      for (const moduleCode of baseTier?.included_modules || []) addModule(moduleCode, includes.tier);
    }
  } else if (sku_type === 'tier') {
    const tier = tiersByCode[normalizeCode(sku_code)];
    if (!tier) skipped.push({ code: sku_code, via: 'tier', reason: 'tier_not_found' });
    else for (const moduleCode of tier.included_modules || []) addModule(moduleCode, tier.tier_code);
  }

  return { moduleCodes: [...new Set(moduleCodes)], skipped, modulesByCode };
}

async function autoEnableCapabilities({ tenant_id, module }) {
  const enabled = [];
  for (const capability of module.capabilities_required || []) {
    await setTenantCapability(tenant_id, capability, true);
    enabled.push(capability);
  }
  if (enabled.length) {
    emit('tenant.capabilities_auto_enabled', {
      tenant_id,
      module_code: module.module_code,
      capabilities: enabled,
      source: 'checkout',
    });
  }
  return enabled;
}

async function grantForItems({ tenant_id, skus, subscription_id }) {
  const results = [];
  for (const { sku_type, sku_code } of skus) {
    if (sku_type === 'concierge') continue; // concierge is one-time, no entitlement

    const { moduleCodes, skipped, modulesByCode } = expandSkuToModules(sku_type, sku_code);
    for (const skip of skipped) {
      results.push({ sku_code: skip.code, sku_type, via: skip.via, status: 'skipped', reason: skip.reason });
    }

    if (moduleCodes.length === 0) {
      if (!skipped.length) results.push({ sku_code, sku_type, status: 'skipped_unknown_type' });
      continue;
    }

    for (const module_code of moduleCodes) {
      const module = modulesByCode[module_code];
      const ent = await grantEntitlement({
        tenant_id,
        module_code,
        billing_source: {
          source_type: sku_type,
          source_code: sku_code,
          stripe_subscription_id: subscription_id || null,
        },
      });
      const capabilities_enabled = await autoEnableCapabilities({ tenant_id, module });
      const activation = await activateModule({ tenant_id, module_code, user_input: {} });
      const activated = activation.status === 'ok' || activation.status === 'idempotent_ok';
      results.push({
        sku_code: module_code,
        source_sku_code: sku_code,
        source_sku_type: sku_type,
        status: activated ? 'activated' : activation.status === 'deferred' ? 'deferred' : 'activation_failed',
        entitlement_id: ent.entitlement_id,
        activation_status: activation.status,
        reason: activation.reason || null,
        missing_capabilities: activation.missing_capabilities || [],
        capabilities_enabled,
      });
    }
  }
  return results;
}

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;

  const { webhook_secret } = getStripeConfig();
  let event;
  try {
    const raw = await readRawBody(req, { maxBytes: 1_000_000 });
    event = constructEvent(raw, req.headers['stripe-signature'], webhook_secret);
  } catch (e) {
    if (e.code === 'payload_too_large') {
      return res.status(413).json({ error: 'payload_too_large' });
    }
    return res.status(400).json({ error: 'invalid_signature', message: e.message });
  }
  if (!event || !event.type) return res.status(400).json({ error: 'invalid_event' });

  emit('billing.webhook_received', { event_type: event.type, event_id: event.id });

  const tenant_id = extractTenantId(event);
  const actions = [];

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        if (!tenant_id) return res.status(200).json({ ok: true, action: 'skipped_no_tenant' });
        if (!await getTenant(tenant_id)) {
          emit('billing.tenant_not_found', { tenant_id });
          return res.status(200).json({ ok: true, action: 'tenant_not_found' });
        }
        const skus = extractSkuCodes(event);
        const sub = event.data.object.subscription || null;
        const granted = await grantForItems({ tenant_id, skus, subscription_id: sub });
        actions.push({ type: 'grant', results: granted });
        break;
      }
      case 'invoice.paid': {
        if (!tenant_id) break;
        // Resume any paused entitlements tied to this subscription
        const sub = event.data.object.subscription || null;
        const ents = await listTenantEntitlements(tenant_id);
        for (const e of ents.filter((x) => x.state === 'paused' && x.billing_source?.stripe_subscription_id === sub)) {
          await resumeModule({ tenant_id, module_code: e.module_code });
          actions.push({ type: 'resume', module_code: e.module_code });
        }
        break;
      }
      case 'invoice.payment_failed': {
        if (!tenant_id) break;
        const sub = event.data.object.subscription || null;
        const ents = await listTenantEntitlements(tenant_id);
        for (const e of ents.filter((x) => x.state === 'active' && x.billing_source?.stripe_subscription_id === sub)) {
          await pauseModule({ tenant_id, module_code: e.module_code, reason: 'payment_failed' });
          actions.push({ type: 'pause', module_code: e.module_code });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        if (!tenant_id) break;
        const sub = event.data.object.id;
        const ents = await listTenantEntitlements(tenant_id);
        for (const e of ents.filter((x) => x.billing_source?.stripe_subscription_id === sub)) {
          await deactivateModule({ tenant_id, module_code: e.module_code });
          actions.push({ type: 'deactivate', module_code: e.module_code });
        }
        break;
      }
      default:
        actions.push({ type: 'ignored', event_type: event.type });
    }
  } catch (e) {
    emit('billing.webhook_handler_error', { event_type: event.type, error: e.message });
    return res.status(500).json({ error: 'handler_error', message: e.message });
  }

  return res.status(200).json({ ok: true, event_type: event.type, actions });
}
