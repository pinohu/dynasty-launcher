# Agency Outreach — Email Templates

Three variants for landing agencies as white-label fulfillment partners.

**Positioning**: "We give you the fulfillment layer for launching entire
businesses — so you can sell $20k–40k engagements at agency margins, then
retain clients on $1.5–2.5k/mo without hiring."

**Target persona**: Marketing / dev agency owner or principal consultant who:
- Already charges clients $3k+/mo in retainers OR $10k+ per engagement.
- Gets asked for full launch packages they can't scope profitably.
- Has 3+ clients in similar niches (repeatable).
- Hits a fulfillment-capacity ceiling around 10 active clients.

**Offer shape**:
- Tier 1 (Lite): $1,997 / launch — docs + code + deploy. Client self-provisions integrations.
- Tier 2 (Standard, most agencies): $4,997 / launch — 11 integration modules provisioned on client accounts.
- Tier 3 (Complete): $9,997 / launch — all 19 modules + Deep Mode board-grade strategy docs.
- Tier 4 (Managed retainer): $497/mo — resold at $1,500–$2,500/mo.

**Agency retail range**: $15k–$40k per engagement (sweet spot: $20–25k).

**Agency margin at standard tier**: 75–87%.

---

## Variant A — Cold outreach (via LinkedIn / email)

Use when: first-touch to agency owner found via research (LinkedIn, agency
directories, niche Slack groups, Twitter). No prior relationship.

Personalize the `{niche}` and `{specific_observation}` fields. The rest is
boilerplate.

**Subject lines (A/B test)**:
1. `one-person fulfillment engine for the $20k launches you keep turning down`
2. `re: {agency_name} fulfillment capacity`
3. `quick — are you still quoting full-launch packages?`

**Body**:

```
Hey {first_name},

Saw {agency_name} runs {niche} launches — {specific_observation about a
recent case study, post, or client}. Curious how you're handling the
engagements that need the full stack: site + Stripe + email + CRM +
automations + legal docs + social.

Most agencies I talk to quote $25–40k for those, then spend 6 weeks
stitching it across 8 contractors. Margin gets eaten alive.

I built a tool that does the whole stack in one afternoon — real code,
client-owned infrastructure (their Stripe, their Vercel, their domain),
not a locked-in template factory. I'm not selling it publicly yet. I'm
looking for 3 agencies to run it white-label on live client work, keep
the revenue, and tell me what breaks.

Cost to you: nothing. You sell at your normal rate. I ship the
fulfillment.

Worth a 20-min look next week? I'll build a live demo in front of you.

— Polycarp
yourdeputy.com/for/agencies
```

**Notes**:
- Keep under 180 words. Cold email attention span is ~8 seconds.
- The "nothing / you keep revenue" framing kills the natural "what's the catch?" instinct.
- Landing at a tangible CTA (20-min live demo) converts ~3× better than "hop on a call".

---

## Variant B — Warm (inbound inquiry about fulfillment)

Use when: agency has already expressed interest (form submission, referral,
reply to a post). They need specifics, not more pitch.

**Subject**: `Re: capacity — here's what I can actually deliver`

**Body**:

```
Hey {first_name},

Thanks for the note. Quick frame on what fulfillment looks like on our
side:

- Turnaround: 14 days from brief to live (not 6–8 weeks)
- Scope per engagement: domain + email + SSL + Stripe products & webhooks
  + Acumbamail sequence + SMS-iT campaigns + CallScaler AI phone + Trafft
  booking + SEO content + legal docs (GDPR/CCPA) + 260-post social
  calendar + SuiteDash CRM + 7 n8n workflows + 353-automation importable
  catalog
- Your cost: $4,997 if we operate the console for you; $0 if you want
  white-label console access and run it yourself
- Your retail: $15–40k depending on how you position it
- Margin: 85–90% either way

Everything lands on the client's own accounts — their Stripe, their
Vercel, their GitHub, their domain. No platform lock-in.

Happy to run one live on a real client this week as proof. Got a project
in the pipeline that fits?

— Polycarp
```

**Notes**:
- Lead with specifics. Warm leads have already bought the pitch; now they're
  evaluating fit.
- The "no lock-in" line kills the GoHighLevel objection before it's raised.
- "Run one live on a real client this week" = free fulfillment as a trial
  close.

---

## Variant C — Referral intro

Use when: mutual contact made the intro. Highest-intent channel; warmest
possible open.

**Subject**: `{mutual_name} thought we should talk`

**Body**:

```
Hey {first_name},

{mutual_name} mentioned you're {specific pain — e.g. "scaling fulfillment
past 10 clients" / "looking to add launch engagements to retainer work"}.

Quick context: I run a tool that handles end-to-end business launches —
code, infrastructure, payments, email/SMS/phone, CRM, legal docs, 353
automation workflows — all on the client's own accounts. Normal agency
cost for this stack is $25k+ in subcontractor fees. Ours runs at 85%+
margin because everything downstream of the brief is automated.

Looking for 3 agencies to use it under white label on live client work.
No cost, no commitment. If it pays off, we formalize. If it doesn't, you
got fulfillment for 3 launches on the house.

Worth a 20-min call? Here's my calendar: {cal_link}

— Polycarp
```

**Notes**:
- Reference `{mutual_name}` explicitly in the first sentence — social proof.
- The "3 launches on the house" frame reframes risk: instead of "try the
  product", it's "take free labor if nothing else."
- Include calendar link only for referrals (highest intent warrants the
  scheduling friction).

---

## Follow-up cadence

**Day 0**: Initial send (Variant A / B / C based on channel).

**Day 3**: Short bump if no reply.

```
Hey {first_name}, short bump in case the first note got buried — no
pressure, but wanted to make sure it landed. Happy to send a 2-min Loom
walkthrough instead of a call if that's easier.
— Polycarp
```

**Day 10**: Value-drop. Send a specific asset that demonstrates competence.

```
Hey {first_name}, in case it's useful — here's a build we shipped for a
{similar_niche} in 12 days: {live URL}. Walks through the actual
deliverables so you can see if the scope matches your typical engagement.
No response needed.
— Polycarp
```

**Day 21**: Final close-out.

```
Hey {first_name}, going to stop following up since I haven't heard back —
know it's noisy. If anything changes or you want to circle back, yourdeputy.com/for/agencies has the full rundown. No bad blood either way.
— Polycarp
```

4 touches max. More than that erodes reply rates and starts looking
desperate.

---

## Channel-specific notes

**LinkedIn DM**: Cut Variant A to ~80 words. LinkedIn inbox shows the
first ~4 lines as preview. Lead with the value prop line, not the intro.

**Email to generic info@ addresses**: Don't. Find the principal on
LinkedIn and email them directly.

**Cold-caller / SDR forwards**: Skip. These pattern-match to spam. Lose
agency trust.

**Twitter/X DM**: Only for agencies you've had prior interactions with
(reply, retweet). Otherwise goes to requests folder.

**Niche Slack / community DM**: Only if permitted by community rules.
Violating = lifetime ban from the funnel.

---

## Measuring what works

Track per variant:
- Open rate (email — target 40%+ for cold, 70%+ for warm/referral)
- Reply rate (target 8%+ for cold, 30%+ for warm, 60%+ for referral)
- Booked call rate (% of replies that convert to a walkthrough)
- Closed launch rate (% of walkthroughs that become paid engagements)

First 30 days: 50 cold Variant A sends → ~4 replies → ~2 walkthroughs → ~1
paid launch = $20k. Second 30 days: replicate + formalize warm/referral
pipeline.

---

## Do / don't

**Do**:
- Research the agency before sending (look at client work, case studies).
- Name-drop one specific, verifiable detail from their site.
- Offer the trial launch as free labor on their terms.
- Hand off the client relationship cleanly (they retain ownership, always).

**Don't**:
- Send identical boilerplate to 200 agencies. Quality > volume.
- Hide the catch (vendor-key gaps, manual steps, where it doesn't apply).
- Quote retail prices in the outreach. Let them price their own engagements.
- Promise software that doesn't exist. Under-promise, over-deliver.
