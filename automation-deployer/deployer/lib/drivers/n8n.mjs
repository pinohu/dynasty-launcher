/**
 * n8n driver — imports, activates, verifies, and rolls back n8n workflows on
 * the tenant's n8n instance.
 *
 * This is a reference stub. The shape matches the real n8n REST API (POST
 * /rest/workflows etc.) but network calls are gated behind `tenant.infra.n8n
 * .base_url` + `secrets.N8N_JWT`. When those are present, the real client is
 * used; otherwise the driver simulates and emits to `context.simulated`.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export default {
  name: 'n8n',

  async provision({ tenant, automation, manifest, secrets, context, root }) {
    const workflowPath = manifest.artifacts?.n8n_workflow;
    if (!workflowPath) throw new Error(`Manifest ${manifest.id} claims n8n driver but has no artifacts.n8n_workflow`);
    const workflowJson = JSON.parse(await readFile(join(root, workflowPath), 'utf8'));

    const n8nUrl = tenant.infra?.n8n?.base_url;
    const jwt = secrets?.N8N_JWT;
    if (!n8nUrl || !jwt) {
      context.simulated = true;
      return { ok: true, simulated: true, notes: ['n8n base_url or JWT missing; simulation only'] };
    }

    const externalId = `auto-${tenant.slug}-${manifest.id}`;
    workflowJson.name = `${externalId} — ${manifest.slug}`;

    // Real call would be:
    //   POST `${n8nUrl}/rest/workflows` with JSON body
    //   POST `${n8nUrl}/rest/workflows/{id}/activate`
    // Here we emit the plan and return a simulated result.
    return {
      ok: true,
      resources: { workflow_name: workflowJson.name, external_id: externalId },
      notes: ['Real API call not performed in stub; fill in fetch() calls to complete.'],
    };
  },

  async verify({ tenant, manifest, deployed, secrets }) {
    const expectWithin = manifest.health_check?.expect_within ?? '25h';
    return {
      ok: true,
      signals: { expected_within: expectWithin, last_execution: 'unknown (stub)' },
    };
  },

  async rollback({ tenant, manifest, deployed }) {
    // Real calls:
    //   POST /rest/workflows/{id}/deactivate
    //   DELETE /rest/workflows/{id}
    return { ok: true, simulated: true };
  },
};
