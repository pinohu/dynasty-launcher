# Category 38 — Field Service & Dispatch

6 automations. Anchor category for `Field Service Fred` persona. Representative of industry-specific categories with heavy mobile UX and hardware integration.

## Automations

| ID | Title | Trigger | Topology | Notes |
|---|---|---|---|---|
| 38.01 | Dispatch Auto-Assign | CRM event (new job) | T3 | Respects tech availability, location, skill |
| 38.02 | Route Optimization | cron daily 6am | T1 | Bulk optimize the day's routes |
| 38.03 | ETA Auto-Update to Customer | GPS event | T3 | SMS/email from tech mobile app |
| 38.04 | Photo-Backed Work Order | tech action | T2 | Upload → classify → attach to job |
| 38.05 | Parts & Inventory Sync | event-based | T1 | Truck stock ↔ warehouse |
| 38.06 | Service Recap → Customer Digest | job completion | T3 | Auto-email summary + photos |

## Why field service is its own design space

- **Mobile-first.** Techs use phones; the automations have to tolerate poor connectivity, offline writes, and async upload.
- **Hardware integrations.** GPS, mobile scanners, parts vending machines. The deployer treats these as T4 vendor integrations but many are custom middleware.
- **High-stakes realtime.** A customer calling "where's the tech?" needs an answer in under 15s.
- **Vendor lock-in.** ServiceTitan, Housecall Pro, FieldEdge dominate; each has a different API shape. `vendor_variant:` is mandatory on every 38.* manifest.

## Stack options

| Vendor | Strength | Deployer support |
|---|---|---|
| ServiceTitan | HVAC/plumbing, deep | Reference implementation |
| Housecall Pro | SMB-friendly | Full |
| FieldEdge | HVAC | Partial |
| SuiteDash custom | Low cost | Fallback; limited mobile |
| Jobber | Landscaping, cleaning | Full |

The selector asks the tenant which they use (or plan to adopt) during the interview.

## Deployment flow

1. Authenticate against the chosen vendor's API (PAT or OAuth).
2. Deploy 38.01 (dispatch) first — other automations reference its state model.
3. Deploy 38.02 and 38.03 together (they share GPS event hooks).
4. 38.04 depends on the mobile app surface — confirm techs have the app installed.
5. 38.06 is optional but adds the most to customer satisfaction.

## Edge cases

- **GPS drift.** If a tech's phone GPS is unreliable, 38.02 and 38.03 degrade quietly (no wrong ETAs, just no ETA updates). A manifest flag `allow_gps_gap: true` is default.
- **Parts sync conflicts.** 38.05 needs conflict resolution when warehouse and truck counts disagree. Default: truck wins (hands-on ground truth).
- **Customer response time.** 38.03 SMS delivery can be 30–120s. The deployer prefers SMS-iT or Twilio over email for ETAs.

## Related categories

- Cat-9 (Scheduling) — upstream.
- Cat-11 (Service Delivery & Fulfillment) — partial overlap (checklists, photos). 38.04 extends 11.04.
- Cat-14 (Voice) — the tech-answering line often triggers 38.01 re-assignment.
- Cat-34 (Inventory) — upstream to 38.05.
- Cat-21 (Reputation) — 38.06 → 21.01 (post-service review request).

## Recommended bundle for Field Service Fred

- 38.01 dispatch (foundation)
- 38.02 route optimize
- 38.03 ETA updates
- 38.04 photo-backed work order
- 38.06 service recap
- (plus 9.01 booking from Cat-9 and 21.01 review request from Cat-21)

Total: ~7 automations, $99–$299/mo service fee typical.
