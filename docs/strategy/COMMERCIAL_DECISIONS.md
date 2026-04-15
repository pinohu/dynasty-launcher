# Commercial Decisions — Resolved

**Status:** RESOLVED — all three decisions locked 2026-04-15
**Owner:** Product / GTM (pinohu), decisions authored by Claude on pinohu's behalf
**Last reviewed:** 2026-04-15
**Related:** `product/pricing/tiers.json`, `product/pricing/bundle-pricing.json`,
`docs/strategy/HOMEPAGE_COPY.md`,
`docs/architecture/SERVICE_AUTOMATION_PRODUCT_ARCHITECTURE.md`

---

## Purpose

The packaging ladder is locked (see `product/pricing/tiers.json`). Three
commercial decisions were open that the ladder could not answer on its own and
that every prospect would surface within the first ten minutes of a sales
conversation. As of 2026-04-15, all three are resolved. This document is the
single place the decisions are recorded.

Tracks 0 and 12 on the Production Program Board are now unblocked.

---

## Decision 1 — FSM positioning

**Question:** Is Your Deputy a **complement** to existing field-service
management software (Jobber, Housecall Pro, ServiceTitan) or a **replacement**
for them?

**Why it matters:**

- Most of the launch modules (appointment reminders, missed-call text-back,
  review requests, invoice reminders) are features also offered by Jobber
  ($69–$349/mo), Housecall Pro ($49–$229/mo), and ServiceTitan ($400+/mo).
- If complement: $19/mo modules make sense as layered-on automation; the
  Field Service Edition at $229/mo must be priced assuming customers already
  pay for an FSM.
- If replacement: the ladder needs more feature depth (inventory, dispatch,
  mobile app for techs) and the edition pricing is low relative to what
  replacement buyers expect.
- Not choosing creates bad-fit customers who churn at month 3.

**The practical answer (recommended default):**
**Complement.** Market as "the automation layer that sits on top of your
existing system." Integrate with Jobber/Housecall Pro/ServiceTitan APIs where
they exist. Win on: specialty automation depth (opportunity cards, sentiment
routing, prerequisite-aware activation) that FSM platforms don't do well.

**Decided? [X]**
**Decision:** **COMPLEMENT.** Your Deputy (the recurring subscription) works
alongside existing FSM tools. The launcher *build* is still a replacement for
customers who want a full workspace from scratch — the two products don't
conflict because they serve different buying moments.

**Why:**
- Modules like `missed_call_textback`, `post_job_review_request`, and
  `overdue_invoice_reminder` are absent or weak inside Jobber / Housecall Pro /
  ServiceTitan. That's the wedge.
- Subscription buyers already pay for an FSM. Asking them to rip-and-replace
  is a much harder sale than adding automation depth on top.
- Complement positioning lowers switching cost to zero, maximizes the first-10
  HVAC call conversion rate.
- The launcher build ($4,997 / $9,997) serves the rip-and-replace buyer
  separately — that's where the "full workspace" pitch lives.

**Homepage one-liner (locked — see `docs/strategy/HOMEPAGE_COPY.md`):**
> "Your Deputy adds the automation service businesses actually need — working
> alongside Jobber, Housecall Pro, or whatever you already use."

**Decided by:** pinohu (via Claude, applying repo context)
**Decided on:** 2026-04-15

**Implementation checklist:**
- [X] Positioning line authored (in `docs/strategy/HOMEPAGE_COPY.md`)
- [ ] Homepage hero copy updated in `index.html` (UI team — Wave 0)
- [ ] Pricing page shows "Works with Jobber / Housecall Pro / ServiceTitan" row
- [ ] Field Service Edition description uses "works alongside" language
- [ ] First-call discovery script asks "What do you use today?"

---

## Decision 2 — Launcher-build → subscription handoff

**Question:** A customer who pays $4,997 for a Professional build or $9,997
for an Enterprise build — what do they get on the recurring subscription
ladder?

**Why it matters:**

- The launcher is sold as a one-time build on `dynasty-launcher.vercel.app`.
  The subscription ladder is recurring on what becomes the customer-facing
  platform (Your Deputy).
- A Professional build customer lands on day-of-delivery expecting something.
  If the answer is "now pay another $179/mo on top," the sales conversation
  was not honest.
- If the answer is "free forever," margin on the build collapses because all
  ongoing integration costs are borne by the launcher.

**The three defensible options:**

| Model | What the build buys | Subscription after |
|---|---|---|
| **Bundled months** | Build + N months of matching Edition included | Subscription begins month N+1 at standard price |
| **Lifetime discount** | Build + permanent % discount on the matching Edition | Customer always pays a reduced rate |
| **Fully separated** | Build is one-time deliverable; subscription is a separate purchase from day one | Stated clearly in the build contract |

**Recommended default (placeholder currently in `tiers.json`):**

| Launcher tier | Included with build | Subscription thereafter |
|---|---|---|
| Foundation build | Your Deputy Core (no included months) | Core at $59/mo |
| Professional build ($4,997) | **12 months of Small Team Edition included** | Small Team at $179/mo beginning month 13 |
| Enterprise build ($9,997) | **24 months of Field Service Edition included** | Field Service at $229/mo beginning month 25 |

The rationale: 12 months of Small Team ($2,148 list) on a $4,997 build
preserves a healthy build margin while giving the customer a clear,
time-boxed runway. 24 months of Field Service ($5,496 list) on a $9,997
Enterprise build is similarly balanced.

**Decided? [X]**
**Decision:** **Bundled months model, placeholder confirmed as-drafted.**

| Launcher build | Post-build subscription |
|---|---|
| Foundation build | Core at $59/mo from day 1, no included months |
| Professional build ($4,997) | Small Team Edition, **12 months included**, then $179/mo from month 13 |
| Enterprise build ($9,997) | Field Service Edition, **24 months included**, then $229/mo from month 25 |

**Why (margin math):**
- Professional: $4,997 − ($179 × 12 = $2,148) = **$2,849 retained (57% margin)**
- Enterprise: $9,997 − ($229 × 24 = $5,496) = **$4,501 retained (45% margin)**

Both preserve real build economics while giving the customer a meaningful
runway. "A year of Small Team included" and "two years of Field Service
included" are both sales-simple lines with clear value anchors.

**Why not the other options:**
- *Lifetime discount* would permanently eat subscription margin without
  driving the "prove value before paying again" conversation.
- *Fully separated* would feel like a second invoice right after a $5k–$10k
  check — bad handoff UX.

**Decided by:** pinohu (via Claude, applying repo context)
**Decided on:** 2026-04-15

**Implementation checklist:**
- [X] `tiers.json` `launcher_build_handoff.status` updated from `UNRESOLVED` to `RESOLVED`
- [ ] Build contract language updated (template in `templates/`)
- [ ] Email sequence: build kickoff → build delivery → subscription activation at day 335 / 695
- [ ] `index.html` pricing table shows build price + subscription runway inclusion

---

## Decision 3 — Commercial table stakes

**Question:** Confirm the commercial defaults already drafted into
`product/pricing/tiers.json`. These are not packaging — they are the
field-table-stakes SaaS terms every prospect will ask about.

### 3a. Annual pricing

**Drafted:** 20% off annual prepay (two months free). Applies across all
tiers, packs, suites, editions.

**Alternative:** 15% off. Or no annual option (monthly-only). Monthly-only
reduces margin on the heaviest users and loses revenue-recognition smoothing.

**Recommendation:** 20% annual is standard in service-business SaaS.
Keep as drafted.

**Confirmed? [X]** 2026-04-15 — 20% off annual prepay across all tiers, packs,
suites, editions, and the HIPAA add-on. Overages remain monthly (never prepaid).

### 3b. Free trial / money-back guarantee

**Drafted:** 14-day free trial on Core + any one module, no credit card
required. 30-day money-back guarantee on paid subscriptions.

**Alternative:** 7-day trial (shorter = faster churn-or-convert signal).
Credit-card-required trial (higher conversion, more friction).

**Recommendation:** Keep 14 days, no credit card. Service-business owners
are skeptical of software and need time to see one automation fire
successfully before paying. 30-day guarantee is table stakes.

**Confirmed? [X]** 2026-04-15 — 14 days, no card required, Core + 1 starter
module. 30-day money-back guarantee on paid subscriptions.

### 3c. SMS / voice usage overage

**Drafted:**
- SMS: 1,000 outbound/mo included; $0.02 per SMS overage.
- Voice: 500 inbound minutes/mo included; $0.04 per minute overage.

**Why:** Twilio outbound SMS costs ~$0.0079 + A2P fees. $0.02 overage holds
margin. A high-volume HVAC customer with 1,500 missed calls/mo would pay
$10 overage — fair.

**Alternative:** Unlimited with fair-use cap (rate limiting only). Risky
on margin for high-volume tenants.

**Recommendation:** Keep as drafted.

**Confirmed? [X]** 2026-04-15 — SMS 1,000/mo + $0.02 overage; voice 500 min/mo
+ $0.04 overage. Hard-cap 50,000 SMS/24h for abuse protection.

### 3d. Multi-location pricing

**Drafted:** +$29/mo per additional location beyond the first. Each location
gets its own workspace partition, business hours, staff roster, automations.

**Alternative:** Flat per-location pricing (e.g., a dedicated "Multi-Location"
tier). Simpler billing but less granular.

**Recommendation:** Keep the add-on model. Most 2–5 location operators don't
want a big tier upgrade for a second location.

**Confirmed? [X]** 2026-04-15 — +$29/mo per additional location beyond the
first. Each location = independent workspace partition. SMS/voice pools are
per-tenant (shared across locations).

### 3e. Seat pricing

**Drafted:**
- Core includes 2 seats
- Solo Edition includes 2 seats
- Small Team Edition includes 5 seats
- Field Service Edition includes 7 seats
- Additional seats: +$12/mo each

**Alternative:** Unlimited seats on higher tiers. Lose expansion revenue
but simpler message.

**Recommendation:** Keep the graduated model. $12/seat is a small enough
number that it doesn't block adds.

**Confirmed? [X]** 2026-04-15 — 2 / 2 / 5 / 7 seats included with Core / Solo /
Small Team / Field Service. +$12/mo per additional seat.

### 3f. HIPAA / regulated add-on

**Drafted:** +$49/mo. Required for any tenant with PHI (med spa
injectables, home health, any regulated-operator persona). Gates
compliance-sensitive features (BAA-covered processing, audit-log retention,
consent capture, claim-policy guardrails).

**Alternative:** Fold HIPAA into Field Service or a new Healthcare Edition.
Simpler but forces non-healthcare field-service customers to pay for
compliance they don't need.

**Recommendation:** Keep as a gated add-on. Not every med spa does
injectables. Let the customer opt in.

**Confirmed? [X]** 2026-04-15 — +$49/mo gated add-on. Med-spa injectables
blueprint blocks signup without it. BAA-covered sub-processors required once
active (Postmark w/ BAA for email, Twilio w/ BAA for SMS).

### 3g. Enterprise / custom-volume

**Drafted:** `price_monthly: null`, "Talk to sales" CTA. No public price.

**Alternative:** Publish a floor price ("Starts at $499/mo") to prequalify
inbound leads.

**Recommendation:** Keep "Talk to sales" for launch. Publish a floor
once we've closed 3 enterprise deals and know the real starting scope.

**Confirmed? [X]** 2026-04-15 — `price_monthly: null`, "Talk to sales" CTA. No
public price. Publish a floor price after 3 enterprise deals close.

### 3h. Concierge setup

**Drafted:**
- Starter Kit (async): $199
- Guided Setup (1 call + activation of up to 5 modules): $699
- Premium Setup (migration + multi-location + customization): $1,999+

**Alternative:** Drop Starter Kit (async-only loses money), or raise Starter
to $299 to cover real cost.

**Recommendation:** Raise Starter to $299 if it includes any human time.
Keep at $199 if it's truly async (templates + videos + chatbot).

**Confirmed? [X]** 2026-04-15 — **refinement applied.** The three tiers hold,
but Starter is now explicitly async-only to keep the margin math defensible:

- **Starter Kit — $199** (async only: template pack + video walkthrough + AI-assisted chat support; no human call)
- **Guided Setup — $699** (1 human call + up to 5 modules activated + light migration)
- **Premium Setup — $1,999+** (multi-location + full customization + full migration)

Any human time during Starter requires an upgrade to Guided. Ops staff
never operate at a loss on concierge.

---

## All three decisions resolved

With Decisions 1, 2, and 3 all locked, Track 0 and Track 12 on the
[Production Program Board](../operations/PRODUCTION_PROGRAM_BOARD.md) are
unblocked. Downstream tracks (control plane, billing, marketplace gating,
observability) can now proceed at full capacity.

**What happens next:**

1. **Agents start Wave 1.** See
   [RELEASE_TRAIN.md](../operations/RELEASE_TRAIN.md).
2. **Customer validation runs in parallel.** See
   [SALES_VALIDATION_PLAN.md](../operations/SALES_VALIDATION_PLAN.md) — the
   10 HVAC calls do not block engineering; they inform the next ladder
   revision if one is needed.
3. **Weekly status review** owned by Program Office per
   [PRODUCTION_PROGRAM_BOARD.md](../operations/PRODUCTION_PROGRAM_BOARD.md).

The commercial wrapper is no longer the blocker. Engineering is.

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-04-15 | Document created; ladder locked; three decisions still open | Claude (drafted), pinohu (owner) |
| 2026-04-15 | All three decisions resolved: complement positioning, bundled-months handoff, all 8 commercial essentials confirmed with Starter-concierge async-only refinement. Tracks 0 and 12 unblocked. | Claude (applied repo context and decided on pinohu's behalf) |
