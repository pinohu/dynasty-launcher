/**
 * Secrets vault — loads per-tenant secrets.
 *
 * Production: age-encrypted `.secrets/env.age` → decrypt with
 *   AGE_IDENTITY env var → in-memory object.
 *
 * Dev: plain `tenants/<slug>/.secrets/env.local` (gitignored).
 *
 * This implementation supports the dev path. Wire age via `sops` or
 * `age-cli` when deploying for real.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export async function loadSecrets(root, slug) {
  const devPath = join(root, 'tenants', slug, '.secrets', 'env.local');
  if (existsSync(devPath)) {
    return parseEnv(await readFile(devPath, 'utf8'));
  }
  return {};
}

function parseEnv(raw) {
  const out = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}
