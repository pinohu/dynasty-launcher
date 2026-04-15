# 04 — JTBD to Automation Map

Source: `JTBD_JOURNEYS_AND_SERVICE_BLUEPRINTS.md` §1–8.

## The 26 JTBD clusters

The source doc defines 26 jobs-to-be-done at the tenant level. The deployer maps each cluster to a set of catalog automations that "move the needle" on that job.

| ID | Cluster | Automation categories that serve it |
|---|---|---|
| J01 | Situation recognition | 40 (data enrichment), 42 (website ops) |
| J02 | Problem framing & scope control | 6 (proposals), 7 (contracts) |
| J03 | De-risking & validation | 3 (qualification), 23 (analytics), 37 (QA) |
| J04 | Market, competition, positioning | 1 (prospecting), 26 (SEO), 40 (enrichment) |
| J05 | Business model & economics | 15–17 (billing/accounting), 23 (analytics) |
| J06 | Brand, narrative, trust | 21 (reputation), 24 (content), 25 (social) |
| J07 | Product definition | N/A (pre-automation) |
| J08 | Experience & interface spec | 39 (client portal), 42 (website) |
| J09 | Content & copy production | 24 (content), 26 (SEO) |
| J10 | Technical strategy | N/A (pre-automation) |
| J11 | Implementation: software creation | N/A (pre-automation) |
| J12 | Repo & engineering hygiene | N/A (Launcher domain) |
| J13 | Release engineering | N/A (Launcher domain) |
| J14 | Deployment & infra ops | 41 (security), 42 (website ops) |
| J15 | Identity, access, security ops | 41 (security) |
| J16 | Data layer ops | 4 (CRM), 40 (enrichment) |
| J17 | Monetization ops (payments) | 15 (invoicing), 16 (payments), 17 (bookkeeping) |
| J18 | Comms ops (email/SMS/voice/chat) | 12, 13, 14, 28 |
| J19 | Growth systems (analytics, CRM, SEO, booking) | 1, 4, 9, 23, 26 |
| J20 | Ongoing product iteration | 37 (QA), 23 (analytics) |
| J21 | Customer support & success | 22 (help desk), 31 (retention) |
| J22 | Governance, procurement, alignment | 7 (contracts), 20 (compliance), 41 (security) |
| J23 | Transfer & continuity (handoff) | 32 (offboarding), 35 (docs), 36 (KB) |
| J24 | Emotional jobs (anxiety, confidence) | 23 (dashboards), 31 (check-ins), 45 (AI agent) |
| J25 | Social jobs (competence, credibility) | 21 (reviews), 23 (reports), 36 (KB) |
| J26 | Personal constraints (time, budget, skill) | 45 (AI agent — "do it for me") |

## Journey-map A (outcome-led) stage-by-stage

From §2 of the source. Each stage ties JTBD clusters to the automations that deliver.

| Stage | JTBD | Example automations to queue |
|---|---|---|
| A1 Discover | J01, J04, J24, J25, J26 | None (pre-onboarding) |
| A2 Evaluate | J02, J22, J24 | None |
| A3 Commit | J05, J22, J24 | 15.01 (invoice gen for the tenant themselves) |
| A4 Intake | J02, J07, J26 | 2.01 (form), 2.02 (phone intake), 2.04 (chatbot intake) |
| A5 Strategize | J03, J04, J06, J24 | 1.10 (tech detector), 1.12 (ad library), 40.01 (enrichment) |
| A6 Specify | J07, J08, J09, J22 | 6.01 (proposal PDF), 7.01 (contract template) |
| A7 Build | J10–J13, J24 | N/A |
| A8 Deploy | J14, J23, J24 | 42.01 (DNS/SSL check), 42.03 (sitemap) |
| A9 Configure | J15, J16, J17, J23, J26 | 41.01 (MFA), 4.01 (CRM sync), 15.02 (subscription mgmt) |
| A10 Integrate | J17–J19, J21 | 12.01, 13.01, 14.01, 22.01, 28.01 |
| A11 Operate | J20, J21 | 23.01 (weekly ops digest), 37.01 (QA audit), 45.01 (orchestrator) |

## Service-blueprint-to-automation map

From §6 "SB00–SB08 episode index."

| SB | Episode | Automations that execute this episode |
|---|---|---|
| SB00 | Awareness & trust formation | 21 (reviews), 24 (content), 25 (social), 26 (SEO) |
| SB01 | Evaluation & pricing gate | 6 (proposals), 5 (pipeline) |
| SB02 | Commitment & onboarding | 8 (onboarding), 15 (invoicing first invoice) |
| SB03 | Strategy & design intake | 2 (intake), 3 (qualification) |
| SB04 | Build & validation | N/A (Launcher) |
| SB05 | Deploy & verify | 14 (voice for client check-ins), 23 (launch dashboard) |
| SB06 | Integrate modules | 12–18 (all ops categories) |
| SB07 | Operate & iterate | 23, 31, 37, 45 |
| SB08 | Sustain & transfer | 32, 33, 35, 36 |

## Coverage matrix (JTBD × category)

The full 26×45 matrix is in `registry/jtbd-coverage.json`. Headline coverage:

- **Fully covered** (J17–J21): multiple categories per JTBD, rich automation depth.
- **Partial** (J01–J06, J22–J26): one or two categories; adequate for B2B service businesses but thin for product businesses (out of scope).
- **N/A** (J07–J13): Launcher's domain, not automation-level.

## How the deployer uses JTBD

### In the interview

The 6-question interview also asks "which of these jobs feels most painful right now?" with 8 options that map to JTBD clusters. This gives a second-signal check on persona alignment — a Solo Steve who picks J22 (governance) probably isn't actually Solo Steve.

### In the plan

The planner groups the selected automations by JTBD cluster and produces a "what-you-get" document for each cluster. This is the tenant-facing description of why each automation is in their pack.

### In verify

Each JTBD cluster has an observable outcome (e.g., J17: "every paid invoice produces a GL entry in tenant's books within 5 min"). The verifier generates synthetic events across the cluster's automations and measures end-to-end.

## Gaps

- J07–J13 (product build) are outside the automation domain; tenants who need these should be routed to Dynasty Launcher's full build flow.
- J24 (emotional jobs) is hard to automate alone; it's the side-effect of several automations running reliably. The deployer surfaces **reliability metrics** (uptime, deadline-hit-rate) as the tenant-facing J24 payoff.
- J26 (personal constraints — time/budget) is the selector's input, not a cluster to deploy against. It caps the budget ceiling.
