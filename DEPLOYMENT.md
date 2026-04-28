# Deployment

## Environments

- Development: local Node execution and smoke scripts.
- Preview: Vercel preview deployment.
- Production: Vercel production deployment with Stripe, GitHub, database, and admin secrets.

## Required Production Environment

- `ADMIN_KEY`
- `GITHUB_TOKEN`
- `VERCEL_TOKEN`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `DATABASE_URL`
- `TENANT_ACTION_SECRET`
- `PAYMENT_ACCESS_SECRET`

Recommended:

- `RESEND_API_KEY`
- `DYNASTY_TOOL_CONFIG`
- `N8N_API_URL`
- `N8N_API_KEY`
- `SUITEDASH_API_KEY`
- `APPSUMO_PARTNER_ID`

## Deploy Command

```bash
npm test
npx vercel --prod
```

## Migration

Apply SQL files in `scripts/migrations` in order. The business factory queue requires `scripts/migrations/003_factory_jobs.sql`.

## Rollback

1. Promote the previous healthy Vercel deployment.
2. Disable `factory.external_execution` in the control plane or environment.
3. Stop workers from claiming `factory` queue jobs.
4. Inspect failed jobs through `GET /api/jobs/claim?queue=factory&status=failed`.
5. Requeue only after the root cause is fixed.
