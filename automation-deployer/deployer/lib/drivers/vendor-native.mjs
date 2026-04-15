/**
 * Vendor-native driver — dispatches to per-vendor sub-drivers for T4
 * automations (pure vendor configuration).
 */
export default {
  name: 'vendor-native',

  async provision({ tenant, manifest, context }) {
    const vendor = manifest.vendor_variant?.vendor || manifest.stack?.[0];
    return {
      ok: true,
      resources: { vendor, resource_hint: `auto-${tenant.slug}-${manifest.id}` },
      simulated: true,
      notes: [`Vendor sub-driver for ${vendor} not yet implemented; manifest documents shape.`],
    };
  },

  async verify() {
    return { ok: true, signals: { simulated: true } };
  },

  async rollback() {
    return { ok: true, simulated: true };
  },
};
