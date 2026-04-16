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
import { grantEntitlement, pauseModule, resumeModule, deactivateModule } from '../tenants/_activation.mjs';
import { getTenant, listTenantEntitlements } from '../tenants/_store.mjs';
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

// Expand pack/bundle SKUs into their constituent module codes
function expandPackToModules(sku_code) {
  try {
    const catalog = getCatalog();
    const bundle = (catalog.bundles || []).find(
      (b) => b.bundle_code === sku_code || b.bundle_code === sku_code.replace(/-/g, '_'),
    );
    return bundle ? bundle.modules : [];
  } catch { return []; }
}

async function grantForItems({ tenant_id, skus, subscription_id }) {
  const results = [];
  for (const { sku_type, sku_code } of skus) {
    if (sku_type === 'concierge') continue; // concierge is one-time, no entitlement

    // Expand packs/bundles into their constituent modules
    const moduleCodes = sku_type === 'module'
      ? [sku_code]
      : sku_type === 'pack' || sku_type === 'bundle'
        ? expandPackToModules(sku_code)
        : [];

    if (moduleCodes.length === 0 && sku_type !== 'module') {
      results.push({ sku_code, sku_type, status: 'skipped_unknown_type' });
      continue;
    }

    for (const module_code of moduleCodes) {
      const ent = await grantEntitlement({
        tenant_id,
        module_code,
        billing_source: {
          source_type: sku_type,
          source_code: sku_code,
          stripe_subscription_id: subscription_id || null,
        },
      });
      results.push({ sku_code: module_code, via_pack: sku_type !== 'module' ? sku_code : null, status: 'granted', entitlement_id: ent.entitlement_id });
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
    const raw = await readRawBody(req);
    event = constructEvent(raw, req.headers['stripe-signature'], webhook_secret);
  } catch (e) {
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
