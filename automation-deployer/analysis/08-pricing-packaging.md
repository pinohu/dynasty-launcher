# 08 — Pricing & Packaging Strategy

Converting 353 automations into sellable offers without overwhelming buyers.

## The packaging problem

Selling one automation at a time works for Solo Steve ($19 for a single compliance-reminder automation) but not for Manager Maria who wants a pack. Selling the full 353 works for nobody — there's no coherent offer.

This file defines the packaging taxonomy the deployer uses to drive pricing and the interview's "3 options" UX.

## Three packaging axes

### Axis 1 — Depth (how many automations)

| Pack | Count | Target persona | Monthly tool cost ceiling | Service fee |
|---|---|---|---|---|
| **Single** | 1 | Solo Steve exploring | $0–$20 | $19 one-time or $9/mo |
| **Starter-3** | 3 | Solo Steve, Bookkeeper Beth | $40 | $49–$99/mo service |
| **Focus-5** | 5 | Bookkeeper Beth, Marketing Mike | $80 | $99–$199/mo |
| **Growth-10** | 10 | Manager Maria, Compliance Carol | $150 | $299/mo |
| **Agency-20** | 20 | Agency Alex | $300 | $499–$799/mo |
| **Full-Stack-40+** | 40+ | Owner Omar, Startup Sam | $500+ | $999–$2,499/mo |
| **Enterprise** | 60+ per location | Franchise Fran | $1,500+ per loc | $4,999+/mo |

### Axis 2 — Vertical (which categories emphasized)

| Vertical pack | Categories emphasized |
|---|---|
| Field Service | 1, 8–11, 14, 21, 38 |
| Agency | 2, 3, 5–8, 10–11, 15, 22–24, 30–31, 39 |
| Compliance-heavy (law, accounting, healthcare) | 7, 20, 35, 37, 41, 43, 44 |
| Content/Marketing | 1, 24–28, 40, 42 |
| Ecommerce-adjacent service | 2, 15, 22, 31, 32 |
| Real estate / title | 7, 20, 35, 43, 44 |

### Axis 3 — Engagement (how much service wraps the automations)

| Engagement tier | What's included |
|---|---|
| **Self-serve** | Deployer artifacts + docs only; tenant runs everything |
| **Managed provision** | Deployer operator runs `init → deploy → verify` for the tenant |
| **Managed operation** | Above + monthly health check + one minor change per month |
| **White-glove** | Above + ad-hoc custom automations + named account manager |

## Canonical SKUs (recommended)

A 3×3×3 grid of depth × vertical × engagement is too much. Instead, a handful of canonical SKUs:

| SKU | Depth | Vertical | Engagement | Price | Primary persona |
|---|---|---|---|---|---|
| SOLO-3 | Starter-3 | General | Self-serve | $49/mo | Solo Steve |
| BOOKS-5 | Focus-5 | Compliance | Self-serve | $99/mo | Bookkeeper Beth |
| FIELD-10 | Growth-10 | Field Service | Managed provision | $399/mo | Field Service Fred |
| AGENCY-20 | Agency-20 | Agency | Managed provision | $799/mo | Agency Alex |
| CARE-10 | Growth-10 | Compliance | Managed operation | $499/mo | Compliance Carol |
| OPS-40 | Full-Stack-40+ | General | Managed operation | $1,499/mo | Owner Omar |
| BUILDER-LIFETIME | Starter-3 + templates | General | Self-serve | $299 one-time | Startup Sam |
| FRANCHISE | Enterprise | Multi-loc | White-glove | $4,999+/mo | Franchise Fran |

Each SKU maps to a preset bundle in `registry/bundles.json`.

## Integration with Dynasty Launcher tier system

Dynasty Launcher's existing tiers are:

| Tier | Price | Module count | Deployer equivalent |
|---|---|---|---|
| Foundation | $1,997 | 0 auto-modules | **SOLO-3** or **BUILDER-LIFETIME** (buy automation-deployer add-ons separately) |
| Professional | $4,997 | 11 modules | **FIELD-10** / **AGENCY-20** included as automation bundle |
| Enterprise | $9,997 | 17 modules | **OPS-40** included |
| Custom Volume | custom | All 19 mod_* | **FRANCHISE** included, per-location |

This makes the Deployer the **unbundler** for Foundation buyers (who don't auto-get modules in the Launcher) and the **bundler** for Pro+ (who get a preset automation package as part of the tier).

## Per-automation pricing granularity

For tenants who want to buy one automation at a time (Solo Steve, experimenting Startup Sam), each automation has a reference price in `registry/pricing.json`:

- `$19 one-time` — single setup, tenant runs it; no ongoing service.
- `$9/mo` — ongoing service fee for monitoring + one rotation.
- `$29/mo` — if the automation includes LLM-heavy orchestration.

Reference prices are guidance; deployment operators set actual prices.

## What the deployer does with pricing

During `deployer plan`, a cost column is added:

```
+----+----------------------+-----------+----------+-------+
| id | title                | tool cost | svc fee  | total |
+----+----------------------+-----------+----------+-------+
| 2.01 | Web form → CRM     | $0        | $9/mo    | $9    |
| 3.01 | Lead scorer        | $2/mo LLM | $9/mo    | $11   |
| 8.01 | Welcome sequence   | $0        | $9/mo    | $9    |
+----+----------------------+-----------+----------+-------+
                                     Total: $29/mo
```

The tenant confirms before `deploy` runs.

## Upsell triggers

Once deployed, the deployer can surface upsell suggestions based on:

1. **Heavy usage of X** (e.g., 2.01 at 200 submissions/mo) → suggest 3.01 (qualifier).
2. **Unused integration** (e.g., tenant connected Stripe but no 15.01) → suggest 15.01.
3. **Journey-stage progression** (tenant just passed 90 days live) → suggest SB07 automations.

Upsell prompts live in `deployer/lib/upsell.mjs` (stub — to be fleshed out as historical data accumulates).

## Refund / churn handling

If a tenant offboards:

1. `deployer rollback --tenant X --all` removes every deployed automation from the tenant's infra.
2. Credentials are left in place on the tenant's vendor accounts (they own them).
3. The tenant receives a final report of what was rolled back.
4. Data remains on tenant-owned systems.

The Deployer operator loses the service fee but the tenant keeps their data and vendor relationships — satisfying the credential-boundary policy.
