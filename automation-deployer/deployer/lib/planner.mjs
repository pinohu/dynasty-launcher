/**
 * Dependency resolver + plan builder.
 *
 * Input: tenant + selected automations + registry + manifests.
 * Output: deployment plan (waves + per-automation driver list + credential gap).
 */
import { randomUUID } from 'node:crypto';
import { loadRegistry } from './registry.mjs';
import { loadManifest } from './manifest.mjs';

export async function buildPlan(root, tenant, selection, options = {}) {
  const registry = await loadRegistry(root);
  const selectedIds = new Set(selection.automations.map((a) => a.id));
  const resolved = resolveDependencies(selectedIds, registry);
  const conflicts = detectConflicts(resolved, registry);
  if (conflicts.length > 0) {
    throw new Error(
      `Conflicts detected:\n${conflicts.map((c) => `  - ${c.a} conflicts with ${c.b}`).join('\n')}`,
    );
  }
  const waves = topoSortWaves(resolved, registry);

  const waveArr = [];
  const credentialGap = [];
  let totalMonthlyCost = 0;
  let totalCount = 0;

  for (let w = 0; w < waves.length; w++) {
    const wave = { wave_index: w, automations: [] };
    for (const id of waves[w]) {
      const automation = registry.byId.get(id);
      if (!automation) continue;
      const manifest = await loadManifest(root, id);
      const status = manifest ? 'ready' : 'blocked';
      const missing = manifest ? missingCredentials(manifest, tenant) : [];
      if (missing.length > 0) credentialGap.push(...missing.map((k) => ({ key: k, required_by: [id] })));
      const drivers = manifest?.drivers || defaultDriversForTopology(automation.topology);
      const cost = estimateMonthlyCost(automation);
      totalMonthlyCost += cost;
      totalCount += 1;
      wave.automations.push({
        id,
        manifest_ref: manifest?._file?.split('/manifests/')[1] ?? null,
        status: manifest ? (missing.length === 0 ? 'ready' : 'blocked') : 'blocked',
        drivers,
        blocked_reason: manifest
          ? missing.length > 0
            ? `missing credentials: ${missing.join(', ')}`
            : undefined
          : 'manifest not yet authored',
        missing_credentials: missing,
        estimated_cost_monthly_usd: cost,
        estimated_deploy_seconds: manifest?.estimated_deploy_seconds ?? 30,
      });
    }
    waveArr.push(wave);
  }

  return {
    plan_id: randomUUID(),
    tenant_slug: tenant.slug,
    created_at: new Date().toISOString(),
    mode: options.mode ?? 'deploy',
    total_automations: totalCount,
    waves: waveArr,
    credential_gap: deduplicateCredGap(credentialGap),
    estimated_cost_total_monthly_usd: Math.round(totalMonthlyCost * 100) / 100,
    summary: `${totalCount} automation(s) in ${waveArr.length} wave(s), est. $${totalMonthlyCost.toFixed(2)}/mo`,
  };
}

function resolveDependencies(selectedIds, registry) {
  const resolved = new Set(selectedIds);
  const toVisit = [...selectedIds];
  while (toVisit.length > 0) {
    const id = toVisit.pop();
    const deps = registry.relationships.depends_on?.[id] || [];
    for (const d of deps) {
      if (!resolved.has(d)) {
        resolved.add(d);
        toVisit.push(d);
      }
    }
  }
  return resolved;
}

function detectConflicts(resolved, registry) {
  const conflicts = [];
  const resolvedArr = Array.from(resolved);
  for (const [a, b] of registry.relationships.conflicts_with || []) {
    if (resolvedArr.includes(a) && resolvedArr.includes(b)) {
      conflicts.push({ a, b });
    }
  }
  for (const [a, b] of registry.relationships.replaces || []) {
    if (resolvedArr.includes(a) && resolvedArr.includes(b)) {
      conflicts.push({ a, b, reason: 'replaces' });
    }
  }
  return conflicts;
}

function topoSortWaves(set, registry) {
  const ids = Array.from(set);
  const inDeg = new Map(ids.map((id) => [id, 0]));
  const adj = new Map(ids.map((id) => [id, []]));
  for (const id of ids) {
    const deps = (registry.relationships.depends_on?.[id] || []).filter((d) => set.has(d));
    inDeg.set(id, deps.length);
    for (const d of deps) adj.get(d).push(id);
  }
  const waves = [];
  const remaining = new Set(ids);
  while (remaining.size > 0) {
    const wave = [];
    for (const id of remaining) if (inDeg.get(id) === 0) wave.push(id);
    if (wave.length === 0) {
      throw new Error(`Dependency cycle among: ${Array.from(remaining).join(', ')}`);
    }
    for (const id of wave) {
      remaining.delete(id);
      for (const next of adj.get(id)) inDeg.set(next, inDeg.get(next) - 1);
    }
    waves.push(wave);
  }
  return waves;
}

function missingCredentials(manifest, tenant) {
  const provided = new Set(Object.keys(tenant.secrets || {}));
  const missing = [];
  for (const cred of manifest.credentials_required || []) {
    if (cred.source === 'deployer') continue;
    if (!provided.has(cred.key)) missing.push(cred.key);
  }
  return missing;
}

function defaultDriversForTopology(topology) {
  return {
    T1: ['n8n'],
    T2: ['github', 'vercel'],
    T3: ['github', 'vercel', 'n8n'],
    T4: ['vendor-native'],
    T5: ['worker'],
  }[topology] || [];
}

function estimateMonthlyCost(a) {
  let cost = 9;
  if (a.estimated_monthly_tokens > 0) cost += (a.estimated_monthly_tokens / 1000) * 0.001;
  return cost;
}

function deduplicateCredGap(list) {
  const byKey = new Map();
  for (const item of list) {
    if (!byKey.has(item.key)) byKey.set(item.key, { key: item.key, required_by: [] });
    byKey.get(item.key).required_by.push(...item.required_by);
  }
  return Array.from(byKey.values());
}
