/**
 * Verifier — runs health checks against deployed automations.
 */
import { loadManifest } from './manifest.mjs';
import { loadDeployed, appendHistory } from './tenant.mjs';
import { loadSecrets } from './secrets.mjs';
import { DRIVER_REGISTRY } from './provisioner.mjs';

export async function verifyTenant(root, tenant, options = {}) {
  const deployed = await loadDeployed(root, tenant.slug);
  const secrets = await loadSecrets(root, tenant.slug);
  const results = [];
  for (const a of deployed.automations) {
    const manifest = await loadManifest(root, a.id);
    if (!manifest) {
      results.push({ id: a.id, ok: false, reason: 'manifest removed' });
      continue;
    }
    const signals = {};
    let ok = true;
    for (const driverName of a.drivers || []) {
      const driver = DRIVER_REGISTRY[driverName];
      if (!driver) continue;
      try {
        const r = await driver.verify({
          tenant,
          automation: { id: a.id },
          manifest,
          deployed: a.resources?.[driverName],
          secrets,
        });
        signals[driverName] = r.signals || {};
        if (!r.ok) ok = false;
      } catch (e) {
        signals[driverName] = { error: e.message };
        ok = false;
      }
    }
    results.push({ id: a.id, ok, signals });
    await appendHistory(root, tenant.slug, { event: 'verify', automation_id: a.id, ok });
  }
  return { ok: results.every((r) => r.ok), results };
}
