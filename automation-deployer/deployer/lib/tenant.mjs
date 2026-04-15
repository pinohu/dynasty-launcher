/**
 * Tenant I/O — load, save, validate tenant configurations.
 * Tenant folders live under `tenants/<slug>/`.
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

export const TENANT_FILE = 'tenant.yaml';
export const SELECTED_FILE = 'selected-automations.yaml';
export const DEPLOYED_FILE = 'deployed-automations.yaml';
export const PLAN_FILE = 'plan.json';
export const STATUS_FILE = 'status.json';

export function tenantPath(root, slug, file = '') {
  return join(root, 'tenants', slug, file);
}

export async function loadTenant(root, slug) {
  const path = tenantPath(root, slug, TENANT_FILE);
  if (!existsSync(path)) {
    throw new Error(`Tenant not found: ${slug}. Run \`automation-deployer init --tenant ${slug}\` first.`);
  }
  const raw = await readFile(path, 'utf8');
  return YAML.parse(raw);
}

export async function saveTenant(root, slug, tenant) {
  const dir = tenantPath(root, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(tenantPath(root, slug, TENANT_FILE), YAML.stringify(tenant));
}

export async function loadSelected(root, slug) {
  const path = tenantPath(root, slug, SELECTED_FILE);
  if (!existsSync(path)) return { automations: [] };
  return YAML.parse(await readFile(path, 'utf8'));
}

export async function saveSelected(root, slug, selection) {
  await writeFile(tenantPath(root, slug, SELECTED_FILE), YAML.stringify(selection));
}

export async function loadDeployed(root, slug) {
  const path = tenantPath(root, slug, DEPLOYED_FILE);
  if (!existsSync(path)) return { automations: [] };
  return YAML.parse(await readFile(path, 'utf8'));
}

export async function saveDeployed(root, slug, deployed) {
  await writeFile(tenantPath(root, slug, DEPLOYED_FILE), YAML.stringify(deployed));
}

export async function appendHistory(root, slug, event) {
  const dir = tenantPath(root, slug, 'history');
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
  await import('node:fs/promises').then((fs) => fs.appendFile(file, line));
}

export async function listTenants(root) {
  const dir = join(root, 'tenants');
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name);
}
