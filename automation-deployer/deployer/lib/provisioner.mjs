/**
 * Provisioner — executes a plan wave-by-wave, driver-by-driver.
 */
import n8n from './drivers/n8n.mjs';
import vercel from './drivers/vercel.mjs';
import github from './drivers/github.mjs';
import manual from './drivers/manual.mjs';
import worker from './drivers/worker.mjs';
import vendorNative from './drivers/vendor-native.mjs';
import webhookRouter from './drivers/webhook-router.mjs';
import { loadManifest } from './manifest.mjs';
import { loadRegistry } from './registry.mjs';
import { loadDeployed, saveDeployed, appendHistory } from './tenant.mjs';
import { loadSecrets } from './secrets.mjs';

export const DRIVER_REGISTRY = {
  n8n,
  vercel,
  github,
  manual,
  worker,
  'vendor-native': vendorNative,
  'webhook-router': webhookRouter,
};

export async function executePlan(root, tenant, plan, options = {}) {
  const secrets = await loadSecrets(root, tenant.slug);
  const registry = await loadRegistry(root);
  const deployed = await loadDeployed(root, tenant.slug);
  const deployedMap = new Map(deployed.automations.map((a) => [a.id, a]));
  const maxParallel = tenant.max_parallel_deploys ?? 4;

  for (const wave of plan.waves) {
    await appendHistory(root, tenant.slug, {
      event: 'wave.start',
      wave_index: wave.wave_index,
      count: wave.automations.length,
    });
    const results = await runWave(root, tenant, wave, secrets, registry, maxParallel, options);
    for (const r of results) {
      if (r.ok) {
        deployedMap.set(r.id, {
          id: r.id,
          manifest_version: r.manifest_version,
          drivers: r.drivers,
          resources: r.resources,
          deployed_at: new Date().toISOString(),
        });
      } else if (!options.continueOnError) {
        await appendHistory(root, tenant.slug, { event: 'plan.halted', failed: r.id, reason: r.error });
        await persistDeployed(root, tenant.slug, deployedMap);
        throw new Error(`Deployment halted on ${r.id}: ${r.error}`);
      }
    }
    await persistDeployed(root, tenant.slug, deployedMap);
    await appendHistory(root, tenant.slug, {
      event: 'wave.complete',
      wave_index: wave.wave_index,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    });
  }
  await appendHistory(root, tenant.slug, { event: 'plan.complete', plan_id: plan.plan_id });
  return { ok: true, deployed_count: deployedMap.size };
}

async function runWave(root, tenant, wave, secrets, registry, maxParallel, options) {
  const queue = [...wave.automations];
  const results = [];
  while (queue.length > 0) {
    const batch = queue.splice(0, maxParallel);
    const batchResults = await Promise.all(
      batch.map((a) => provisionAutomation(root, tenant, a, secrets, options)),
    );
    results.push(...batchResults);
  }
  return results;
}

async function provisionAutomation(root, tenant, planEntry, secrets, options) {
  const { id, drivers } = planEntry;
  const manifest = await loadManifest(root, id);
  if (!manifest) {
    return { ok: false, id, error: 'manifest missing' };
  }
  const context = {};
  const driverResources = {};
  try {
    for (const driverName of drivers) {
      const driver = DRIVER_REGISTRY[driverName];
      if (!driver) throw new Error(`Unknown driver: ${driverName}`);
      await appendHistory(root, tenant.slug, {
        event: 'driver.start',
        automation_id: id,
        driver: driverName,
      });
      const res = await driver.provision({
        tenant,
        automation: { id },
        manifest,
        secrets,
        context,
        root,
      });
      driverResources[driverName] = res.resources ?? {};
      await appendHistory(root, tenant.slug, {
        event: 'driver.ok',
        automation_id: id,
        driver: driverName,
        simulated: !!res.simulated,
      });
      if (res.simulated) context.simulated = true;
    }
    return {
      ok: true,
      id,
      manifest_version: manifest.version,
      drivers,
      resources: driverResources,
      simulated: context.simulated ?? false,
    };
  } catch (e) {
    await appendHistory(root, tenant.slug, {
      event: 'driver.fail',
      automation_id: id,
      error: e.message,
    });
    // Attempt rollback of drivers run so far
    for (const driverName of drivers.filter((d) => driverResources[d])) {
      const driver = DRIVER_REGISTRY[driverName];
      try {
        await driver.rollback({ tenant, manifest, deployed: driverResources[driverName] });
      } catch (rb) {
        await appendHistory(root, tenant.slug, {
          event: 'rollback.fail',
          automation_id: id,
          driver: driverName,
          error: rb.message,
        });
      }
    }
    return { ok: false, id, error: e.message };
  }
}

async function persistDeployed(root, slug, deployedMap) {
  await saveDeployed(root, slug, { automations: Array.from(deployedMap.values()) });
}
