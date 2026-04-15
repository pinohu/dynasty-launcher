/**
 * Manifest loader + validator. Reads YAML manifests from `manifests/`.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

export async function loadManifest(root, id) {
  const dir = join(root, 'manifests');
  // Try canonical slug-based filename first
  const pattern = `${id}-`;
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(dir);
  const match = files.find((f) => f.startsWith(pattern) && f.endsWith('.yaml'));
  if (!match) return null;
  const raw = await readFile(join(dir, match), 'utf8');
  const manifest = YAML.parse(raw);
  manifest._file = join(dir, match);
  return manifest;
}

export async function manifestExists(root, id) {
  const { readdir } = await import('node:fs/promises');
  const dir = join(root, 'manifests');
  if (!existsSync(dir)) return false;
  const files = await readdir(dir);
  return files.some((f) => f.startsWith(`${id}-`) && f.endsWith('.yaml'));
}

/**
 * Minimal lightweight validator. For full JSON-schema validation, use
 * `ajv` against schemas/automation-manifest.schema.json via `scripts/validate.mjs`.
 */
export function validateManifest(m) {
  const errors = [];
  if (!m.id || !/^\d{1,2}\.\d{2}$/.test(m.id)) errors.push('Missing/invalid id');
  if (!m.slug || !/^[a-z0-9-]+$/.test(m.slug)) errors.push('Missing/invalid slug');
  if (!m.version || typeof m.version !== 'number') errors.push('Missing version');
  if (!m.topology || !['T1', 'T2', 'T3', 'T4', 'T5'].includes(m.topology)) errors.push('Invalid topology');
  if (!Array.isArray(m.triggers) || m.triggers.length === 0) errors.push('Missing triggers');
  if (!Array.isArray(m.rollback) || m.rollback.length === 0) errors.push('Missing rollback steps');
  if (!m.data_sensitivity) errors.push('Missing data_sensitivity');
  if (m.shared_runtime === true && m.data_sensitivity !== 'public') {
    errors.push('shared_runtime=true is only allowed for public-data automations');
  }
  return errors;
}
