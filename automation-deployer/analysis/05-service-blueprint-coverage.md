# 05 — Service Blueprint Coverage

Source: `JTBD_JOURNEYS_AND_SERVICE_BLUEPRINTS.md` §6–12.

The source defines 9 service blueprint episodes (SB00–SB08), each with a **line of visibility** separating:

- **Customer actions** (what the tenant's customer does)
- **Frontstage** (what the tenant's customer sees — UI, email, docs)
- **Backstage** (what the tenant does — not seen by their customer)
- **Systems** (the automations and integrations that power backstage)

This repo's automations live in the **Systems** swimlane, serving the **Backstage** swimlane.

## Episode-by-episode coverage plan

### SB00 — Awareness & trust formation

**Customer action:** Searches, reads, asks for references.
**Systems to deploy:**
- 1.01 GBP monitor (keeps reviews fresh)
- 21.01 review request automation
- 24.01 content publishing pipeline
- 25.01 social syndication
- 26.03 keyword rank tracker
- 42.05 landing page A/B test runner

**Minimum viable set for tenant:** 21.01 + 24.01 + 26.03.
**Health check:** Every week, at least one new indexed page + one new review request sent.

### SB01 — Evaluation & pricing gate

**Customer action:** Requests quote, compares options, raises objections.
**Systems to deploy:**
- 6.01 proposal PDF generator
- 6.02 pricing calculator
- 5.01 pipeline auto-advance on proposal opened
- 5.04 follow-up drip on stalled proposal

**Minimum viable set:** 6.01 + 5.04.
**Health check:** From proposal sent to proposal signed/declined within tenant-configured SLA.

### SB02 — Commitment & onboarding

**Customer action:** Pays, signs, shares info, schedules kickoff.
**Systems to deploy:**
- 15.01 invoice auto-gen on Stripe webhook
- 7.01 contract e-sign on deal closed
- 8.01 welcome sequence
- 8.02 portal access code
- 8.03 kickoff call auto-scheduled
- 4.02 CRM contact dedup

**Minimum viable set:** 15.01 + 8.01 + 8.02.
**Health check:** New paid customer has portal access + welcome email within 10 minutes.

### SB03 — Strategy & design intake (agency / consultative businesses)

**Customer action:** Completes intake, answers discovery questions.
**Systems to deploy:**
- 2.01 form → CRM
- 2.03 AI intake questionnaire
- 2.08 document upload with AI classification
- 3.02 discovery quality scorer

**Minimum viable set:** 2.01 + 2.08.
**Health check:** 100% of submissions land in CRM with complete field mapping.

### SB04 — Build & validation (in Dynasty Launcher's domain, not this repo)

Skipped.

### SB05 — Deploy & verify

**Customer action:** Gets access to their deliverable, uses it for the first time.
**Systems to deploy:**
- 14.01 onboarding call from voice agent
- 8.05 first-use milestone tracker
- 22.02 in-portal chat support
- 23.04 launch-week dashboard

**Minimum viable set:** 22.02 + 23.04.
**Health check:** First-use event within 24 hours of handoff.

### SB06 — Integrate modules

**Customer action:** Connects their own tools (Stripe, CRM, calendar).
**Systems to deploy:**
- 12.01 connect email sender
- 14.05 connect phone
- 16.01 connect payments
- 17.01 connect accounting
- 4.01 sync CRM contacts

**Minimum viable set:** Whatever matches the tenant's stack.
**Health check:** Each integration produces a successful test event within 5 min.

### SB07 — Operate & iterate

**Customer action:** Uses the service, provides feedback, escalates issues.
**Systems to deploy:**
- 23.01 weekly ops digest
- 31.01 retention check-ins
- 37.01 QA audit cadence
- 45.01 orchestrator agent

**Minimum viable set:** 23.01 + 31.01.
**Health check:** Weekly digest email goes out on schedule.

### SB08 — Sustain & transfer

**Customer action:** Renews, refers, transfers, or churns.
**Systems to deploy:**
- 31.03 renewal reminder sequence
- 29.01 referral program launcher
- 32.01 offboarding workflow
- 32.03 churn diagnostic survey
- 35.04 data export on offboard

**Minimum viable set:** 31.03 + 32.01.
**Health check:** Every renewal event triggers outreach ≥30 days prior.

## Persona × SB episode coverage

From `PERSONA_SERVICE_BLUEPRINT_TRACE.csv` (10 rows mapping SB00–SB08 to personas and pain clusters).

| Episode | Solo Steve | Manager Maria | Owner Omar | Agency Alex | Compliance Carol |
|---|---|---|---|---|---|
| SB00 | ✓ (21.01 min) | ✓ full | ✓ full | ✓ full | — |
| SB01 | ✓ min | ✓ full | ✓ full | ✓ full | ✓ (contract-heavy) |
| SB02 | ✓ min | ✓ full | ✓ full | ✓ full | ✓ |
| SB03 | — | — | — | ✓ full (agency is intake-heavy) | — |
| SB05 | ✓ min | ✓ full | ✓ full | ✓ full | ✓ |
| SB06 | ✓ (only what they use) | ✓ full | ✓ full | ✓ full | ✓ limited |
| SB07 | ✓ min (digest only) | ✓ full | ✓ full (with 45.01) | ✓ full | ✓ (compliance focus) |
| SB08 | ✓ | ✓ full | ✓ full | ✓ (offboarding key for agency) | ✓ (transfer-heavy) |

## The episode-to-manifest dependency graph

The planner's `depends_on` resolution benefits from SB ordering: an automation belonging to SB02 typically depends on an automation belonging to SB01 or SB00.

E.g., 8.01 (welcome sequence, SB02) depends on 2.01 (form → CRM, SB01) because without a CRM contact there's no one to welcome.

These edges are encoded in `registry/relationships.json`.

## Gaps to be aware of

- **SB03 is agency-heavy.** For non-agency personas (Field Service Fred, Bookkeeper Beth), skip SB03 automations.
- **SB07 depends on data existing** — can't run reports on a 1-day-old tenant. The planner adds a 14-day soft-block on SB07 automations for tenants onboarded recently.
- **SB08 requires SB06 integrations.** Churn diagnostics need CRM data; renewal reminders need billing data.

The deployer surfaces these as "will-activate-on-Y" states in the tenant's `status.json` rather than failures.
