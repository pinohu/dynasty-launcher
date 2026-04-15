# 01 — Catalog Synthesis

## Source: `SERVICE_BUSINESS_AUTOMATION_CATALOG.md` (353 automations, 45 categories)

This file synthesizes the catalog into actionable structure for the deployer.

## 45 categories, grouped by pipeline phase

The catalog isn't random — it tracks a full revenue/delivery lifecycle. Grouping the 45 categories by phase gives the deployer natural bundles.

### Phase 1 — Demand (categories 1–3, 45 automations)
Find prospects, capture them, qualify them.
- **1. Lead Generation & Prospecting (20)** — external scrapers, listeners, monitors. Topology: T5 (out-of-band) is dominant because most sources are public sites with IP/rate concerns.
- **2. Lead Capture & Intake (15)** — inbound forms, chat widgets, calls → CRM. Topology: T2 + T3.
- **3. Lead Qualification & Scoring (10)** — scoring engines, routing rules. Topology: T2.

### Phase 2 — Conversion (categories 4–8, 47 automations)
Turn leads into paying customers.
- **4. CRM & Contact Management (10)** — dedup, enrichment, segmentation. T1 + T4.
- **5. Sales Pipeline & Follow-Up (10)** — stage automation, follow-up drips. T4 dominant (vendor-native CRM).
- **6. Proposals, Estimates & Quoting (8)** — PDF gen, pricing engines. T2.
- **7. Contracts & Agreements (7)** — e-sign, clause libraries. T4 + T2.
- **8. Client Onboarding (10)** — welcome sequences, portal access, kickoff. T3.

### Phase 3 — Delivery (categories 9–11, 30 automations)
Do the work.
- **9. Scheduling & Appointments (10)** — booking, reminders, reschedule. T4 (Trafft, Calendly-style).
- **10. Project & Task Management (10)** — task creation from CRM, time tracking. T4.
- **11. Service Delivery & Fulfillment (10)** — checklists, photo capture, status updates. T3.

### Phase 4 — Communication (categories 12–14, 22 automations)
Cross-cutting.
- **12. Email (8)**, **13. SMS & Chat (6)**, **14. Voice & Phone (8)**. Largely T4 via Emailit / SMS-iT / CallScaler / Thoughtly.

### Phase 5 — Money (categories 15–18, 34 automations)
Get paid and keep books.
- **15. Invoicing & Billing (10)** — invoice gen, subscription mgmt. T3 (Stripe hook + Vercel API).
- **16. Payment Processing & Collections (10)** — Stripe handlers, dunning. T3.
- **17. Bookkeeping & Accounting (8)** — QBO/Xero sync. T1 (n8n sync nodes).
- **18. Payroll & Team Management (6)** — time to payroll pipelines. T1.

### Phase 6 — People (categories 19–20, 16 automations)
- **19. HR & Hiring (6)** — applicant tracking, offer letters. T2.
- **20. Compliance & Legal (10)** — deadline monitors (core of PA CROP). T1.

### Phase 7 — Reputation & support (categories 21–23, 27 automations)
- **21. Reputation & Review Management (7)** — review requests, response assistants. T3.
- **22. Customer Support & Help Desk (10)** — triage, FAQ expansion. T2.
- **23. Reporting & Analytics (10)** — dashboards, digests. T1.

### Phase 8 — Marketing (categories 24–28, 37 automations)
- **24. Content (8)**, **25. Social (6)**, **26. SEO (8)**, **27. Paid Ads (7)**, **28. Email Campaigns (8)**. Heavy mix of T1 (content pipelines) and T4 (campaign platforms).

### Phase 9 — Growth (categories 29–32, 21 automations)
- **29. Referral (5)**, **30. Upsell (5)**, **31. Retention (6)**, **32. Offboarding/Churn (5)**. Mostly T1/T4.

### Phase 10 — Operations (categories 33–38, 32 automations)
- **33. Vendors (5)**, **34. Inventory/Assets (5)**, **35. Documents (5)**, **36. Knowledge Base (5)**, **37. QA & Auditing (5)**, **38. Field Service & Dispatch (6)**.

### Phase 11 — Experience (categories 39–42, 26 automations)
- **39. Client Portal (7)**, **40. Data Enrichment (7)**, **41. Security (5)**, **42. Website Ops (7)**.

### Phase 12 — Specialized (categories 43–45, 19 automations)
- **43. Business Formation (5)** — the PA CROP sweet spot.
- **44. Insurance & Risk (4)** — underwriting helpers, policy trackers.
- **45. AI Agent & Workflow Orchestration (10)** — meta-automations that orchestrate other automations.

## Cross-cutting patterns

### Pattern A — "Monitor → Alert → Draft"
Shows up in 1.01, 1.02, 1.03, 1.08, 1.11, 1.17, 1.19, 20.* (compliance), 40.* (enrichment). A cron job polls a source, diffs against a stored state, fires an alert, and optionally drafts a response.
Reusable manifest template: `manifests/_patterns/monitor-alert-draft.yaml`.

### Pattern B — "Form → Enrich → Route"
Shows up in 2.*, 3.*, 8.*, 19.*. An inbound form hits a Vercel endpoint, enrichment APIs fire in parallel, the result hits the tenant's CRM with scoring.
Reusable: `manifests/_patterns/form-enrich-route.yaml`.

### Pattern C — "Trigger → Generate → Publish → Distribute"
The content pipeline — 19 in the PA CROP inventory, 24.*, 25.*, 26.* in the catalog. AI generates an asset, it's published to a CMS, and distributed to social/email.
Reusable: `manifests/_patterns/content-pipeline.yaml`.

### Pattern D — "Webhook → Transform → Fanout"
Stripe webhook → invoice + CRM + Slack + portal update. 15.*, 16.*, 31.*.
Reusable: `manifests/_patterns/webhook-fanout.yaml`.

### Pattern E — "Schedule → Query → Digest"
Weekly ops digest, monthly newsletter. 23.*, 28.*, 31.*.
Reusable: `manifests/_patterns/schedule-digest.yaml`.

### Pattern F — "Deadline → Countdown → Escalate"
Compliance deadlines, renewal reminders. 20.*, 31.*, 43.*.
Reusable: `manifests/_patterns/deadline-escalate.yaml`.

~80% of the 353 automations fit into one of these 6 patterns. The pattern scaffolds mean ~280 of the 353 manifests can be auto-drafted from a pattern + automation metadata.

## Hotspots & cold spots

**Hotspots** (category × persona density): Lead gen × Startup Sam, Scheduling × Field Service Fred, Compliance × Compliance Carol, Invoicing × Solo Steve. These get the richest manifests and UX.

**Cold spots** (few personas, few automations): Insurance & Risk (44), Payroll (18). Ship minimal manifests; depth comes later.

## Inventory signal from PA CROP

`MARCH_2026_AUTOMATIONS_INVENTORY.md` lists 146 automations actually in production. 113 are deployed, 17 are n8n workflow exports. The ratio of live:specified is ~5:1, which is a realistic production state — meaning any tenant deployment will also be 5:1 automation:manual-action at steady state. The deployer's `MANUAL-ACTIONS.md` output for each tenant is therefore **expected content**, not a failure mode.

## Gotchas discovered while synthesizing

1. **Auth mismatch in 14.* (voice/phone).** Some automations assume CallScaler, others Thoughtly, others Insighto. The deployer's `stacks.json` normalizes these so a tenant picks one voice provider and automations map to whichever the tenant has.

2. **SuiteDash drift.** Category 4 (CRM) assumes SuiteDash throughout but agency and field-service personas often use HubSpot / ServiceTitan. The manifest schema supports a `vendor_variant:` field so a single automation can declare SuiteDash + HubSpot + ServiceTitan alternatives.

3. **Public-record automations are jurisdictionally narrow.** 1.03, 1.11, 1.17, 1.19 work for Pennsylvania today via PA DOS / PACER. Scaling requires per-state adapters under `deployer/lib/adapters/jurisdictions/`.

4. **LLM costs are a hidden tenant expense.** 45.* (orchestration), 22.* (chatbots), 24.* (content) all assume LLM access. The manifest schema requires `estimated_monthly_tokens:` so the deployer can warn the tenant.

See `analysis/02-automation-taxonomy.md` for the formal taxonomy.
