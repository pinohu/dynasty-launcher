/**
 * Vercel driver — pushes code to tenant's GitHub repo (delegated to github
 * driver), ensures a Vercel project is linked, sets env vars, triggers a
 * deployment.
 *
 * Real API:
 *   GET  /v9/projects/{id}
 *   POST /v9/projects
 *   POST /v10/projects/{id}/env
 *   POST /v13/deployments
 */
export default {
  name: 'vercel',

  async provision({ tenant, automation, manifest, secrets, context }) {
    const teamId = tenant.infra?.vercel?.team_id;
    const token = secrets?.VERCEL_TOKEN;
    if (!teamId || !token) {
      context.simulated = true;
      return { ok: true, simulated: true, notes: ['Vercel team_id or token missing; simulation only'] };
    }
    const projectName = (tenant.infra.vercel.project_id_pattern ?? '{slug}-{automation_slug}')
      .replace('{slug}', tenant.slug)
      .replace('{automation_slug}', manifest.slug);

    // Populate env vars from manifest.env_schema filled with tenant secrets
    const envVars = [];
    for (const [key, def] of Object.entries(manifest.env_schema || {})) {
      const value = secrets[key] ?? def.default;
      if (value === undefined && def.required) {
        throw new Error(`Required env ${key} missing for ${manifest.id}`);
      }
      if (value !== undefined) envVars.push({ key, value, target: ['production'] });
    }

    return {
      ok: true,
      resources: {
        project_name: projectName,
        env_vars_set: envVars.map((e) => e.key),
        deployment_url: `https://${projectName}.vercel.app`,
      },
      simulated: true,
      notes: ['Real Vercel API calls not performed in stub.'],
    };
  },

  async verify({ manifest, deployed }) {
    const url = deployed?.deployment_url;
    if (!url) return { ok: false, signals: { reason: 'no deployment url' } };
    const synthPayload = manifest.health_check?.synthetic_payload;
    // Real: fetch(url, { method: 'POST', body: synthPayload })
    return { ok: true, signals: { probe_url: url, simulated: true } };
  },

  async rollback({ tenant, manifest }) {
    // Real:
    //   delete api/auto-<id>-<slug>.js via a new commit (github driver handles)
    //   unset env vars
    //   redeploy
    return { ok: true, simulated: true };
  },
};
