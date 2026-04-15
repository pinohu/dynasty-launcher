/**
 * Manual driver — appends a step to the tenant's MANUAL-ACTIONS.md.
 * The only driver shipped with real behavior (no network calls needed).
 */
import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';

export default {
  name: 'manual',

  async provision({ tenant, manifest, root }) {
    const dir = join(root, 'tenants', tenant.slug);
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'MANUAL-ACTIONS.md');
    const section = `
## ${manifest.id} — ${manifest.slug}

${manifest.description ?? ''}

**Steps for the tenant to perform:**
${
  (manifest.manual_steps || ['(no steps declared in manifest)']).map((s, i) => `${i + 1}. ${s}`).join('\n')
}
`;
    await appendFile(file, section);
    return {
      ok: true,
      resources: { actions_file: file },
      notes: ['Appended manual steps to MANUAL-ACTIONS.md'],
    };
  },

  async verify() {
    return { ok: true, signals: { type: 'manual' } };
  },

  async rollback({ tenant, manifest, root }) {
    // Leave MANUAL-ACTIONS.md alone; manual steps are additive audit logs.
    return { ok: true, notes: ['Manual actions are additive; not rolled back.'] };
  },
};
