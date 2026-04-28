# API Reference

Admin endpoints below require an admin credential through `x-admin-key`, `Authorization: Bearer <admin session>`, or `x-dynasty-admin-token`. Public launch endpoints are explicitly marked public.

## POST `/api/business-factory`

Generates a complete business launch manifest.

Important fields:

- `market`: target market.
- `target_customer`: buyer segment.
- `pain_signals`: evidence strings.
- `monetization_goal`: `lead_first`, `cash_first`, or `subscription_first`.
- `launch_channel`: `seo`, `cold_email`, `paid_ads`, `affiliate`, `appsumo`, or `partner`.
- `build_profile`: `micro_saas`, `directory`, `info_product`, or `service_funnel`.
- `mode`: `plan`, `dry_run`, or `launch`.
- `enqueue_job`: when true, queues a `business_factory.launch` job if the run is not blocked.

Responses:

- `200`: generated successfully.
- `400`: invalid input.
- `401`: admin credential missing.
- `409`: `mode=launch` blocked by missing launch credentials.

## POST `/api/jobs/enqueue`

Creates a durable job.

```json
{
  "type": "business_factory.launch",
  "queue": "factory",
  "priority": 90,
  "max_attempts": 3,
  "idempotency_key": "business_factory:hvac:launch",
  "payload": {}
}
```

## POST `/api/jobs/claim`

Claims the next due job.

```json
{
  "queue": "factory",
  "worker_id": "worker-a",
  "lease_ms": 300000
}
```

## GET `/api/jobs/claim`

Lists jobs.

Query parameters:

- `queue`
- `status`
- `limit`

## POST `/api/jobs/complete`

Completes or fails a job.

Success:

```json
{ "job_id": "job_...", "result": { "deployed": true } }
```

Failure with retry:

```json
{
  "job_id": "job_...",
  "status": "failed",
  "error": "temporary provider outage",
  "retry_delay_ms": 60000
}
```

## Deliverable Fulfillment

### GET `/api/deliverables/provision?offer=<offer_id>`

Publicly returns the credential schema and required customer inputs for a paid deliverable.

### POST `/api/deliverables/provision`

Creates the tenant, stores encrypted customer credentials, activates modules, builds the live launch runtime, and returns the customer launch URL. Requires either an admin credential or a signed paid access token in `Authorization: Bearer <pay:...>` or `x-dynasty-access-token`.

### GET `/api/deliverables/launch?launch_id=<launch_id>`

Public runtime endpoint used by launched deliverable pages. It returns public launch metadata only. It does not return captured leads, tenant IDs, or credentials.

### POST `/api/deliverables/launch`

Public lead-capture endpoint for a launched deliverable. It rate-limits repeated submissions, rejects oversized or spam-shaped payloads, and returns only a redacted lead receipt.

### GET `/api/deliverables/leads?launch_id=<launch_id>`

Private lead list for operators and tenant owners. Requires admin auth or a signed tenant credential for the launch tenant.

## Production Auth Boundary

Production requires dedicated secrets for each trust boundary:

- `TENANT_ACTION_SECRET` signs tenant action tokens.
- `PAYMENT_ACCESS_SECRET` signs paid access tokens.
- `FULFILLMENT_ENCRYPTION_KEY` or `CREDENTIAL_VAULT_KEY` encrypts fulfillment credentials.

Admin, payment, tenant, Stripe, and encryption secrets must not be reused in production.
