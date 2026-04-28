# API Reference

All endpoints below require an admin credential through `x-admin-key`, `Authorization: Bearer <admin session>`, or `x-dynasty-admin-token`.

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
