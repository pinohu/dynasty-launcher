# External Integrations Runbook

This runbook keeps provider setup moving without blocking unrelated product,
security, deployment, or orchestration work when a provider key is missing.

## Operating Rule

Missing provider credentials are external blockers, not project blockers.
Continue with app-side work, tests, deployment readiness, documentation, and
non-mutating provider checks. When a key arrives, run the readiness checker and
complete only that provider's final dashboard/API step.

## Readiness Check

Run:

```bash
npm run check:integrations -- --env-file="/path/to/.env"
```

Optional strict mode fails only for configured providers that return unexpected
errors:

```bash
npm run check:integrations -- --env-file="/path/to/.env" --strict
```

The checker does not print secret values. It treats missing keys as `pending`
so other activities can continue.

## Production Webhook URLs

Stripe billing:

```text
https://www.yourdeputy.com/api/billing/webhook
```

Formaloo form submissions:

```text
https://www.yourdeputy.com/api/automations/webhook?source=form&tenant_id=<tenant_id>&form_slug=<formaloo_form_slug>
```

Formaloo secret header:

```text
X-Formaloo-Token: <FORM_WEBHOOK_SECRET>
```

CallScaler:

```text
https://www.yourdeputy.com/api/automations/webhook?source=callscaler&tenant_id=<tenant_id>&webhook_token=<CALLSCALER_WEBHOOK_SECRET>
```

Trafft:

```text
https://www.yourdeputy.com/api/automations/webhook?source=trafft&tenant_id=<tenant_id>
Authorization: Bearer <TRAFFT_WEBHOOK_SECRET>
```

## Current Provider Notes

Stripe is configured and signed production webhook delivery has been verified.

Formaloo API access works. Four intake/research forms have active Your Deputy
webhooks bound to the test tenant so production traffic does not route into an
unknown customer tenant.

CallScaler app-side receiving is ready, but the available CallScaler keys were
not accepted by the REST API. Register the post-call webhook in the dashboard or
provide a working API token later.

Trafft app-side receiving is ready, but the available client credentials were
not accepted by Trafft's webhook API endpoint. Configure the webhook in the
dashboard or provide an API token later.

## When New Keys Arrive

1. Add the key to the shared `.env` and Vercel environments.
2. Run `npm run check:integrations -- --env-file="/path/to/.env"`.
3. Configure the provider webhook URL for the intended tenant.
4. Send one provider test event.
5. Confirm the live endpoint returns the expected status and, for accepted
   tenant-bound webhooks, that `automation_runs` records the event.
