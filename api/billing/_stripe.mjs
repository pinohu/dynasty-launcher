// api/billing/_stripe.mjs — minimal Stripe wrapper
// -----------------------------------------------------------------------------
// Thin fetch-based wrapper around Stripe's REST API. We avoid the SDK so the
// lambda has zero runtime dependencies beyond node:fetch (Node 20+).
//
// Only the calls we actually need are implemented:
//   - createCheckoutSession
//   - constructEvent (webhook signature verification)
//   - listProducts / createProduct / createPrice (for catalog sync)
//
// When DYNASTY_TOOL_CONFIG's stripe_live is absent or STUB-prefixed, every
// call returns a fake shape so smoke tests pass without network access.
// -----------------------------------------------------------------------------

import crypto from 'node:crypto';

import { getStripeConfig, stripEnabled } from './_lib.mjs';

const STRIPE_API = 'https://api.stripe.com/v1';
const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

function authHeader() {
  const { stripe_secret } = getStripeConfig();
  if (!stripe_secret) throw new Error('stripe_secret_missing');
  return 'Basic ' + Buffer.from(stripe_secret + ':').toString('base64');
}

function formEncode(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v == null) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      out.push(formEncode(v, key));
    } else if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        const itemKey = `${key}[${i}]`;
        if (typeof v[i] === 'object') out.push(formEncode(v[i], itemKey));
        else out.push(`${encodeURIComponent(itemKey)}=${encodeURIComponent(String(v[i]))}`);
      }
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out.join('&');
}

async function stripeCall(path, opts = {}) {
  const url = STRIPE_API + path;
  const body = opts.body ? formEncode(opts.body) : null;
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'Authorization': authHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error?.message || `stripe ${r.status}`);
    err.type = data.error?.type;
    err.code = data.error?.code;
    err.status = r.status;
    throw err;
  }
  return data;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export function isConfigured() {
  return stripEnabled();
}

export async function createCheckoutSession({
  tenant_id,
  line_items,             // [{ price: 'price_xxx', quantity: 1 }, ...]
  success_url,
  cancel_url,
  mode = 'subscription',
  customer_email = null,
  metadata = {},
}) {
  if (!stripEnabled()) {
    // Stub mode — return a fake session shape. Tests verify the request plumbing.
    return {
      stub: true,
      id: `cs_stub_${Date.now()}`,
      url: 'https://stub.stripe.test/checkout',
      mode,
      metadata: { tenant_id, ...metadata },
      line_items,
    };
  }
  return stripeCall('/checkout/sessions', {
    method: 'POST',
    body: {
      mode,
      success_url,
      cancel_url,
      line_items,
      customer_email,
      metadata: { tenant_id, ...metadata },
      subscription_data: mode === 'subscription' ? { metadata: { tenant_id, ...metadata } } : undefined,
    },
  });
}

export async function listProducts({ limit = 100 } = {}) {
  if (!stripEnabled()) return { stub: true, data: [] };
  return stripeCall(`/products?limit=${limit}`);
}

export async function retrieveProduct(id) {
  if (!stripEnabled()) {
    const err = new Error('not_found');
    err.status = 404;
    throw err;
  }
  return stripeCall(`/products/${encodeURIComponent(id)}`);
}

export async function createProduct({ id, name, description, metadata = {} }) {
  if (!stripEnabled()) return { stub: true, id: id || `prod_stub_${name}`, name };
  return stripeCall('/products', {
    method: 'POST',
    body: { id, name, description, metadata },
  });
}

export async function listPrices({ lookup_keys = [], product = null, limit = 100 } = {}) {
  if (!stripEnabled()) return { stub: true, data: [] };
  const params = [`limit=${limit}`];
  if (product) params.push(`product=${encodeURIComponent(product)}`);
  for (const lk of lookup_keys) {
    params.push(`lookup_keys[]=${encodeURIComponent(lk)}`);
  }
  return stripeCall(`/prices?${params.join('&')}`);
}

export async function createPrice({ product, unit_amount, currency = 'usd', recurring, metadata = {}, nickname = null, lookup_key = null, transfer_lookup_key = true }) {
  if (!stripEnabled()) {
    return {
      stub: true,
      id: `price_stub_${product}_${unit_amount}`,
      unit_amount, product, lookup_key,
    };
  }
  const body = { product, unit_amount, currency, metadata, nickname };
  if (recurring) body.recurring = recurring;
  if (lookup_key) {
    body.lookup_key = lookup_key;
    body.transfer_lookup_key = transfer_lookup_key;
  }
  return stripeCall('/prices', {
    method: 'POST',
    body,
  });
}

// -----------------------------------------------------------------------------
// Webhook signature verification (Stripe's standard scheme)
// -----------------------------------------------------------------------------

export function constructEvent(rawBody, signatureHeader, webhookSecret) {
  if (!stripEnabled()) {
    // Stub mode: accept the raw body as the event directly
    try { return JSON.parse(rawBody); } catch { return null; }
  }
  if (!webhookSecret || webhookSecret.startsWith('STUB') || webhookSecret.startsWith('EXPIRED')) {
    throw new Error('webhook_secret_missing');
  }
  const parts = String(signatureHeader || '').split(',').reduce((acc, p) => {
    const [k, v] = p.split('=');
    acc[k] = v;
    return acc;
  }, {});
  const { t: timestamp, v1: v1sig } = parts;
  if (!timestamp || !v1sig) throw new Error('signature_missing');
  const signedAt = Number(timestamp);
  const tolerance = Number.parseInt(
    process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS || String(DEFAULT_WEBHOOK_TOLERANCE_SECONDS),
    10,
  );
  const maxAgeSeconds = Number.isFinite(tolerance) && tolerance > 0
    ? tolerance
    : DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
  if (
    !Number.isFinite(signedAt) ||
    Math.abs(Math.floor(Date.now() / 1000) - signedAt) > maxAgeSeconds
  ) {
    throw new Error('signature_timestamp_out_of_tolerance');
  }

  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  if (Buffer.byteLength(expected) !== Buffer.byteLength(v1sig)) {
    throw new Error('signature_mismatch');
  }
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1sig))) {
    throw new Error('signature_mismatch');
  }

  return JSON.parse(rawBody);
}
