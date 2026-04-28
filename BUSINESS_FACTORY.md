# Business Factory

The business factory converts market pain into a launchable revenue system.

## What It Generates

- Business idea and ranked alternatives.
- Pain-point extraction and demand validation.
- Money-first offer ladder: lead magnet, tripwire, core offer, recurring managed ops.
- Generated app manifest with routes, data model, and starter files.
- Landing page, SEO content, ads, and email funnel.
- Stripe catalog, entitlement rules, invoicing, affiliate tracking.
- n8n-compatible automation workflows with retry/recovery semantics.
- Vercel deployment requirements, CI checks, rollback policy, and domain requirements.
- Agent roles, callable interfaces, feedback loops, and runtime controls.

## API Entry

`POST /api/business-factory` requires an admin credential.

Minimal body:

```json
{
  "market": "HVAC service businesses",
  "target_customer": "multi-truck HVAC owners",
  "pain_signals": [
    "Missed call response is slow and causes lost revenue.",
    "Manual follow up means urgent estimate requests go cold."
  ],
  "build_profile": "micro_saas",
  "monetization_goal": "cash_first",
  "launch_channel": "partner",
  "mode": "dry_run",
  "enqueue_job": true
}
```

`dry_run` generates the complete manifest without requiring production credentials. `launch` validates production credentials and blocks with explicit errors when required systems are missing.

## Money-First Launch

Every output includes immediate monetization assets:

- Lead magnet that captures demand before app completion.
- Tripwire product that can be sold before custom build work.
- Core offer with Stripe price definitions.
- Recurring managed ops subscription.
- Affiliate mapping and attribution policy.

## Queue Integration

When `enqueue_job=true`, the API writes a `business_factory.launch` job to the `factory` queue. This gives agents and workers a durable execution contract instead of a one-shot Lambda call.
