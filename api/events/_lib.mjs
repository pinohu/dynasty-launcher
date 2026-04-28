// api/events/_lib.mjs — shared HTTP helpers for api/events/*

import { privilegedCorsHeaders } from '../tenants/_auth.mjs';

export function corsPreflight(req, res) {
  const origin = process.env.CORS_ORIGIN || 'https://yourdeputy.com';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', privilegedCorsHeaders());
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

export async function readBody(req, { maxBytes = 1_000_000 } = {}) {
  if (req.body && typeof req.body === 'object') {
    const bodySize = Buffer.byteLength(JSON.stringify(req.body));
    if (bodySize > maxBytes) {
      const err = new Error('payload_too_large');
      err.code = 'payload_too_large';
      throw err;
    }
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
        const err = new Error('payload_too_large');
        err.code = 'payload_too_large';
        reject(err);
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
