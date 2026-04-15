# 02 — Automation Taxonomy

A formal, multi-axis taxonomy the deployer uses to reason about the 353 automations.

## Axes

Every automation is tagged on **10 axes**. Tags are the primary input to the selector (persona fit scoring), the planner (dependency resolution), and the provisioner (driver selection).

### A1. Category (1 of 45)
The functional bucket from the catalog. Stable, rarely changes.

### A2. Topology (T1–T5)
Where it runs. See `DEPLOYMENT_MODEL.md`.

### A3. Trigger type
- `cron` (scheduled)
- `webhook` (event-driven inbound)
- `api` (on-demand HTTP)
- `ui` (button in a portal/admin)
- `crm_event` (CRM tag/stage/field change)
- `email_received` (inbox rule)
- `form_submit` (explicit form webhook)
- `manual` (operator runs it)

### A4. Output type
- `alert` (email/SMS/slack notification)
- `record` (created/updated row in CRM/DB)
- `artifact` (PDF, image, video, audio file)
- `content` (blog post, social post, email)
- `decision` (score, classification, route)
- `action` (external system change — invoice created, appointment booked)
- `digest` (periodic summary)

### A5. Stack
Required tools (from `registry/stacks.json`). Each tool has an `oss | vendor | either` tag.

### A6. Persona fit
Weighted match for each of 19 personas: `{ solo_steve: 0.9, manager_maria: 0.3, ... }`.
Source: the UX Bible Part 1 "primary_automation_categories" mapping, expanded.

### A7. JTBD clusters
Which of J01–J26 this automation advances.

### A8. Service blueprint episodes
Which of SB00–SB08 this automation participates in.

### A9. Journey stages
Which stages in journey A/B/C/D this automation serves (A1, A4, B6, C7, D2, etc.).

### A10. Data sensitivity
- `public` — only works with public data
- `internal` — tenant's own business data
- `customer_pii` — tenant's customers' personal info
- `financial` — money-handling
- `regulated` — HIPAA/PCI/etc. applies

## Tag propagation

When the catalog MD is parsed:
1. A1 (category) is extracted from the `## N. <name>` heading above the entry.
2. A3 (trigger) is extracted from the `**Trigger:**` line.
3. A4 (output) is inferred from verbs in `**Output:**` (`alert → alert`, `PDF → artifact`).
4. A5 (stack) is extracted from `**Stack:**` with fuzzy matching against `stacks.json`.
5. A2 (topology) is derived: default mapping (cron → T1, webhook → T3, api → T2). Manual overrides go in `registry/topology-overrides.json`.
6. A6 (persona fit) is seeded from the UX Bible Part 1 persona-to-category mapping and refined per-automation as UX Bible parts 1–7 are mined.
7. A7/A8/A9 are seeded from `JTBD_JOURNEYS_AND_SERVICE_BLUEPRINTS.md` coverage matrices (§7–8).
8. A10 defaults to `internal` unless the automation mentions public-record sources (→ `public`) or payments/invoicing (→ `financial`) or PII fields (→ `customer_pii`).

## Example: automation 1.01

```json
{
  "id": "1.01",
  "slug": "gbp-monitor",
  "title": "Google Business Profile Monitor",
  "category_id": 1,
  "category": "Lead Generation & Prospecting",
  "topology": "T1",
  "trigger_type": "cron",
  "trigger_detail": "daily",
  "output_type": ["alert"],
  "stack": ["n8n", "google_business_api", "emailit"],
  "persona_fit": {
    "solo_steve": 0.7,
    "manager_maria": 0.8,
    "owner_omar": 0.5,
    "agency_alex": 0.9,
    "marketing_mike": 0.95
  },
  "jtbd": ["J19", "J21"],
  "service_blueprint": ["SB05", "SB06"],
  "journey_stages": ["D4"],
  "data_sensitivity": "public"
}
```

## Relationships between automations

Beyond tags, automations have first-class relationships stored in `registry/relationships.json`:

### R1. `depends_on`
Hard dependency — B cannot run without A. E.g., 8.04 (welcome email) depends on 2.01 (form → CRM) because there's no contact to email otherwise.

### R2. `enhances`
Soft dependency — B is more valuable when A is present. E.g., 3.01 (lead qualifier) enhances 2.01.

### R3. `replaces`
Mutual exclusion — picking A means not picking B. E.g., 14.02 (Thoughtly voice agent) replaces 14.03 (Insighto voice agent) for a given tenant.

### R4. `chains_with`
Outputs of A commonly feed into B. Not a dependency, but the planner surfaces the pairing. E.g., 19.04 (resume parser) chains with 19.05 (candidate scorer).

### R5. `conflicts_with`
Running both causes double-fire. E.g., 12.01 (welcome email from CRM) conflicts with 28.01 (welcome email from marketing platform) — pick one source of truth.

The planner uses R1 to order deploys, R3/R5 to raise errors during `plan`, and R2/R4 to populate the UX's "consider adding" suggestions.

## Bundles

Three canonical bundles live in `registry/bundles.json`:

### Starter-3 (for Solo Steve, Bookkeeper Beth, Compliance Carol)
3 automations that earn their keep in week one. Default selection: 2.01 (form→CRM), 9.01 (booking reminders), 15.01 (invoice gen).

### Growth-10 (for Manager Maria, Agency Alex, Owner Omar)
10 automations spanning acquisition, onboarding, delivery, and retention.

### Full-Stack-40+ (for Franchise Fran, Startup Sam)
Opinionated selection of ~40 automations that together constitute a complete ops stack.

Bundle selection shortcuts the interview for operators who know what they want.

## Extension

Adding a new axis is a schema change plus a migration over `automations.json`. Axes are designed to be additive — nothing downstream breaks if an axis is added and populated later.
