/**
 * GitHub driver — ensures the tenant's automation repo exists, pushes the
 * automation's code artifact.
 *
 * Real API:
 *   GET  /repos/{owner}/{repo}
 *   POST /user/repos
 *   PUT  /repos/{owner}/{repo}/contents/{path}
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export default {
  name: 'github',

  async provision({ tenant, manifest, secrets, root, context }) {
    const owner = tenant.infra?.github?.owner;
    const repo = tenant.infra?.github?.default_repo ?? `${tenant.slug}-automations`;
    const token = secrets?.GITHUB_TOKEN;
    if (!owner || !token) {
      context.simulated = true;
      return { ok: true, simulated: true, notes: ['GitHub owner or token missing; simulation only'] };
    }

    const codePath = manifest.artifacts?.code;
    if (!codePath) {
      return { ok: true, notes: ['No code artifact; github driver is a no-op for this automation.'] };
    }
    const code = await readFile(join(root, codePath), 'utf8');
    const targetPath = `api/auto-${manifest.id}-${manifest.slug}.js`;

    return {
      ok: true,
      resources: { repo: `${owner}/${repo}`, path: targetPath, size: code.length },
      simulated: true,
      notes: ['Real GitHub PUT /contents not performed in stub.'],
    };
  },

  async verify({ tenant, manifest, deployed }) {
    return { ok: true, signals: { simulated: true } };
  },

  async rollback({ tenant, manifest }) {
    // Delete api/auto-<id>-<slug>.js via a new commit
    return { ok: true, simulated: true };
  },
};
