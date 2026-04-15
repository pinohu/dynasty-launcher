# API endpoints

Vercel-compatible serverless endpoints that expose the deployer as HTTP.
Designed so a Next.js/Vercel project can import this folder's handlers directly,
or deploy this folder as a standalone Vercel project.

| Path | Handler | Purpose |
|---|---|---|
| `/api/provision` | `provision.js` | Trigger a deployment for a tenant (plan or deploy mode) |
| `/api/tenants` | `tenants.js` | List or fetch tenant metadata (authenticated) |
| `/api/webhook-router` | `webhook-router.js` | Central ingress for automation webhooks with HMAC verification |
| `/api/health` | `health.js` | Health ping |

## Auth

All endpoints except `/api/health` require an admin key via `Authorization: Bearer <ADMIN_KEY>`. Set `DEPLOYER_ADMIN_KEY` in the Vercel env.

## Notes

- These endpoints are the same logic the CLI runs, but invoked over HTTP so a
  dashboard or external orchestrator can drive the deployer.
- The webhook-router does NOT process payloads — it verifies signatures and
  forwards to the tenant's own endpoint. The deployer never stores tenant-
  customer payloads.
