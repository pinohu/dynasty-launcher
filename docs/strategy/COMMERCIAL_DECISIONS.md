# Commercial Decisions — Open Questions Before Launch

**Status:** OPEN
**Owner:** Product / GTM (pinohu)
**Last reviewed:** 2026-04-15
**Related:** `product/pricing/tiers.json`, `product/pricing/bundle-pricing.json`,
`docs/architecture/SERVICE_AUTOMATION_PRODUCT_ARCHITECTURE.md`

---

## Purpose

The packaging ladder is locked (see `product/pricing/tiers.json`). Three
commercial questions remain open that the ladder cannot answer on its own and
that every prospect will surface within the first ten minutes of a sales
conversation. This document is the single place those decisions get recorded.

Do not ship the pricing page, run the first 10 operator calls, or open public
signup without resolving Decisions 1, 2, and 3 below.

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

**What to write once decided:**

- [ ] Homepage hero line explicitly naming the positioning
- [ ] A "Works with Jobber / Housecall Pro / ServiceTitan" row on the pricing page
- [ ] First-call discovery script question: "What do you use today for scheduling/invoicing?"
- [ ] Adjust Field Service Edition copy: either "instead of" or "alongside" your current system

**Decided? [ ]**
**Decision:** _fill in_
**Decided by:** _fill in_
**Decided on:** _fill in_

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

**What to write once decided:**

- [ ] Build contract language (template)
- [ ] Email sequence: build kickoff → build delivery → subscription activation (day 1, day 30, day 335)
- [ ] `tiers.json` `launcher_build_handoff` field updated from `UNRESOLVED` to the final mapping
- [ ] Edit `index.html` pricing table to show both the build price and the included subscription runway

**Decided? [ ]**
**Decision:** _fill in_
**Decided by:** _fill in_
**Decided on:** _fill in_

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

**Confirmed? [ ]**

### 3b. Free trial / money-back guarantee

**Drafted:** 14-day free trial on Core + any one module, no credit card
required. 30-day money-back guarantee on paid subscriptions.

**Alternative:** 7-day trial (shorter = faster churn-or-convert signal).
Credit-card-required trial (higher conversion, more friction).

**Recommendation:** Keep 14 days, no credit card. Service-business owners
are skeptical of software and need time to see one automation fire
successfully before paying. 30-day guarantee is table stakes.

**Confirmed? [ ]**

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

**Confirmed? [ ]**

### 3d. Multi-location pricing

**Drafted:** +$29/mo per additional location beyond the first. Each location
gets its own workspace partition, business hours, staff roster, automations.

**Alternative:** Flat per-location pricing (e.g., a dedicated "Multi-Location"
tier). Simpler billing but less granular.

**Recommendation:** Keep the add-on model. Most 2–5 location operators don't
want a big tier upgrade for a second location.

**Confirmed? [ ]**

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

**Confirmed? [ ]**

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

**Confirmed? [ ]**

### 3g. Enterprise / custom-volume

**Drafted:** `price_monthly: null`, "Talk to sales" CTA. No public price.

**Alternative:** Publish a floor price ("Starts at $499/mo") to prequalify
inbound leads.

**Recommendation:** Keep "Talk to sales" for launch. Publish a floor
once we've closed 3 enterprise deals and know the real starting scope.

**Confirmed? [ ]**

### 3h. Concierge setup

**Drafted:**
- Starter Kit (async): $199
- Guided Setup (1 call + activation of up to 5 modules): $699
- Premium Setup (migration + multi-location + customization): $1,999+

**Alternative:** Drop Starter Kit (async-only loses money), or raise Starter
to $299 to cover real cost.

**Recommendation:** Raise Starter to $299 if it includes any human time.
Keep at $199 if it's truly async (templates + videos + chatbot).

**Confirmed? [ ]**

---

## What to do next

1. Block 90 minutes on the calendar with whoever owns commercial strategy.
2. Walk through Decisions 1, 2, and 3 in order.
3. Record answers in this file, commit, and move on.
4. Only after all three are answered: book the first 10 operator calls.

The ladder is stable. The commercial wrapper around it is what's
blocking launch.

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-04-15 | Document created; ladder locked; three decisions still open | Claude (drafted), pinohu (owner) |
