// api/billing/_lib.mjs — shared billing helpers (CORS, body, stub detection)

import { adminCorsHeaders } from '../tenants/_auth.mjs';

export function corsPreflight(req, res) {
  const origin = process.env.CORS_ORIGIN || 'https://yourdeputy.com';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', `${adminCorsHeaders()}, Stripe-Signature`);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function methodGuard(req, res, allowed) {
  if (!allowed.includes(req.method)) {
    res.status(405).json({ error: `${allowed.join(', ')} only` });
    return false;
  }
  return true;
}

function payloadTooLargeError() {
  const err = new Error('payload_too_large');
  err.code = 'payload_too_large';
  return err;
}

function checkContentLength(req, maxBytes) {
  const raw = req.headers?.['content-length'] || req.headers?.['Content-Length'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const size = Number.parseInt(String(value || ''), 10);
  if (Number.isFinite(size) && size > maxBytes) throw payloadTooLargeError();
}

export async function readBody(req, { maxBytes = 1_000_000 } = {}) {
  checkContentLength(req, maxBytes);
  if (req.body && typeof req.body === 'object') {
    if (Buffer.byteLength(JSON.stringify(req.body)) > maxBytes) throw payloadTooLargeError();
    return req.body;
  }
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body) > maxBytes) throw payloadTooLargeError();
    if (!req.body) return {};
    return JSON.parse(req.body);
  }
  return new Promise((resolve, reject) => {
    let buf = '';
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      buf += chunk;
      if (Buffer.byteLength(buf) > maxBytes) {
        done = true;
        reject(payloadTooLargeError());
      }
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
    });
    req.on('error', (err) => {
      if (done) return;
      done = true;
      reject(err);
    });
  });
}

export async function readRawBody(req, { maxBytes = 1_000_000 } = {}) {
  // For Stripe webhook signature verification we need the raw bytes.
  checkContentLength(req, maxBytes);
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > maxBytes) throw payloadTooLargeError();
    return req.body.toString('utf-8');
  }
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body) > maxBytes) throw payloadTooLargeError();
    return req.body;
  }
  return new Promise((resolve, reject) => {
    let buf = '';
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      buf += chunk;
      if (Buffer.byteLength(buf) > maxBytes) {
        done = true;
        reject(payloadTooLargeError());
      }
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      resolve(buf);
    });
    req.on('error', (err) => {
      if (done) return;
      done = true;
      reject(err);
    });
  });
}

export function getStripeConfig() {
  // Read DYNASTY_TOOL_CONFIG (per root CLAUDE.md) for stripe_live.
  let config = {};
  try { config = JSON.parse(process.env.DYNASTY_TOOL_CONFIG || '{}'); } catch (_) { /* ignore */ }
  const stripe_secret = process.env.STRIPE_SECRET_KEY || config.payments?.stripe_live || null;
  const webhook_secret = process.env.STRIPE_WEBHOOK_SECRET || config.payments?.stripe_webhook_secret || null;
  return { stripe_secret, webhook_secret };
}

export function stripEnabled() {
  const { stripe_secret } = getStripeConfig();
  return !!stripe_secret && !stripe_secret.startsWith('EXPIRED') && !stripe_secret.startsWith('STUB');
}
