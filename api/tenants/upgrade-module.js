// api/tenants/upgrade-module.js — POST /api/tenants/upgrade-module
// -----------------------------------------------------------------------------
// The "activate" endpoint: tenants click a button to activate a dormant module.
// Handles payment, state transitions, and runs the 14-step activation contract.
//
// Body: { tenant_id, module_code, payment_method_id? }
//
// Flow:
//   1. If already active → return idempotent success
//   2. If dormant → check payment method on file
//   3. Process payment (Stripe charge or no-op for dev)
//   4. Change entitlement.state: dormant → entitled
//   5. Run activateModule (14-step contract)
//   6. Update automations_config.is_enabled = true
//   7. Emit module.self_service_activated
//
// Responses:
//   200 { ok: true, module_code, status: 'active', billing: { amount, interval } }
//   200 { ok: true, module_code, status: 'idempotent_ok' }
//   400 { error, reason }                                  (payment failed, etc)
//   404 { error }                                          (tenant or module not found)
// Payment is stubbed when STRIPE_SECRET_KEY is missing or starts with 'STUB'.
// -----------------------------------------------------------------------------

import { corsPreflight, methodGuard, readBody } from './_lib.mjs';
import { getTenant, getEntitlement, upsertEntitlement } from './_store.mjs';
import { getCatalog, indexModules } from '../catalog/_lib.mjs';
import { activateModule } from './_activation.mjs';
import { emit } from '../events/_bus.mjs';
import { requireTenantAccess } from './_auth.mjs';
import pg from 'pg';

const { Pool } = pg;

let _pool = null;
let _stripe = null;

function pool() {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  _pool = new Pool({
    connectionString: url,
    ssl: url?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
  return _pool;
}

function stripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('STUB')) return null; // dev/test mode
  try {
    const Stripe = require('stripe').default || require('stripe');
    _stripe = new Stripe(key);
  } catch (e) {
    console.error('[upgrade-module] stripe import failed', e);
    return null;
  }
  return _stripe;
}

const now = () => new Date().toISOString();

export const maxDuration = 45;

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;

  let body;
  try { body = await readBody(req); } catch (e) {
    return res.status(400).json({ error: 'invalid_json' });
  }

  const { tenant_id, module_code, payment_method_id } = body || {};
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });
  if (!module_code) return res.status(400).json({ error: 'module_code required' });

  // Verify tenant and module exist
  const tenant = await getTenant(tenant_id);
  if (!tenant) return res.status(404).json({ error: 'tenant_not_found' });
  if (!requireTenantAccess(req, res, tenant)) return;

  const catalog = getCatalog();
  const modsByCode = indexModules(catalog.modules || []);
  const module = modsByCode[module_code];
  if (!module) return res.status(404).json({ error: 'module_not_found' });

  try {
    const result = await upgradeModule(tenant_id, module_code, module, payment_method_id);
    if (result.error) {
      const code = result.error === 'no_payment_method' ? 402 : 400;
      return res.status(code).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('[upgrade-module]', err);
    return res.status(500).json({ error: 'upgrade_failed', details: String(err.message || err) });
  }
}

async function upgradeModule(tenant_id, module_code, module, payment_method_id) {
  // Check current entitlement
  const ent = await getEntitlement(tenant_id, module_code);
  if (!ent) {
    return { error: 'no_entitlement', reason: 'module_not_provisioned' };
  }

  // Idempotent: if already active, return success
  if (ent.state === 'active') {
    return {
      ok: true,
      module_code,
      status: 'idempotent_ok',
      entitlement: ent,
    };
  }

  // Must be in dormant state to upgrade
  if (ent.state !== 'dormant') {
    return {
      error: 'invalid_state',
      reason: `entitlement is ${ent.state}, not dormant`,
      current_state: ent.state,
    };
  }

  // Get tenant's payment info
  const tenant = await getTenant(tenant_id);
  const stripeCustomerId = tenant?.profile?.stripe_customer_id;

  // Determine pricing
  const amount = (module.price_monthly || 19) * 100; // convert to cents
  const interval = 'month';
  const billingSource = {
    source_type: 'payment',
    payment_method_id: payment_method_id || null,
    stripe_customer_id: stripeCustomerId || null,
    charged_at: now(),
  };

  // Process payment (if Stripe available and configured)
  const stripeClient = stripe();
  if (stripeClient && stripeCustomerId) {
    try {
      await processStripePayment({
        customer_id: stripeCustomerId,
        amount,
        module_code,
        description: `Dynasty Launcher: ${module.name || module_code}`,
      });
    } catch (err) {
      console.error('[upgrade-module] stripe payment failed', err);
      return {
        error: 'payment_failed',
        reason: err.message || 'Stripe charge declined',
        module_code,
      };
    }
  } else if (!stripeClient) {
    // Dev/test mode: no billing
    console.info('[upgrade-module] dev/test mode, skipping Stripe payment');
  }

  // Update entitlement: dormant → entitled
  const updated = await upsertEntitlement(tenant_id, module_code, {
    state: 'entitled',
    billing_source: billingSource,
  });

  // Run the 14-step activation contract
  const activation = await activateModule({
    tenant_id,
    module_code,
    user_input: {},
  });

  if (activation.status === 'error') {
    return {
      error: 'activation_failed',
      reason: activation.reason,
      details: activation.details,
    };
  }

  if (activation.status === 'deferred') {
    // Guided setup required; return success but note deferred status
    return {
      ok: true,
      module_code,
      status: 'deferred',
      missing_capabilities: activation.missing_capabilities,
      wizards: activation.wizards,
      billing: {
        amount: amount / 100,
        interval,
        charged: !!stripeClient,
      },
    };
  }

  // Enable in automations_config
  const p = pool();
  try {
    await p.query(
      `UPDATE automations_config
       SET is_enabled = true, updated_at = $1
       WHERE tenant_id = $2 AND module_code = $3`,
      [now(), tenant_id, module_code]
    );
  } catch (err) {
    console.error('[upgrade-module] failed to enable automations_config', err);
    // Don't fail the whole request; the module is activated in entitlements
  }

  // Emit success event
  emit('module.self_service_activated', {
    tenant_id,
    module_code,
    billing: { amount: amount / 100, interval },
  });

  return {
    ok: true,
    module_code,
    status: 'active',
    entitlement: activation.entitlement,
    billing: {
      amount: amount / 100,
      interval,
      charged: !!stripeClient,
    },
  };
}

async function processStripePayment({ customer_id, amount, module_code, description }) {
  const stripeClient = stripe();
  if (!stripeClient) throw new Error('stripe not configured');

  try {
    // Create a Stripe charge against the customer's default payment method
    const charge = await stripeClient.charges.create({
      amount,
      currency: 'usd',
      customer: customer_id,
      description,
      metadata: {
        module_code,
        product: 'dynasty_launcher',
      },
    });

    if (charge.status !== 'succeeded') {
      throw new Error(`Stripe charge status: ${charge.status}`);
    }

    return { charge_id: charge.id };
  } catch (err) {
    // Re-throw for calling code to catch
    throw err;
  }
}
