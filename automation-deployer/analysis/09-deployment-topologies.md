# 09 — Deployment Topologies In Depth

Each of the 5 topologies defined in `DEPLOYMENT_MODEL.md` has a distinct deployment recipe. This doc goes into the details the drivers implement.

## T1 — Pure n8n

### Provisioning steps

1. Verify tenant's n8n is reachable (`GET /rest/active-workflows`).
2. If credentials for required vendors don't exist in n8n, create them via `POST /rest/credentials`.
3. Import the workflow JSON via `POST /rest/workflows` (or update if `workflow_id` already recorded in tenant's state).
4. Bind each node's `credentials` field to the IDs from step 2.
5. Activate the workflow: `POST /rest/workflows/{id}/activate`.
6. Record the workflow ID, webhook URL (if any), and version in `tenants/<slug>/deployed-automations.yaml`.

### Verification

- For cron workflows: wait up to 1 cron cycle (or `expect_within` from manifest) and check `GET /rest/executions?workflowId=X&status=success&limit=1`.
- For webhook workflows: POST a synthetic payload to the webhook URL and expect a successful execution.

### Rollback

- `POST /rest/workflows/{id}/deactivate`
- `DELETE /rest/workflows/{id}`
- Delete any credentials that were created solely for this workflow (preserve shared credentials).

### Edge cases

- **Shared credentials.** Two automations might use the same Stripe or SuiteDash credential. The driver must reference-count credential usage and only delete when usage drops to zero.
- **Workflow conflicts.** Two workflows trying to listen on the same webhook path. The path is namespaced by automation ID (`/webhook/auto-1.01-gbp`) to avoid collision.
- **Node version drift.** The JSON export is pinned to n8n version. The driver warns if the tenant's n8n is ≥2 minor versions ahead.

## T2 — Vercel serverless

### Provisioning steps

1. Ensure tenant's GitHub repo exists — create via `POST /user/repos` if not.
2. Push the automation's code to a path: `api/auto-<id>-<slug>.js` with a single commit.
3. Ensure tenant's Vercel project is linked to the repo (`GET /v9/projects/{id}` — create if not).
4. Set environment variables via `POST /v10/projects/{id}/env` for every entry in the manifest's `env_schema`.
5. Trigger a deployment via `POST /v13/deployments`.
6. Wait for the deployment to hit READY state (or fail).
7. Record the deployment URL, function URL, and version.

### Verification

- Call the function URL with a known-good test payload (from `manifest.verify.synthetic_payload`).
- Expect HTTP 200 + structured response.

### Rollback

- Delete the `api/auto-<id>-<slug>.js` file via a new commit.
- Remove env vars tied exclusively to this automation.
- Trigger a redeploy.

### Edge cases

- **Code conflicts.** If two automations share a helper (`lib/crm.js`), the helper is a separate manifest dependency.
- **Cold start.** Vercel functions cold-start; the verifier allows up to 10s on the first call.
- **Env var propagation.** New env vars need a redeploy; the driver ensures the deploy happens after env writes.

## T3 — Hybrid (Vercel → n8n)

### Provisioning steps

1. Run T2 steps for the Vercel-side code.
2. Run T1 steps for the n8n workflow.
3. Set the n8n webhook URL as a Vercel env var (`N8N_WEBHOOK_URL_<SLUG>`).
4. Set a shared HMAC secret in both Vercel (as env) and n8n (as credential) for request signing.

### Verification

- POST to the Vercel endpoint with a test payload.
- Confirm the n8n workflow executed within 15s by checking execution list.

### Rollback

- Rollback T2 first, then T1.
- Delete the HMAC secret from both sides.

### Edge cases

- **Partial failure between halves.** If Vercel succeeds but n8n fails, the Vercel endpoint returns 502 to callers. The rollback unwinds cleanly.
- **HMAC drift.** A rotated HMAC on one side breaks the other. `deployer rotate --tenant X --secret hmac` handles coordinated rotation.

## T4 — Vendor-native (no code)

### Provisioning steps

1. Authenticate against the vendor's API using tenant-scoped credentials.
2. Create or update the vendor-specific resource (e.g., SuiteDash Auto-Template, Stripe product).
3. Record the resource ID in `deployed-automations.yaml`.

### Verification

- Fetch the resource by ID and check it's active + configured as expected.
- Trigger a test event if the vendor supports it.

### Rollback

- Delete or deactivate the vendor resource.

### Edge cases

- **Vendor rate limits.** Most vendors cap create ops. The driver backs off and batches when possible.
- **Idempotent updates.** If the resource already exists (matched by a custom `external_id` field we set), the driver updates rather than creates.
- **Deprecated vendor APIs.** Each vendor driver pins an API version in `registry/stacks.json`; the driver emits a warning if pinning drifts.

## T5 — Out-of-band (deployer-hosted worker)

### Provisioning steps

1. Register the worker's schedule in the deployer's own scheduler.
2. Configure the worker with the tenant's target endpoint (on the tenant's Vercel) + HMAC.
3. Record the worker ID.

### Verification

- Trigger a one-shot run; confirm the tenant's endpoint received a signed, valid payload.

### Rollback

- Deregister the worker from the scheduler.

### Edge cases

- **Tenant endpoint down.** Worker retries 3 times with backoff; then parks events in a tenant-scoped dead-letter bucket on the deployer side (encrypted, 7-day TTL).
- **Source rate-limits.** If the public source rate-limits the worker, multiple tenants share throughput — the worker fairly round-robins.
- **Boundary concern.** T5 is the only topology where deployer infra handles tenant payloads. The worker is strict: no logging of payload bodies, only metadata.

## Choosing a topology

The catalog's trigger and data access hints determine topology. Default mapping in `scripts/parse-catalog.mjs`:

```javascript
function inferTopology(automation) {
  if (automation.trigger === 'cron') {
    if (automation.stack.includes('scraper') || automation.stack.some(isPublicRecordSource))
      return 'T5';
    return 'T1';
  }
  if (automation.trigger === 'webhook' || automation.trigger === 'crm_event') {
    if (automation.stack.length > 3) return 'T3';
    return 'T1';
  }
  if (automation.trigger === 'api' || automation.trigger === 'form_submit') {
    return 'T2';
  }
  if (automation.stack.length === 1 && isConfigurableVendor(automation.stack[0]))
    return 'T4';
  return 'T3'; // safe default
}
```

Overrides per-automation live in `registry/topology-overrides.json`.

## Driver composition

A single automation can trigger multiple drivers. Each manifest declares `drivers:` as an ordered list:

```yaml
drivers:
  - github
  - vercel
  - n8n
  - webhook-router
```

The provisioner calls each driver's `provision()` with the manifest + tenant context. Drivers can emit resources into a shared context so later drivers can reference them (e.g., the `vercel` driver emits `deploymentUrl`, which the `webhook-router` driver references).

Driver contract is documented in `deployer/lib/drivers/README.md`.
