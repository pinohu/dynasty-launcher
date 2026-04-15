# All 45 Categories — At a Glance

Single-file reference for every category in the catalog. Each row ties to:

- Automation count
- Default topology
- Anchor automations (1–3 highest-impact in category)
- Required core stack
- Best-fit personas
- Deployment notes / gotchas

| # | Category | N | Topology | Anchors | Core stack | Best personas | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Lead Generation & Prospecting | 20 | T5 | 1.01 GBP, 1.03 SOS filings, 1.13 email finder | n8n + scraper + Hunter/Apollo | Startup Sam, Marketing Mike, Owner Omar | Jurisdictional adapters needed; rate-limit sensitive |
| 2 | Lead Capture & Intake | 15 | T2/T3 | 2.01 form→CRM, 2.04 chatbot intake, 2.08 doc upload | Vercel + CRM + AI | All | Foundation for ~40 downstream automations |
| 3 | Lead Qualification & Scoring | 10 | T2 | 3.01 scorer, 3.04 duplicate detect, 3.07 intent signal | Vercel + LLM + CRM | Solo Steve, Manager Maria | Depends on 2.01 |
| 4 | CRM & Contact Management | 10 | T1/T4 | 4.01 sync, 4.02 dedup, 4.05 enrichment | n8n + CRM API | Manager Maria, Agency Alex | Vendor-variant (SuiteDash/HubSpot/ServiceTitan) |
| 5 | Sales Pipeline & Follow-Up | 10 | T4 | 5.01 auto-advance, 5.04 stalled follow-up, 5.07 meeting prep | CRM + email/SMS | Owner Omar, Agency Alex | Mostly vendor-native |
| 6 | Proposals, Estimates & Quoting | 8 | T2 | 6.01 PDF gen, 6.02 pricing calc, 6.05 proposal analytics | Documentero + CRM + Stripe | Agency Alex, Owner Omar | Links to 7.* |
| 7 | Contracts & Agreements | 7 | T2/T4 | 7.01 template fill, 7.03 e-sign, 7.05 clause library | Documentero + e-sign | Compliance Carol, Agency Alex | Regulated data class |
| 8 | Client Onboarding | 10 | T3 | 8.01 welcome, 8.02 portal access, 8.04 kickoff scheduler | CRM + Email + Portal + Calendar | All | High-value for agencies |
| 9 | Scheduling & Appointments | 10 | T4 | 9.01 booking, 9.03 reminders, 9.07 no-show reschedule | Trafft / Calendly | Solo Steve, Field Service Fred | Vendor-variant |
| 10 | Project & Task Management | 10 | T4 | 10.01 task from CRM, 10.04 time tracking, 10.08 project completion | SuiteDash / Asana / Monday | Manager Maria, Agency Alex | Vendor-variant |
| 11 | Service Delivery & Fulfillment | 10 | T3 | 11.01 checklist runner, 11.04 photo capture, 11.07 client status update | Mobile-friendly; SuiteDash portal | Field Service Fred, Agency Alex | Mobile UX emphasis |
| 12 | Email (Transactional) | 8 | T4 | 12.01 send, 12.03 template variables, 12.06 delivery tracking | Emailit / Postmark | All | Shared infra |
| 13 | SMS & Chat | 6 | T4 | 13.01 SMS send, 13.03 2-way conversation, 13.05 chat widget | SMS-iT / Twilio | Field Service Fred, Solo Steve | A2P registration needed |
| 14 | Voice & Phone | 8 | T4 | 14.01 call tracking, 14.02 voice AI, 14.05 transcription | CallScaler + Insighto/Thoughtly | Field Service Fred, Solo Steve | Pick one voice vendor |
| 15 | Invoicing & Billing | 10 | T3 | 15.01 invoice from Stripe, 15.04 subscription mgmt, 15.07 tax calc | Stripe + Documentero | Solo Steve, Bookkeeper Beth | Financial class |
| 16 | Payment Processing & Collections | 10 | T3 | 16.01 Stripe webhook, 16.04 dunning, 16.07 refund handler | Stripe + Email + SMS | Bookkeeper Beth, Owner Omar | Financial class; HMAC required |
| 17 | Bookkeeping & Accounting | 8 | T1 | 17.01 QBO sync, 17.04 categorization, 17.07 reconciliation | QBO/Xero + n8n | Bookkeeper Beth | Financial class |
| 18 | Payroll & Team Management | 6 | T1 | 18.01 time→payroll, 18.03 commission calc | Gusto/ADP + Sheets | Manager Maria, Franchise Fran | Regulated data class |
| 19 | HR & Hiring | 6 | T2 | 19.01 ATS intake, 19.04 resume parse, 19.06 offer letter | ATS + Documentero + Email | Owner Omar, Franchise Fran | PII-heavy |
| 20 | Compliance & Legal | 10 | T1 | 20.01 deadline monitor, 20.03 filing reminder, 20.07 license tracker | n8n + jurisdictional APIs + Email | Compliance Carol | Jurisdictional adapters; see cat-20 deep dive |
| 21 | Reputation & Review Management | 7 | T3 | 21.01 review request, 21.03 response assistant, 21.06 monitor | CRM + Email/SMS + LLM | Solo Steve, Owner Omar, Marketing Mike | Vendor-variant (NiceJob alt) |
| 22 | Customer Support & Help Desk | 10 | T2 | 22.01 ticket intake, 22.04 AI triage, 22.07 escalation | Ticketing + LLM | Manager Maria, Agency Alex | Depends on 2.*/22.01 |
| 23 | Reporting & Analytics | 10 | T1 | 23.01 ops digest, 23.04 launch dashboard, 23.07 partner report | n8n + PostHog + Email | Owner Omar, Manager Maria | Needs data to exist first |
| 24 | Marketing — Content | 8 | T1 | 24.01 blog pipeline, 24.03 FAQ expansion, 24.06 repurpose | LLM + CMS + Social | Marketing Mike, Agency Alex | High LLM cost |
| 25 | Marketing — Social Media | 6 | T4 | 25.01 schedule, 25.03 engage, 25.05 hashtag research | Vista Social + Buffer | Marketing Mike | Vendor-variant |
| 26 | Marketing — SEO | 8 | T1 | 26.01 content planner, 26.03 rank tracker, 26.06 competitor analysis | WriterZen + NeuronWriter + GSC | Marketing Mike, Startup Sam | Long time-to-value |
| 27 | Marketing — Paid Advertising | 7 | T4 | 27.01 campaign launcher, 27.04 bid optimizer, 27.06 creative rotator | Google/Meta Ads APIs | Owner Omar, Marketing Mike | Vendor-specific |
| 28 | Marketing — Email Campaigns | 8 | T4 | 28.01 newsletter, 28.03 segment, 28.06 A/B | Acumbamail / Mailchimp | Marketing Mike | Vendor-variant |
| 29 | Referral & Affiliate | 5 | T4 | 29.01 referral launcher, 29.03 commission tracking | Referral tool + CRM | Agency Alex, Owner Omar | |
| 30 | Upselling & Cross-Selling | 5 | T1 | 30.01 opportunity scorer, 30.03 trigger-based offer | CRM + LLM + Email | Owner Omar, Agency Alex | |
| 31 | Client Retention & Renewals | 6 | T1 | 31.01 check-in, 31.03 renewal reminder, 31.06 NPS | CRM + Email/SMS | All | |
| 32 | Client Offboarding & Churn | 5 | T3 | 32.01 exit workflow, 32.03 diagnostic, 32.05 data export | CRM + Email + Storage | Agency Alex, Bookkeeper Beth | |
| 33 | Vendor & Supplier Management | 5 | T1 | 33.01 PO workflow, 33.03 contract renewal | n8n + email | Owner Omar, Franchise Fran | |
| 34 | Inventory, Equipment & Assets | 5 | T1 | 34.01 stock reorder, 34.03 maintenance schedule | n8n + sheets/inventory tool | Field Service Fred | |
| 35 | Document Management | 5 | T1 | 35.01 auto-classify, 35.03 retention policy | n8n + storage + LLM | Compliance Carol, Bookkeeper Beth | |
| 36 | Knowledge Base & Training | 5 | T1 | 36.01 KB article from ticket, 36.03 onboarding checklist | CMS + LLM | Manager Maria | |
| 37 | Quality Assurance & Auditing | 5 | T1 | 37.01 audit runner, 37.03 QA checklist, 37.05 call scoring | LLM + call recording | Franchise Fran, Agency Alex | |
| 38 | Field Service & Dispatch | 6 | T3 | 38.01 dispatch, 38.03 route optimize, 38.05 photo-backed work order | ServiceTitan/Housecall + GPS | Field Service Fred | See cat-38 deep dive |
| 39 | Client Portal & Self-Service | 7 | T2 | 39.01 login, 39.03 document upload, 39.05 billing self-serve | SuiteDash / custom portal | Agency Alex, Compliance Carol | Depends on SB02 |
| 40 | Data Enrichment & Intelligence | 7 | T1 | 40.01 contact enrich, 40.04 firmographic, 40.06 intent data | Hunter/Apollo + BuiltWith | Owner Omar, Startup Sam | |
| 41 | Security & Access Control | 5 | T2 | 41.01 MFA enforcement, 41.03 access review | Clerk/Auth0 + SIEM | Compliance Carol, Franchise Fran | Foundation for regulated data |
| 42 | Website & Landing Page Operations | 7 | T2 | 42.01 uptime, 42.03 sitemap, 42.05 A/B tests | Vercel + Analytics | Marketing Mike, Startup Sam | |
| 43 | Business Formation & Entity Management | 5 | T1 | 43.01 entity monitor, 43.03 filing workflow | PA DOS / state APIs | Compliance Carol | PA-specific today; multi-state roadmap |
| 44 | Insurance & Risk | 4 | T1 | 44.01 policy tracker, 44.03 COI verification | Insurance vendor APIs | Franchise Fran, Field Service Fred | Thinnest category |
| 45 | AI Agent & Workflow Orchestration | 10 | T1/T2 | 45.01 orchestrator, 45.03 multi-agent, 45.07 observability | LLM + n8n + deployer | Startup Sam, Owner Omar | See cat-45 deep dive |

## Interpreting the topology column

- **T1** — pure n8n. Most scheduled and integration tasks.
- **T2** — Vercel serverless. Synchronous user-facing APIs.
- **T3** — Hybrid (Vercel → n8n). Fast response + long-running orchestration.
- **T4** — Vendor-native. Configuration in SuiteDash, Stripe, etc.
- **T5** — Out-of-band (deployer-hosted worker). Public-record scraping.

## Using this table

`registry/categories.json` has the same data machine-readable. The CLI's `deployer categories` command prints this as a table filtered by persona, topology, or stack.
