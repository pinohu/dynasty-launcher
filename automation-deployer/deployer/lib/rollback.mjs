/**
 * Rollback — undo an automation's deployment.
 */
import { loadManifest } from './manifest.mjs';
import { loadDeployed, saveDeployed, appendHistory } from './tenant.mjs';
import { loadSecrets } from './secrets.mjs';
import { DRIVER_REGISTRY } from './provisioner.mjs';

export async function rollbackAutomation(root, tenant, automationId) {
  const deployed = await loadDeployed(root, tenant.slug);
  const idx = deployed.automations.findIndex((a) => a.id === automationId);
  if (idx === -1) throw new Error(`Automation ${automationId} not deployed on tenant ${tenant.slug}`);
  const a = deployed.automations[idx];
  const manifest = await loadManifest(root, automationId);
  const secrets = await loadSecrets(root, tenant.slug);

  // Reverse driver order — newer drivers typically depend on earlier ones.
  const drivers = [...(a.drivers || [])].reverse();
  for (const driverName of drivers) {
    const driver = DRIVER_REGISTRY[driverName];
    if (!driver) continue;
    try {
      await driver.rollback({
        tenant,
        manifest,
        deployed: a.resources?.[driverName],
        secrets,
      });
      await appendHistory(root, tenant.slug, { event: 'rollback.ok', automation_id: automationId, driver: driverName });
    } catch (e) {
      await appendHistory(root, tenant.slug, { event: 'rollback.fail', automation_id: automationId, driver: driverName, error: e.message });
      throw e;
    }
  }
  deployed.automations.splice(idx, 1);
  await saveDeployed(root, tenant.slug, deployed);
  return { ok: true };
}

export async function rollbackTenant(root, tenant) {
  const deployed = await loadDeployed(root, tenant.slug);
  const ids = deployed.automations.map((a) => a.id);
  const results = [];
  // Rollback in reverse deployment order
  for (const id of ids.reverse()) {
    try {
      await rollbackAutomation(root, tenant, id);
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, ok: false, error: e.message });
    }
  }
  return { ok: results.every((r) => r.ok), results };
}
