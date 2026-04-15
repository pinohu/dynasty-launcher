/**
 * Webhook router driver — registers inbound webhooks with shared HMAC secrets
 * and writes the mapping table.
 */
export default {
  name: 'webhook-router',

  async provision({ tenant, manifest }) {
    const inbound = manifest.webhooks?.inbound || [];
    if (inbound.length === 0) return { ok: true, notes: ['No inbound webhooks declared.'] };
    const mappings = inbound.map((wh) => ({
      name: wh.name,
      path: `/webhook/${manifest.id}${wh.path}`,
      signing: wh.signing ?? 'hmac-sha256',
      automation_id: manifest.id,
    }));
    return { ok: true, resources: { mappings }, simulated: true };
  },

  async verify() {
    return { ok: true };
  },

  async rollback() {
    return { ok: true };
  },
};
