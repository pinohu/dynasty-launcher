# Dynasty Launcher Architecture

Dynasty Launcher is a Vercel-hosted business automation and launch control plane.

## Layers

- Core system: `api/business-factory.js`, `api/_business_factory.mjs`, `api/provision.js`, `api/orchestrate.js`.
- Product generation: static marketplace pages, `product/**/*.json`, `templates/workflow-templates/**/*.json`, generated app manifests from the business factory engine.
- Business operations: tenant APIs in `api/tenants`, event automation in `api/events`, workflow webhooks in `api/automations`.
- Revenue system: Stripe checkout and webhook APIs under `api/billing`, legacy checkout in `api/checkout.js`, revenue catalog output from `api/_business_factory.mjs`.
- Delivery system: `api/provision.js`, `vercel.json`, GitHub/Vercel repair helpers, migration-backed job queue in `api/jobs`.
- AI and agent system: `api/ai.js`, `api/ai-sdk.js`, `api/orchestrate.js`, and agent-callable interfaces declared by the business factory output.
- Control system: `api/admin`, `api/health`, `api/events`, feature flags, and queue status via `api/jobs/claim.js`.

## Execution Flow

1. A privileged operator or agent calls `POST /api/business-factory`.
2. The engine scores pain, intent, market fit, revenue potential, delivery fit, and deployment readiness.
3. The response includes an idea, validation report, offer, generated app files, funnel, Stripe catalog, automation workflows, deployment contract, agent roles, and control metrics.
4. When `enqueue_job=true` and the run is not blocked, the API creates a `business_factory.launch` job in the `factory` queue.
5. Workers claim jobs through `POST /api/jobs/claim`, execute the launch phases, then call `POST /api/jobs/complete`.
6. Failures are retried up to `max_attempts`; exhausted jobs remain visible as `failed`.

## Reliability Boundary

The factory never silently launches with missing credentials. `mode=launch` requires `ADMIN_KEY`, `GITHUB_TOKEN`, `VERCEL_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `DATABASE_URL`. Missing values produce a blocked response with explicit blockers.
