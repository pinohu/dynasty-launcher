# Pain point master map — Your Deputy / Dynasty Launcher

**Purpose:** Exhaustive enumeration of **customer and operator pains** that the **fully designed** product output is intended to address, plus a **traceability matrix** (pain → persona → deliverable → tier / archetype → delivery mode).

**Scope boundary — “full designed output”:** This map follows **`DYNASTY_LAUNCHER_V3_FINAL.md`**, **`CLAUDE.md`**, **`V4_INVESTOR_FEEDBACK.md`**, and **`index.html`** / FAQ positioning. It describes **intent and specified artifacts**, not a guarantee that every row is **fully automated in production today** (see `CLAUDE.md`: Phases 9–20 and several `mod_*` integrations remain **to build or partial**). Use **`BUILD-MANIFEST.json`**, **`OPERATIONS.md`**, and tier/archetype **run / defer / skip** defaults to see what a **given session** actually shipped.

**Commercial / server alignment:** **`Foundation`** (and **`starter`**) match **`api/provision.js`** — **`TIER_MODULES.foundation` is `[]`**: no automatic integration module provisioning; **Professional+** unlocks the `allowedModules` list. Marketing on **`index.html`** is aligned to that gate. **Non-US** buyers and **enterprise procurement** (MSA/SSO) are **out of scope** for self-serve unless added explicitly. **Traceability:** same scope is row **`Z0`** in **`PAIN_POINT_MASTER_MAP.csv`** and Part 2 below.

**Reading the delivery-mode column:**

| Code | Meaning |
|------|---------|
| **L** | **Live provisioned** service (target state when module succeeds) |
| **D** | **Deferred** (post-build activation, DNS propagation, owner verification, or archetype default **D**) |
| **S** | **Skipped** by default for that archetype (or `modules_enabled` off) — may still be available at higher tier/archetype |
| **G** | **Generated artifact only** (repo file: doc, code, config) — no third-party account required |
| **M** | **Manual / fallback** path documented (e.g. `OPERATIONS.md` when API fails) |

**Tiers (commercial):** **F** Foundation · **P** Professional · **E** Enterprise (from `index.html`).

**Archetypes (site package):** **A** Demo/Express · **B** Landing 1-page · **C** Starter 5-page · **D** Growth · **E** Authority · **F** Enterprise Full (from `V4_INVESTOR_FEEDBACK.md`).

**Default module posture by archetype** uses the **R / D / S** matrix in §3.4 of `V4_INVESTOR_FEEDBACK.md` (**R** run when tier allows · **D** defer · **S** skip). **`modules_enabled`** and **price tier** can override defaults.

---

## Part 1 — Exhaustive pain taxonomy (numbered IDs)

Each item is a **pain statement** the designed system **can touch** (address, reduce, or document a path for). IDs are stable for the matrix in Part 2.

### A. Intake, expression, and brief quality

| ID | Pain |
|----|------|
| A1 | “I can’t turn my idea into a structured brief.” |
| A2 | “I’m not good at writing — I think in voice, images, or decks.” |
| A3 | “My inputs are messy (napkin photo, whiteboard, business card, video).” |
| A4 | “I need to iterate the concept in conversation before committing.” |
| A5 | “I have a competitor URL but no clear differentiation story.” |
| A6 | “I don’t know what to upload or say first.” |
| A7 | “Multiple stakeholders describe the business differently.” |
| A8 | “I need the system to accept many input modalities without losing context.” |

### B. Viability, strategy, and decision risk

| ID | Pain |
|----|------|
| B1 | “I might waste money building the wrong thing.” |
| B2 | “I don’t know if the idea is fundable / durable.” |
| B3 | “Single-model AI advice feels unreliable / groupthink.” |
| B4 | “I need rigor across multiple strategy frameworks, not one checklist.” |
| B5 | “I need a defensible composite score for investors or cofounders.” |
| B6 | “Consensus is weak — I need deliberation when models disagree.” |
| B7 | “Nobody has stress-tested my plan; I’ll get surprised in a pitch.” |
| B8 | “I can’t see competitive dynamics clearly (pricing, positioning).” |
| B9 | “Market sizing (TAM/SAM/SOM) is hand-wavy.” |
| B10 | “Unit economics and revenue logic aren’t explicit.” |
| B11 | “Go-to-market is a slogan, not a 90-day plan.” |
| B12 | “Failure modes and recovery aren’t documented.” |
| B13 | “AI/automation operating model for the business is unclear.” |
| B14 | “Risk assumptions are implicit instead of listed.” |

### C. Capital, lenders, and transaction readiness

| ID | Pain |
|----|------|
| C1 | “Bank / SBA wants a specific plan format I don’t have.” |
| C2 | “I need 3-year financials, cash flow, break-even in one package.” |
| C3 | “Investor diligence checklist is overwhelming.” |
| C4 | “I need VC + SBA + ‘pitch show’ narratives reconciled.” |
| C5 | “M&A / exit framing isn’t in my head yet.” |
| C6 | “Cap table and fundraising strategy are missing.” |
| C7 | “I need pitch content without hiring a deck agency.” |
| C8 | “Documents aren’t credible enough for advisors to start from.” |

### D. Legal, entity, tax, and compliance (informational artifacts)

| ID | Pain |
|----|------|
| D1 | “I don’t have starting legal templates (OA, IP, NDA, offer letter, DPA).” |
| D2 | “Privacy / ToS / SLA need a first draft aligned to business type.” |
| D3 | “I don’t know the formation → banking → insurance checklist order.” |
| D4 | “GDPR / CCPA / PCI awareness is scattered.” |
| D5 | “I need PDFs I can hand to counsel, not just Markdown.” |
| D6 | “Disclaimer: I still need a real attorney / CPA — I need a starting point.” |

### E. People, culture, and scaling the org

| ID | Pain |
|----|------|
| E1 | “No hiring plan or comp benchmarks.” |
| E2 | “Culture / performance framework doesn’t exist.” |
| E3 | “Tax strategy topics (R&D, QSBS, entity selection) aren’t organized.” |
| E4 | “Customer discovery script and rubric missing.” |

### F. Product, technical spec, and design coherence

| ID | Pain |
|----|------|
| F1 | “Engineers don’t have SPEC / acceptance criteria.” |
| F2 | “Data model and API contracts aren’t written down.” |
| F3 | “Design system (colors, type, components) is ad hoc.” |
| F4 | “Repo lacks README / manual actions / env example.” |
| F5 | “Frontend and backend don’t match.” |
| F6 | “i18n / bilingual UX isn’t planned.” |
| F7 | “Knowledge base / SEO article outlines don’t exist.” |
| F8 | “Dashboard is empty after deploy — needs seed/setup story.” |
| F9 | “Build breaks on template drift (icons, branding, links).” |

### G. Deployment, infrastructure, and ownership

| ID | Pain |
|----|------|
| G1 | “No production deployment — only local or mockups.” |
| G2 | “I don’t own the code; vendor lock-in fear.” |
| G3 | “No private Git repo / CI story.” |
| G4 | “Custom domain + SSL not configured.” |
| G5 | “DNS/email authentication (SPF/DKIM/DMARC) not set — mail goes to spam.” |
| G6 | “Database not provisioned / migrated / seeded.” |
| G7 | “Auth integration not wired for real users.” |
| G8 | “Post-deploy verification missing — broken routes ship silently.” |
| G9 | “Performance / SEO / a11y baselines unknown.” |
| G10 | “Wrong deployment target for business type (SaaS vs directory vs WP authority).” |

### H. Monetization and revenue operations

| ID | Pain |
|----|------|
| H1 | “Can’t take payments — no products/prices in Stripe.” |
| H2 | “No webhooks / customer portal / tier structure.” |
| H3 | “Failed payments silently churn revenue.” |
| H4 | “No dunning / escalation path.” |
| H5 | “Invoices/receipts not tied to payment events.” |

### I. CRM, pipeline, and client delivery

| ID | Pain |
|----|------|
| I1 | “Leads live in inboxes, not a pipeline.” |
| I2 | “No client portal / onboarding tasks.” |
| I3 | “No invoicing template / deal stages.” |
| I4 | “License limits / allocation tracking for enterprise tools.” |

### J. Voice, phone, scheduling, and time

| ID | Pain |
|----|------|
| J1 | “Missed calls = lost revenue.” |
| J2 | “No professional phone presence / local number.” |
| J3 | “No AI voice / receptionist for FAQs and routing.” |
| J4 | “Booking is email ping-pong — no self-serve calendar page.” |
| J5 | “Reminders and confirmations don’t run consistently.” |

### K. Email and SMS marketing

| ID | Pain |
|----|------|
| K1 | “No list, no sequence, no automation.” |
| K2 | “CAN-SPAM basics (unsubscribe, etc.) not handled.” |
| K3 | “SMS templates and campaigns missing.” |
| K4 | “Welcome / nurture / follow-up depends on manual sends.” |

### L. On-site conversion: chat, analytics, lead intelligence

| ID | Pain |
|----|------|
| L1 | “Visitors bounce — no onsite help.” |
| L2 | “No FAQ chat / semantic help on the marketing site.” |
| L3 | “No heatmaps / session understanding.” |
| L4 | “No funnel visibility (PostHog-style).” |
| L5 | “Anonymous traffic — can’t identify high-intent visitors.” |
| L6 | “No lead scoring / alerts for sales.” |

### M. SEO, content, authority, and social scale

| ID | Pain |
|----|------|
| M1 | “No keyword strategy or cluster map.” |
| M2 | “No long-form SEO posts on the site.” |
| M3 | “Rate limits / tool gaps break publishing plan.” |
| M4 | “Bilingual market not served.” |
| M5 | “Social presence is blank — need a calendar at scale.” |
| M6 | “Directory / membership site model needs its own product surface.” |
| M7 | “Authority site path needs WordPress + theme + plugin stack.” |
| M8 | “Microsite / landing-only path needed for speed.” |

### N. Creative, media, and brand assets

| ID | Pain |
|----|------|
| N1 | “No hero / OG / favicon — social previews look broken.” |
| N2 | “No explainer video or short clips for ads.” |
| N3 | “No multi-size creative kit for platforms.” |
| N4 | “Images heavy / slow — need optimization discipline.” |
| N5 | “A/B messaging variants for ads not drafted.” |

### O. Automation and orchestration

| ID | Pain |
|----|------|
| O1 | “Signup doesn’t flow to CRM + email + SMS.” |
| O2 | “Bookings don’t create tasks and confirmations.” |
| O3 | “Payments don’t trigger receipt + accounting handoff.” |
| O4 | “Hot leads don’t trigger alerts and personalized follow-up.” |
| O5 | “Missed calls don’t trigger recovery flows.” |
| O6 | “Failed payments don’t trigger dunning escalation.” |
| O7 | “Post-service review / testimonial collection doesn’t exist.” |
| O8 | “Internal visibility (e.g. Slack) missing for key events.” |

### P. Finance ops adjacent (expenses, handoff)

| ID | Pain |
|----|------|
| P1 | “Expense tracking not started — messy at tax time.” |
| P2 | “No single credentials inventory for operators.” |

### Q. Vertical / trade / plan-ingestion (V4 add-on)

| ID | Pain |
|----|------|
| Q1 | “Takeoff from plans is slow and painful.” |
| Q2 | “Blueprint PDFs/photos don’t become structured line items.” |
| Q3 | “Job-cost assumptions aren’t explicit or editable.” |
| Q4 | “I need audit trail / export — not a black box ‘bid’.” |
| Q5 | “Liability fear — must not imply licensed estimate or code compliance.” |
| Q6 | “I need human-in-the-loop before third-party numbers.” |

### R. Comprehension, literacy, and stakeholder communication

| ID | Pain |
|----|------|
| R1 | “Technical docs are unreadable for me as owner/operator.” |
| R2 | “Lenders/investors still need technical originals.” |
| R3 | “I need a START-HERE path through the repo.” |
| R4 | “Readability / acronym QA isn’t systematic.” |

### S. Demo, sales, and honest scope (GTM meta)

| ID | Pain |
|----|------|
| S1 | “Live demo can’t be real under time pressure.” |
| S2 | “Sales over-promises vs what shipped.” |
| S3 | “Deferred work isn’t visible to buyer.” |
| S4 | “Need proof rows / SLA narrative for investors.” |

### T. Ongoing operations after launch (managed services narrative)

| ID | Pain |
|----|------|
| T1 | “Automations break — nobody monitors.” |
| T2 | “SEO/content goes stale.” |
| T3 | “No priority support / regular strategy cadence.” |

### U. Community (specified toggle — may be optional / key-gated)

| ID | Pain |
|----|------|
| U1 | “I want a community layer (Heartbeat) — not always on.” |

---

## Part 2 — Traceability matrix (pain → persona → deliverables → tier / archetype → mode)

**Persona legend (representative; many overlap):**  
**P1** Idea-stage founder · **P2** Pre-revenue builder (Foundation) · **P3** Ops-heavy SMB (Professional) · **P4** Full-stack buyer (Enterprise) · **P5** Trades / vertical operator · **P6** Non-technical owner · **P7** Capital seeker (SBA/VC) · **P8** Authority / SEO niche · **P9** Directory / membership operator · **P10** Pitch / demo seller · **P11** Agency / coach / SaaS-light (Growth) · **P12** Post-build “keep it running” owner

Below, **Arche** shows **defaults** (R/D/S). **Tier** shows **minimum tier where marketing typically promises** the capability (your SKU may vary).

**As-built vs target:** Rows describe the **designed** product and **target** L/D/G/M behavior. Not every `mod_*` path is fully automated in production today — use **`maturity.html`**, **`BUILD-MANIFEST.json`**, and **`api/provision?action=inventory`** for what is live in the orchestrator and which keys exist.

| ID | Primary personas | Key deliverables / modules (designed) | Tier | Archetype default (R/D/S) | Mode |
|----|------------------|----------------------------------------|------|---------------------------|------|
| A1–A8 | P1,P2,P5,P11 | Multi-modal intake → structured brief; conversational refinement in builder | F–E | All | G + session |
| B1–B14 | P1,P7,P10 | Viability scoring; multi-framework + multi-model consensus; adversarial critique; strategy doc set (`BUSINESS-SYSTEM`, `REVENUE-MODEL`, `GTM-PLAYBOOK`, `FAILURE-MODES`, `AGENT-SYSTEM`, competitive + market sizing narratives) | Free–E | A: subset; F: full | G |
| C1–C8 | P2,P7 | `SBA-BUSINESS-PLAN.md`, `INVESTOR-READINESS.md`, `PITCH-DECK.md`, cap table / fundraising themes (tier-dependent) | F–E | B–F | G |
| D1–D6 | P2,P3,P4 | Legal templates (MD) + `mod_docs` PDFs (ToS/Privacy/Agreement); formation/compliance in `OPERATIONS.md` | F: templates; E: PDF emphasis | C–F | G / L / M |
| E1–E4 | P2 | Hiring, culture, comp, tax strategy docs; `CUSTOMER-DISCOVERY.md` | F–E | D–F | G |
| F1–F9 | P2,P11 | `SPEC.md`, `DATA-MODEL.md`, `API-CONTRACTS.md`, `DESIGN.md`, `KB-OUTLINES.md`, README/env/manual; Next.js + API routes + dashboard; validation gate; optional i18n | F–E | B–F | G |
| G1–G10 | P2–P4 | Phase 8 deploy; GitHub; Vercel/20i/WP/Directory per decision tree; `mod_hosting`; Neon; Clerk; Phase 20 smoke / BUILD-REPORT (spec) | F–E | A: minimal; F: full | L/G/D/M |
| H1–H5 | P3,P4 | `mod_billing` Stripe products/tiers/webhooks; dunning in automation | P–E | B:D; C:R | L/D |
| I1–I4 | P3,P4 | `mod_crm` SuiteDash workspace, pipeline, portal, invoicing | P–E | A:S; C:D; D:R | L/D |
| J1–J5 | P3,P4,P5 | `mod_phone`, `mod_*` Trafft booking; missed-call workflow | E (voice); booking varies | A:S; D:D | L/D |
| K1–K4 | P3,P4 | `mod_email`, `mod_sms` lists, sequences, templates | P–E | A:S/D | L/D |
| L1–L6 | P3,P4 | `mod_chatbot`; `mod_analytics` Plerdy+PostHog; `mod_leads` Happierleads+Salespanel | P–E | A:S/D | L/D |
| M1–M8 | P4,P8,P9 | `mod_seo`; Vista Social; `mod_directory`; `mod_wordpress`; static/microsite path | E for full; partial lower | A:S; E:R | L/D/G |
| N1–N5 | P4,P8 | `mod_design`; `mod_video` | E | A:S; D:D | L/D |
| O1–O8 | P3,P4 | `mod_automation` n8n seven workflows | P–E | A:S; D:D | L/D |
| P1–P2 | P3,P4 | SparkReceipt; `CREDENTIALS.md` | E / module | D:defer | L/M |
| Q1–Q6 | P5,P6 | `mod_vertical_tool` / `app/tool/...`; schema + storage + disclaimers; export/audit narrative | P–E (V4) | Add-on | G/L/M |
| R1–R4 | P6,P7 | `docs/plain/*`, `START-HERE.md`, `QA-NOTES.md` (heuristic) | F–E | Toggle | G |
| S1–S4 | P10 | Demo/Express archetype; `BUILD-MANIFEST.json`; `V4-DEMO-SLA.md` telemetry | All | A | G |
| T1–T3 | P12 | Managed Operations subscription (positioning) | Add-on | All | Service |
| U1 | P4 | Community module (Heartbeat) — config toggle | Key-gated | Optional | L/M |
| Z0 | P1,P2,P4,P12 | Tier truth: `TIER_MODULES.foundation` []; no auto `mod_*`; non-US US-default; enterprise MSA/SSO not self-serve | F–E | All | G |

---

## Part 3 — Coverage by designed module (quick reference)

| Module (design) | Pain clusters touched (IDs) |
|-----------------|-----------------------------|
| `mod_hosting` | G4,G5,G10 |
| `mod_billing` | H1–H5 |
| `mod_email` | K1,K2,K4 |
| `mod_phone` | J1–J3 |
| `mod_sms` | K3,K4 |
| `mod_chatbot` | L1,L2 |
| `mod_seo` | M1–M4 |
| `mod_video` | N2 |
| `mod_design` | N1,N3,N4 |
| `mod_analytics` | L3,L4 |
| `mod_leads` | L5,L6 |
| `mod_docs` | D2,D5,D6 |
| `mod_automation` | O1–O8,J4,J5,H3,H4 |
| `mod_social` | M5 |
| `mod_crm` | I1–I4 |
| `mod_directory` | M6,G10 |
| `mod_wordpress` | M7,G10 |
| `mod_vertical_tool` (V4) | Q1–Q6 |
| Plain-language layer (V4) | R1–R4 |
| Scoring + strategy generation | B1–B14,A1 |
| Core codegen + validation | F1–F9,G1–G3 |
| Verify / report (spec) | G8,G9,S3 |

---

## Part 4 — Suggested use

1. **Product:** Prioritize roadmap by counting which **IDs** are blocked by missing keys or unfinished `mod_*`.
2. **Sales:** Map each prospect to **persona + archetype**; pre-fill **expected D/S** from V4 matrix to set expectations.
3. **Legal/compliance:** Treat **D***, **Q***, and footer disclaimers as **non-negotiable** framing for vertical tools and AI docs.
4. **Keep current:** When you add modules or archetypes, add **new pain IDs** and extend Part 2 rows — this file is the **single enumeration** unless superseded.

---

*Generated as a working master map from repository specifications and marketing copy. Update alongside `DYNASTY_LAUNCHER_V3_FINAL.md` and `V4_INVESTOR_FEEDBACK.md`.*
