# Sales Validation Plan

**Purpose:** the 10 HVAC operator calls are production, not a side project.
This document defines the structured call script, the objection log format,
and the decision rules for what changes after the calls.

**Rule:** do not read customer conversations as "anecdotes." Read them as
data. Repeated objections outrank isolated comments.

**Last updated:** 2026-04-15

---

## Program scope

- **Target segment:** U.S. HVAC operators, 3–30 staff, $1M–$15M revenue
- **Number of calls:** 10
- **Duration:** 30 minutes each
- **Timeline:** 2 weeks total (5 calls per week)
- **Interviewer:** founder (pinohu) — first-round calls are not delegable

**Why HVAC first:** recurring maintenance economics make HVAC the strongest
vertical for the `service_due_reminder` module and the Retention Pack. If the
ladder fails here, it fails harder elsewhere.

---

## Recruiting

### Channels to draw from
- HVAC industry Facebook groups
- Local chamber directories
- LinkedIn search: "HVAC owner" or "HVAC operations manager" within target revenue band
- Introductions from existing launcher customers (if any)
- Targeted Indeed/Craigslist responses (the operators hiring are the ones with process pain)

### Screening criteria
Include:
- Owner-operator or office manager (decision maker)
- 3+ staff (otherwise pure DIY fit)
- Already running some automation (reminders, review asks — anyone using Jobber/Housecall Pro qualifies)
- Consents to recorded call for internal use

Exclude:
- Lead-gen agencies pretending to be operators
- Franchises where the franchisor controls software decisions
- Operators in California if the conversation would involve SMS recording (state complexity)

### Incentive
- $50 gift card at end of call
- Early-access offer to join the wait list at a discounted rate (no commitment)

---

## The 30-minute call script

Keep this tight. Leave the room for customer talk, not founder pitching.

### Minute 0–2: intro

"Thanks for taking 30 minutes. I'm building an automation platform for HVAC
operators. I want to understand your current workflow and whether what we're
building is worth your money. I'll share what we have near the end and ask
you to rip into it. Is it OK to record the call for our internal notes?"

### Minute 2–8: their current reality (listen)

Ask:
1. "Walk me through what happens from a customer's first call to payment."
2. "What's the most painful part of that process?"
3. "What tools are you using today? Jobber? Housecall Pro? ServiceTitan?
   Spreadsheets?"
4. "How many missed calls last month? How many unread emails from leads?
   How many jobs ran late without notifying the customer?"

**Founder rule:** do not pitch yet. Just ask and take notes.

### Minute 8–15: probe the specific automations

For each of the W1+W2 modules, ask:
5. "What do you do today when a call comes in after hours?" (→ `after_hours_autoresponder` / `missed_call_textback`)
6. "How often do you forget to follow up on estimates?" (→ `estimate_followup`)
7. "How often does a customer not show up for a scheduled visit?" (→ `no_show_recovery`)
8. "When was the last time you asked a happy customer for a Google review?" (→ `post_job_review_request`)
9. "How many invoices are past 7 days overdue right now?" (→ `overdue_invoice_reminder`)
10. "When was the last time you called a customer whose last service was a year ago?" (→ `service_due_reminder` / `dormant_customer_reactivation`)

### Minute 15–22: show the pitch (2 minutes max talking, rest Q&A)

Show a one-page summary of either:
- **Version A:** Lead Conversion Pack at $49/mo (for operators with response pain)
- **Version B:** Field Service Edition at $229/mo (for operators with full-system pain)

Ask:
11. "Would you pay for this? Why or why not?"
12. "What would stop you from buying it today?"
13. "What's confusing?"

### Minute 22–27: positioning probe

Ask:
14. "Do you see this as something you'd **use alongside** Jobber/your current tool, or **instead of** it?"
15. "Which module do you NOT want?" (deletion is the strongest signal)
16. "What price would feel wrong — either too cheap, or too expensive?"

### Minute 27–30: close

"If we build this the way we described, would you want to be notified when
it's ready?" (collect email for waitlist, not sale)

---

## The standing questions (ask every operator)

These 10 questions must be asked identically across all 10 calls so
responses are comparable.

1. **Current tools:** "What software do you use today?"
2. **Monthly software spend:** "Roughly what's your monthly software bill?"
3. **Missed calls:** "How many missed calls last month?"
4. **Estimate follow-up:** "Of the estimates you sent last month, how many did you manually follow up on?"
5. **No-show rate:** "What percentage of appointments no-show?"
6. **Review volume:** "How many Google reviews did you get last month?"
7. **Overdue invoices:** "How many invoices are past 7 days overdue right now?"
8. **Recurring revenue share:** "What % of your revenue comes from maintenance plans or service contracts?"
9. **Would buy:** "On a scale of 1–10, how likely would you be to pay $49/mo for the Lead Conversion Pack today?"
10. **Positioning:** "Complement or replace existing tools?"

---

## Objection log — the required spreadsheet

**Location:** shared spreadsheet linked from this doc (not checked in to repo
since it contains customer identifying info).

**Columns:**
- Call date
- Operator company
- Operator size (staff / revenue band)
- Q1–Q10 answers (standing questions)
- Which modules they said "yes, I'd use" / "no, I wouldn't"
- Which modules they asked for that we don't have
- Pricing pushback (too cheap / too expensive / fine)
- Positioning answer (complement / replace / unsure)
- Stated blockers to buying
- Overall sentiment (hot / warm / cold)
- Quotes (verbatim, especially about pain)

Every row is filled the same day as the call. No "I'll do it later."

---

## The decision rules — what changes after the 10 calls

Decisions are made on patterns, not individual opinions. Thresholds below
assume N=10.

### Rule 1: FSM positioning
- If **≥7 of 10** say "use alongside Jobber/HCP" → positioning locked as **complement**
- If **≥7 of 10** say "would replace" → reconsider the ladder; this is a different company
- Mixed (4–6 complement, 4–6 replace) → stay with complement default; note the segment split

### Rule 2: Lead Conversion Pack price
- If **≥6 of 10** rate likelihood to buy at $49/mo as **7 or higher** → price confirmed
- If **≥4 of 10** say "too cheap, I don't trust it" → raise to $59 or $69
- If **≥4 of 10** say "too expensive" → either cut pack size or stand firm (check close rate later)

### Rule 3: Which module to prioritize
- The module mentioned most in pain (missed calls / no-shows / unpaid invoices / no reviews / dormant customers) gets engineering priority
- The module that the fewest operators use today is the highest upside
- A module that 3+ operators request that we don't have goes on the Wave 2 shortlist

### Rule 4: Which module to kill
- Any module where **≥5 of 10** say "I already have that built into my tool" → keep but de-emphasize in marketing
- Any module where **≥7 of 10** say "I don't need that" → consider demoting from W1

### Rule 5: Stated blocker patterns
- If 3+ operators mention the same blocker (e.g. "I'm locked into Jobber contract"), build the integration/take-out motion that removes it
- If 3+ mention a specific feature gap (e.g. "I need crew dispatch, not just lead response"), update the roadmap

### Rule 6: Pricing discount structure
- If **≥5 of 10** say "I'd pay annual if I got 2 months free" → annual plan confirmed (already drafted)
- If **≥5 of 10** say "I'd never pay annual" → reconsider; monthly-first marketing
- If **≥3 of 10** say "I need a trial" → 14-day trial confirmed (already drafted)

### Rule 7: Launcher-build handoff
- If **≥3 of 10** are interested in both the build + subscription → the handoff policy matters, lock it
- If **0–1 of 10** care about the build → focus on subscription ladder only for now

---

## What to NOT change based on one call

One operator says "I'd want a cute little chatbot on my site." Tempting.
**Do not** add a chatbot to Wave 1 based on one ask.

One operator says "I hate SMS." Noted. Do not drop SMS from the ladder —
unless **≥3 of 10** agree.

One operator asks for something clearly outside scope (full payroll, fleet
management, website builder). Note it. Do not add it.

---

## Post-call cadence

### After each call
1. Log all 10 standing-question answers in the spreadsheet (same day)
2. Add any new objections to the log
3. Add any module requests we don't have to a separate "requested modules" tab

### After every 3 calls
1. Look for emerging patterns
2. If any of Rules 1–7 are already triggered, flag it to Program Office (but don't act yet — let all 10 calls complete)

### After all 10 calls
1. Apply Rules 1–7 based on final counts
2. Commit decisions to `docs/strategy/COMMERCIAL_DECISIONS.md`
3. Commit pack/module/pricing changes (if any) to `product/`
4. Update marketing copy
5. Move on to engineering Wave 1 with a now-validated ladder

---

## What counts as validation

**Ladder validated** when:
- Positioning answer converges (complement vs replace)
- At least 3 of 10 operators rate likelihood-to-buy ≥8 on Q9
- At least one module has unanimous "yes, I'd use" from everyone
- Objections cluster around ≤3 named blockers, each of which has a roadmap answer

**Ladder invalidated** when:
- Positioning is scattered (no convergence)
- Likelihood-to-buy ≥8 is 0 of 10
- Every module has split reception
- Blockers are fragmented across 8+ different reasons

If the ladder is invalidated, Wave 1 engineering stops. We return to
packaging.

---

## Sample outreach message

"Hi [name], I saw you run [HVAC company] in [city]. I'm building an
automation platform for HVAC operators and I'm doing 10 30-minute
interviews this month to understand what would actually be worth your
money. $50 gift card at the end, no sales pressure — this is research,
not a pitch. Open this week?"

---

## What "done" looks like

Sales Validation Plan is complete when:
- 10 calls completed
- Spreadsheet fully filled
- Rules 1–7 evaluated with explicit counts
- Decisions committed to `COMMERCIAL_DECISIONS.md`
- Any ladder changes committed to `product/`

Only then does Wave 1 engineering proceed at full capacity.

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-04-15 | Plan authored — script, 10 standing questions, objection log, 7 decision rules | Claude (drafted), pinohu (owner) |
