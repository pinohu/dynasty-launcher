# Operator Guide

## Launch A Business Factory Run

1. Collect at least one concrete pain signal from a buyer segment.
2. Call `POST /api/business-factory` with `mode=dry_run`.
3. Review `validation.blockers`. If blockers exist, run the recommended experiments before launch.
4. Set production credentials.
5. Call `POST /api/business-factory` with `mode=launch` and `enqueue_job=true`.
6. Start a worker loop that claims from the `factory` queue.

## Worker Loop

1. `POST /api/jobs/claim` with `{ "queue": "factory", "worker_id": "worker-name" }`.
2. Execute the job payload phases in `launch_manifest.runbook_order`.
3. On success, call `POST /api/jobs/complete` with `{ "job_id": "...", "result": {...} }`.
4. On transient failure, call `POST /api/jobs/complete` with `{ "job_id": "...", "status": "failed", "error": "..." }`.
5. Exhausted jobs remain in `failed` status for operator review.

## Health Checks

- `npm run test:business-factory`
- `npm run test:jobs`
- `npm run test`

## Operating Rules

- Do not run `mode=launch` without production Stripe and Vercel credentials.
- Do not push shared tool secrets into generated customer repositories.
- Treat queue jobs as the source of truth for autonomous execution state.
- Use idempotency keys for launch jobs that may be retried by agents.
