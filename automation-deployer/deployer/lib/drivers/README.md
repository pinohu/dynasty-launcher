# Drivers

A driver is a module exporting three functions:

```javascript
export default {
  name: 'n8n',
  async provision({ tenant, automation, manifest, secrets, context }) {
    // Side-effects: create/update resources on the tenant's infra.
    // Returns: { ok: true, resources: {...}, notes: [] }
  },
  async verify({ tenant, automation, manifest, deployed, secrets }) {
    // Read-only health check.
    // Returns: { ok: true, signals: {...} }
  },
  async rollback({ tenant, automation, manifest, deployed, secrets }) {
    // Undo the provision. Must be idempotent.
    // Returns: { ok: true }
  },
};
```

## Contract

1. **Idempotent.** Running `provision` twice must not create duplicates. Drivers use `external_id` patterns keyed on `tenant.slug + automation.id`.
2. **Fails loudly.** On error, throw. Do not return `{ ok: false }` silently.
3. **No secret logging.** Secrets arrive via the `secrets` param and must not appear in logs.
4. **Shared context.** Drivers can read/write to `context` to pass data between drivers in the same deploy (e.g., `context.vercel.deploymentUrl`).

## Shipped drivers

| Name | Purpose | Status |
|---|---|---|
| `n8n` | Import/activate n8n workflow on tenant's n8n | stub |
| `vercel` | Create project, push code, set env, deploy | stub |
| `github` | Create repo, push files | stub |
| `webhook-router` | Register inbound webhooks | stub |
| `worker` | Register T5 worker jobs | stub |
| `vendor-native` | Invoke vendor-specific provisioning | stub |
| `manual` | Emit a step into MANUAL-ACTIONS.md | shipped |

Stubs implement the contract but return `{ ok: true, simulated: true }`. They let the rest of the pipeline run end-to-end. To complete a stub, fill in the API calls against the vendor's docs.

## Adding a new driver

1. Create `deployer/lib/drivers/<name>.mjs` exporting the contract above.
2. Add `<name>` to the enum in `schemas/automation-manifest.schema.json`.
3. Register in `deployer/lib/provisioner.mjs` DRIVER_REGISTRY.
4. Add tests under `tests/drivers/<name>.test.mjs`.
