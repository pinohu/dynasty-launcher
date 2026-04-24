# JTBD journey maps & service blueprints

**Purpose:** Map every jobs-to-be-done (JTBD) cluster for Your Deputy / Dynasty Launcher to **customer journeys** and **service blueprints** (frontstage, backstage, systems), then **personas → pain IDs → system outputs → SB/journey stages → homepage & `/for/` messaging**. Keep this file and the **`docs/PERSONA_*_TRACE.csv`** files updated when product policy or scope changes.

**Related:** `PAIN_POINT_MASTER_MAP.md` (pain taxonomy), `maturity.html` (shipping truth), `CLAUDE.md` (architecture + enforced policies), **`docs/PERSONA_JOURNEY_STAGE_TRACE.csv`**, **`docs/PERSONA_SERVICE_BLUEPRINT_TRACE.csv`**, **`docs/PERSONA_HOMEPAGE_MESSAGING.csv`**.

---

## 1. JTBD cluster index (full set)

Each cluster is referenced as **J01–J26** in matrices below.

| ID | Cluster |
|----|---------|
| J01 | Situation recognition (why they show up) |
| J02 | Problem framing and scope control |
| J03 | De-risking and validation (decision support) |
| J04 | Market, competition, and positioning |
| J05 | Business model and economics |
| J06 | Brand, narrative, and trust |
| J07 | Product definition (what gets built) |
| J08 | Experience and interface specification |
| J09 | Content and copy production |
| J10 | Technical strategy (pre-code) |
| J11 | Implementation: software creation |
| J12 | Repository and engineering hygiene |
| J13 | Release engineering (deployable artifact) |
| J14 | Deployment and infrastructure operations |
| J15 | Identity, access, and security operations |
| J16 | Data layer operations |
| J17 | Monetization operations (payments) |
| J18 | Communications operations (email/SMS/voice/chat) |
| J19 | Growth systems operations (analytics, CRM, SEO tooling, booking) |
| J20 | Ongoing product iteration (post-launch) |
| J21 | Customer support and success |
| J22 | Governance, procurement, multi-party alignment |
| J23 | Transfer and continuity (handoff) |
| J24 | Emotional jobs (anxiety, confidence, load, momentum) |
| J25 | Social jobs (perceived competence, credibility, control) |
| J26 | Personal constraints (time, budget, skill, approvals, uncertainty) |

---

## 2. Journey map A — Outcome-led founder (“complete build-out”)

**Persona:** Wants a **live** URL, working flows, minimal operational homework. Accepts connecting accounts when told exactly what to do.

| Stage | Customer actions | Thoughts / needs | Pain risks | JTBD |
|-------|------------------|------------------|------------|------|
| A1 Discover | Lands from marketing, reads “What ships,” compares tiers | “Is this real? What do I actually get?” | Overpromise, jargon | J01,J04,J24,J25,J26 |
| A2 Evaluate | Reads maturity, pricing, Foundation vs Pro boundaries | “Will I be stuck without integrations?” | Tier confusion | J02,J22,J24 |
| A3 Commit | Pays / selects tier, authenticates | “Did I buy the right thing?” | Refund friction | J05,J22,J24 |
| A4 Intake | Enters idea, package, constraints in builder | “I need this translated into a plan.” | Ambiguous inputs | J02,J07,J26 |
| A5 Strategize | Runs scoring, frameworks, pivot / multi-model review | “I need second opinions and rigor.” | Cost, latency, trust | J03,J04,J06,J24 |
| A6 Specify | Reviews generated SPEC, roadmap, GTM docs | “Can I show this to someone?” | Doc quality, placeholders | J07,J08,J09,J22 |
| A7 Build | Waits through generation phases, validation gate | “Is the repo actually going to build?” | Failed builds, template leak | J10,J11,J12,J13,J24 |
| A8 Deploy | Triggers provision; watches GitHub/Vercel | “When is it live?” | Propagation, env gaps | J14,J23,J24 |
| A9 Configure | Adds **own** keys in Vercel / vendors (post–policy: placeholders only on Vercel) | “Why doesn’t auth work yet?” | Key handoff literacy | J15,J16,J17,J23,J26 |
| A10 Integrate | Optional modules (tier-gated) | “Which tools are actually connected?” | API limits, partial modules | J17–J19,J21 |
| A11 Operate | Uses app, monitors basics | “What breaks first?” | No observability story | J20,J21 |

---

## 3. Journey map B — Control-led builder (“kit / handoff first”)

**Persona:** Agency, technical cofounder, or security-minded buyer. Wants **artifacts + repo** they own; deploys under **their** accounts.

| Stage | Customer actions | Thoughts / needs | Pain risks | JTBD |
|-------|------------------|------------------|------------|------|
| B1 Discover | Seeks “export,” “handoff,” “no hostage keys” | “I won’t put client secrets on your dashboard.” | Positioning unclear | J01,J22,J25 |
| B2 Evaluate | Compares kit vs launch tier (commercial separation) | “I only need phases 1–7 + zip/repo.” | Feature bleed between tiers | J02,J05,J22 |
| B3 Commit | Buys kit tier or uses Foundation path | “What’s excluded?” | Hidden deploy steps | J05,J24 |
| B4 Intake | Same builder intake; may skip deploy | “Don’t push to my client’s Vercel without me.” | Accidental provision | J02,J15,J22,J23 |
| B5 Strategize | Same strategy passes; may weight docs over code depth | “Deliverables must be client-presentable.” | Too much code, too little narrative | J03,J06,J09,J22 |
| B6 Specify | Exports SPEC, MANUAL-ACTIONS, `.env.example` | “My dev should need zero guessing.” | Incomplete env matrix | J08,J09,J12,J23 |
| B7 Build | Validates locally or in their CI | “Your template must match our stack rules.” | Version drift | J11,J12,J13,J26 |
| B8 Handoff | Transfers repo + docs to client | “Liability boundary must be clear.” | Ambiguous ownership | J22,J23,J25 |
| B9 Client deploy | Client pastes keys, DNS, payments | “Webhook secret lives in **their** Vercel.” | Secret leakage habits | J14–J17,J23 |
| B10 Operate | Agency retains or exits | “Runbooks must exist.” | Knowledge loss | J20,J21,J23 |

---

## 4. Journey map C — Procurement / enterprise gate

**Persona:** Needs **artifacts for approval** before production access or vendor spend.

| Stage | Customer actions | Thoughts / needs | Pain risks | JTBD |
|-------|------------------|------------------|------------|------|
| C1 Discover | Finds maturity + policy docs | “Is data processing defined?” | Missing DPA path | J22,J24 |
| C2 Evaluate | Security review of builder behavior | “Do they hold our production secrets?” | Trust gap | J15,J22,J25 |
| C3 Commit | PO / invoice / legal | “We need versioned outputs.” | Informal deliverables | J22 |
| C4 Intake | Constrained inputs (no PII in prompt, or redacted) | “Compliance said don’t paste X.” | Accidental PII | J02,J22,J26 |
| C5 Strategize | Uses frameworks as **decision record** | “We need audit trail.” | Non-reproducible AI | J03,J22 |
| C6 Specify | SPEC + architecture + integration list | “Procurement wants a diagram and vendor list.” | Shallow integration map | J07,J10,J22 |
| C7 Build | May require **no** auto-deploy | “Staging only.” | Default deploy on | J13,J14,J22 |
| C8 Approve | Internal sign-off | “We approve handoff, not production.” | Confused go-live | J22,J23 |
| C9 Deploy | Internal IT executes | “Their doc must match our standards.” | Generic runbooks | J14,J23,J26 |

---

## 5. Journey map D — Sustainment / operator (post-delivery)

**Persona:** Owns the running product after handoff. Launcher involvement is **bounded**.

| Stage | Customer actions | Thoughts / needs | Pain risks | JTBD |
|-------|------------------|------------------|------------|------|
| D1 Onboard | Reads MANUAL-ACTIONS, `.env.example`, interactive onboarding dashboard (`public/onboard.html`), 90-day launch playbook (`LAUNCH-PLAYBOOK.md`); runs test suite and seeds demo data | “What do I check weekly?” | Doc rot | J21,J23,J26 |
| D2 Monitor | Logs, errors, billing portal | “Who owns Stripe/Clerk incidents?” | Vendor finger-pointing | J17,J21 |
| D3 Change | Ships features outside launcher | “Fork drift.” | No upgrade path | J20,J12 |
| D4 Market | SEO, campaigns, CRM | “Builder didn’t promise forever marketing.” | Expectation gap | J19,J20 |
| D5 Support | Tickets, refunds | “Playbooks?” | Missing ops docs | J21 |
| D6 Comply | Privacy, accessibility updates | “Legal said update terms.” | Static legal drafts | J09,J22 |

---

## 6. Service blueprint — episode index

Episodes are **SB00–SB08**. Each row is one **line of visibility** in classic blueprint style.

### SB00 — Awareness & trust formation

| Line | Content |
|------|---------|
| Physical evidence | `index.html`, `maturity.html`, marketing pages, `/api/provision?action=inventory` |
| Customer actions | Compare claims; open “What ships”; verify endpoints |
| Frontstage | Clear tier boundaries; honest limits |
| Backstage | Content updates; inventory truth in `provision.js` |
| Support systems | Vercel, DNS, static/API routes |
| Policies | Tier truth: **`TIER_MODULES`** matrix in `api/provision.js` (F=11 P=11 E=13 CV=19 slots); checkout + `/maturity` must match |

**JTBD primary:** J01,J04,J22,J24,J25.

---

### SB01 — Purchase / tier / authentication

| Line | Content |
|------|---------|
| Physical evidence | Stripe Checkout (where used), session flags, auth UI |
| Customer actions | Pay or start free path; sign in |
| Frontstage | Tier selection; post-login builder entry |
| Backstage | Stripe verification for paid tiers; `PROVISION_TIER_TRUST_CLIENT` dev-only escape hatch |
| Support systems | Clerk (product auth), Stripe, `app.html` gating |
| Policies | **Separate commercial tracks:** “kit / preparation” vs “complete build-out” are distinct offers (positioning); implementation may share one engine with a hard fork at deploy |

**JTBD primary:** J05,J22,J24,J26.  
**Conversation insight:** Kit vs launch should be **separated commercially and in messaging** even if one codebase powers both.

---

### SB02 — Builder intake & scope preview

| Line | Content |
|------|---------|
| Physical evidence | Idea textarea, archetype/site package, **Expected scope** panel |
| Customer actions | Enter idea; pick package/tier-valid combo |
| Frontstage | R/D/S matrix; Foundation caveat; **vendor keys callout** |
| Backstage | `updateBuildScopePreview()`, tier × archetype validation |
| Support systems | `app.html` local state, `V3_TIERS`, `V4_SCOPE_ROWS` |
| Policies | **Vendor keys:** launcher-side keys are for **building** and **one-time provisioning**; **live** product runs on **customer** accounts — `.env.example` + MANUAL-ACTIONS |

**JTBD primary:** J02,J07,J24,J26.  
**Conversation insight:** Credential boundary explained in UI (Expected scope).

---

### SB03 — Strategy, validation, multi-model review

| Line | Content |
|------|---------|
| Physical evidence | Scorecards, framework analyses, pivot pipeline UI |
| Customer actions | Run viability; run pivot / cross-review phases |
| Frontstage | Model cards, phases, cost meter |
| Backstage | Anthropic/OpenRouter/etc. via `api/ai.js` + client keys; `initReviewModels()` resolves pool |
| Support systems | `DYNASTY_TOOL_CONFIG`, user API keys in UI |
| Policies | **Pivot pipeline:** model list comes from **available keys**, not a fixed count; UI must reflect `REVIEW_MODELS` after init |

**JTBD primary:** J03,J04,J06,J24.  
**Conversation insight:** “7-model” was **default slice + UI order bug**; title/copy should reflect **dynamic count**.

---

### SB04 — Document & code generation (phases 1–7c)

| Line | Content |
|------|---------|
| Physical evidence | Progress UI, file tree preview, generated markdown/code |
| Customer actions | Wait; expand phases; review outputs |
| Frontstage | Phase labels; honest “generating…” states |
| Backstage | Client-side generation pipeline in `app.html`; GitHub API for push |
| Support systems | GitHub token (user-supplied), AI providers |
| Policies | Authority / quality gates may be non-blocking per product tuning; document actual behavior in `maturity.html` when changed |

**JTBD primary:** J07–J12,J24,J26.

---

### SB05 — Build validation gate

| Line | Content |
|------|---------|
| Physical evidence | Checklist results, warnings, blockers |
| Customer actions | Fix or acknowledge; retry |
| Frontstage | Eight-check gate (vercel.json, package.json, icons, css, imports, branding, i18n, links) |
| Backstage | Static analysis in `app.html` |
| Support systems | Same as SB04 |

**JTBD primary:** J11,J12,J13,J24.

---

### SB06 — Fork: export / handoff **vs** provision / deploy

| Line | Content |
|------|---------|
| Physical evidence | Download/repo push summary **or** provision result card |
| Customer actions | Export only **or** call `/api/provision` |
| Frontstage | Clear CTA: “Handoff” vs “Deploy” |
| Backstage | `api/provision.js`: GitHub repo create, Vercel project, env, deploy trigger |
| Support systems | `VERCEL_API_TOKEN`, `GITHUB_TOKEN`, `DYNASTY_TOOL_CONFIG` (orchestrator only) |
| Policies | **Option (a) enforced:** do **not** POST **real** third-party **secrets** to the **customer’s** Vercel project. Placeholders + customer dashboard handoff. `mod_billing` does not push Stripe webhook secret or Connect IDs via Vercel API. `api/neon.js` `set_vercel_db` does **not** write `DATABASE_URL` to customer Vercel — handoff response only |

**JTBD primary:** J13,J14,J23,J22.  
**Conversation insight:** Credential boundary is **enforced in code**, not only documentation.

---

### SB07 — Post-deploy integration modules (Foundation+ paid builds; widest surface on Custom Volume)

| Line | Content |
|------|---------|
| Physical evidence | Module result JSON in UI; MANUAL-ACTIONS updates |
| Customer actions | Approve provider accounts where needed |
| Frontstage | Module status: ok / fallback / manual |
| Backstage | `mod_*` functions in `provision.js`; vendor APIs |
| Support systems | Per-module keys in `DYNASTY_TOOL_CONFIG` |
| Policies | Modules follow **MODULE_INTERFACE.md**: create/configure with launcher keys; **delivered runtime** on **customer-owned** credentials where applicable |

**JTBD primary:** J17–J19,J21,J23.

---

### SB08 — Bounded support & operations ownership

| Line | Content |
|------|---------|
| Physical evidence | MANUAL-ACTIONS, `.env.example`, optional STATUS page |
| Customer actions | Operate vendor dashboards; rotate keys |
| Frontstage | Clear “what we don’t operate” boundary |
| Backstage | No long-lived proxying of customer traffic via launcher secrets (target state) |
| Support systems | Customer Vercel, Clerk, Stripe, Neon, etc. |
| Policies | **Sustainment** is **customer** (or agency) responsibility; launcher optimizes **derivative creation + one-time setup** |

**JTBD primary:** J20,J21,J23,J26.

---

## 7. Coverage matrix — JTBD × service episodes

Legend: **●** = primary coverage, **○** = partial / handoff only.

| JTBD | SB00 | SB01 | SB02 | SB03 | SB04 | SB05 | SB06 | SB07 | SB08 |
|------|------|------|------|------|------|------|------|------|------|
| J01 | ● | ○ | ○ | | | | | | |
| J02 | ○ | ○ | ● | ○ | ○ | ○ | ○ | | |
| J03 | | | ○ | ● | ○ | | | | |
| J04 | ○ | | ○ | ● | ○ | | | | |
| J05 | ○ | ● | ○ | | | | | | |
| J06 | ○ | | ○ | ● | ● | | | | |
| J07 | | | ○ | ○ | ● | ○ | | | |
| J08 | | | ○ | | ● | | | | |
| J09 | | | | | ● | | | | |
| J10 | | | | ○ | ● | ○ | | | |
| J11 | | | | | ● | ● | | | |
| J12 | | | | | ● | ● | ○ | | ○ |
| J13 | | | | | ○ | ● | ● | | |
| J14 | | | | | | | ● | ○ | ○ |
| J15 | | | ○ | | ○ | | ● | ○ | ● |
| J16 | | | | | ○ | | ● | ○ | ● |
| J17 | | | | | ○ | | ○ | ● | ● |
| J18 | | | | | | | ○ | ● | ○ |
| J19 | | | | | ○ | | ○ | ● | ● |
| J20 | | | | | | | | ○ | ● |
| J21 | | | | | | | ○ | ○ | ● |
| J22 | ● | ● | ○ | ○ | ○ | | ● | ○ | ○ |
| J23 | | | ○ | | ○ | | ● | ● | ● |
| J24 | ● | ● | ● | ● | ● | ● | ● | ○ | ○ |
| J25 | ● | ○ | | ○ | ○ | | | | ○ |
| J26 | ○ | ● | ● | | ● | | ● | | ● |

---

## 8. Coverage matrix — JTBD × journey stages (summary)

Rows are JTBD; columns aggregate journey stages (A1–A11, B1–B10, C1–C9, D1–D6) into **phases**:

- **Discover:** A1,B1,C1 + D implicit
- **Buy/enter:** A2–A3,B2–B3,C2–C3
- **Shape:** A4–A6,B4–B6,C4–C6
- **Build:** A7,B7,C7
- **Ship:** A8–A9,B8–B9,C8–C9
- **Run:** A10–A11,B10,D1–D6

| JTBD | Discover | Buy/enter | Shape | Build | Ship | Run |
|------|----------|-----------|-------|-------|------|-----|
| J01–J06 | ● | ● | ● | ○ | | |
| J07–J13 | ○ | ○ | ● | ● | ● | ○ |
| J14–J21 | | ○ | ○ | ○ | ● | ● |
| J22–J23 | ● | ● | ● | ○ | ● | ● |
| J24–J26 | ● | ● | ● | ● | ● | ● |

---

## 9. Personas, crosswalks, and intent overlays

### 9.1 Primary journey personas (this document)

| ID | Label | Journey map | Who | Dominant pains (clusters) |
|----|--------|-------------|-----|-----------------------------|
| **P-FOUNDER** | Outcome-led founder | A (A1–A11) | Wants live product + clear next steps | B, F, G, H, S, Z0 |
| **P-AGENCY** | Control-led builder / agency | B (B1–B10) | Owns repo, client secrets, handoff | F, G, J22–J23, P2, S, Z0 |
| **P-PROCURE** | Procurement / security gate | C (C1–C9) | Approvals before prod; audit trail | D, F, J22, R2, S4 |
| **P-OPERATOR** | Post-build operator | D (D1–D6) | Runs Vercel/Stripe/Clerk day-2 | F4, H, J21, P2, T |

### 9.2 Crosswalk to `PAIN_POINT_MASTER_MAP.md` personas (P1–P12)

| This doc | Pain map | Notes |
|----------|----------|--------|
| P-FOUNDER | P1,P2,P6,P10 | Overlaps “idea-stage,” “pre-revenue,” “pitch seller” |
| P-AGENCY | P11,(P2) | Agency/coach; often buys Foundation/Pro for clients |
| P-PROCURE | P4,(P7) | Enterprise-style gate; may overlap capital diligence |
| P-OPERATOR | P3,P12 | Ops-heavy SMB + “keep it running” |
| *(overlay)* **P-CAPITAL** | P7 | Heavy **C\*** pains; use journey A/C stages + **`/for/capital`** |
| *(overlay)* **P-TRADE** | P5,P6 | **Q\*** pains; **`/for/trades-vertical`** |
| *(overlay)* **P-AUTHORITY** | P8 | **M\*** SEO/authority; **`/for/authority-seo`** |
| *(overlay)* **P-MANAGED** | P12 | **T\*** pains; **`/for/managed`** |

---

## 10. Front-page and entry-path messaging (persona kits)

Use **`index.html`** for the default hero; use **`/for/`** and persona paths for **angled landings**. Pain IDs reference **`PAIN_POINT_MASTER_MAP.md`**.

### 10.1 P-FOUNDER (outcome-led) — default homepage alignment

| Element | Resonant messaging (principles) | Pain IDs addressed |
|---------|----------------------------------|---------------------|
| Title / H1 | Outcome: judgment + implementation + accountability; **live** trajectory | B1,B7,S2 |
| Meta description | Free score → decision-grade plans → shipped product; optional revenue stack | B1,B11,G1,S3 |
| Hero ribbon | “Walk out with …” concrete artifacts + **clear tier boundary** | S2,S3,Z0 |
| Primary CTA | Start free score / enter builder | A6,B1 |
| Secondary CTA | What ships today (`maturity`) | S2,S4 |
| Trust chips | Inventory endpoint, honest scope, “you own the repo” | G2,S4,Z0 |

### 10.2 P-AGENCY (control / handoff)

| Element | Resonant messaging | Pain IDs addressed |
|---------|-------------------|---------------------|
| H1 angle | **Implementation you hand off**; client keys stay on **their** Vercel | G2,P2,J22 |
| Subhead | Placeholder env policy; MANUAL-ACTIONS + `.env.example` as **source of truth** | P2,F4,S3 |
| CTA | “See credential boundary” / maturity + Foundation tier truth | Z0,S2 |
| Entry path | **`/for/foundation-diy`** | F4,G2 |

### 10.3 P-PROCURE (gate / enterprise)

| Element | Resonant messaging | Pain IDs addressed |
|---------|-------------------|---------------------|
| H1 angle | **Defensible artifacts** for approval; reproducible strategy passes | B5,J22,C8 |
| Subhead | What is generated vs what is **live-provisioned**; module inventory | S3,S4,Z0 |
| CTA | Maturity + inventory JSON; “no production secrets auto-injected” policy | J15,P2,S4 |
| Entry path | **`/for/full-launch`** (when broad scope) + diligence pack expectations | J22 |

### 10.4 P-OPERATOR (day-2)

| Element | Resonant messaging | Pain IDs addressed |
|---------|-------------------|---------------------|
| H1 angle | **Runbooks** over hype; where to paste keys; who owns incidents | R3,J21,P2 |
| Subhead | Post-deploy: Stripe/Clerk/Neon dashboards; not launcher-hosted secrets | H2,T1,P2 |
| CTA | MANUAL-ACTIONS, `.env.example`, managed positioning if offered | T1–T3 |
| Entry path | **`/for/managed`** | T1–T3 |

### 10.5 Overlays (supplemental landings)

| Overlay | `for/` path | Hero tension | Primary pain clusters |
|---------|-------------|--------------|------------------------|
| P-CAPITAL | `/for/capital` | Lender/investor-ready package | C,B,R2 |
| P-TRADE | `/for/trades-vertical` | Assistive workflow + liability guardrails | Q,R1 |
| P-AUTHORITY | `/for/authority-seo` | SEO/content depth as strategy | M,R1 |
| P-MANAGED | `/for/managed` | Stale automations / no cadence | T,M2 |
| Revenue ops | `/for/revenue-ops` | Leaks in leads/payments/follow-up | H,I,K,O |

---

## 11. Journey stages — pains satisfied and system outputs

**Columns:** **Stage** · **Primary persona(s)** · **Pain IDs** (from master map) · **System outputs** (artifacts/behaviors) · **Service blueprint episodes**

Outputs use shorthand: **G** = generated file in repo, **L** = live provisioned (when tier+keys allow), **M** = manual/fallback docs, **Gate** = validation gate.

| Stage | Persona(s) | Pain IDs | System outputs | SB |
|-------|------------|----------|----------------|-----|
| A1 | P-FOUNDER | S2,S3,S4,B1 | `maturity.html`, `index.html` claims, `/api/provision?action=inventory`, `/for/`, `/quiz` | SB00 |
| A2 | P-FOUNDER | Z0,S2,S3 | Tier comparison, Foundation module truth, `V3_TIERS` copy | SB00,SB01 |
| A3 | P-FOUNDER | B1,S2 | Stripe Checkout / session; tier verification | SB01 |
| A4 | P-FOUNDER,(P-CAPITAL) | A1,A2,A7,B11 | Builder intake; archetype; **Expected scope** panel; gov toggle | SB02 |
| A5 | P-FOUNDER | B1–B8,B10,B12,B14 | Viability scorecard; frameworks; multi-model pivot pipeline | SB03 |
| A6 | P-FOUNDER,P-PROCURE | F1,C8,B11,R2 | SPEC, ROADMAP, GTM set, competitive/TAM narratives (tiered) | SB04 |
| A7 | P-FOUNDER | F1–F9,G1,G2 | Phases 1–7c codegen; DESIGN, API/DATA docs; GitHub push | SB04 |
| A8 | P-FOUNDER | G1,G8,G10 | `provision.js` repo + Vercel project; deploy trigger; BUILD-REPORT path | SB06 |
| A9 | P-FOUNDER,P-OPERATOR | G6,G7,H1,P2 | Placeholder env on Vercel; **customer** keys in dashboard; `.env.example`, MANUAL-ACTIONS | SB06,SB08 |
| A10 | P-FOUNDER | H1–H5,I1–I4,J1–J5,K1–K4,L1–L6,M1–M8,N1–N5,O1–O8 | `mod_*` results (tier+archetype); fallbacks in UI | SB07 |
| A11 | P-FOUNDER,P-OPERATOR | T1,T2,J21,G8 | Ops ownership docs; smoke/verify spec; support boundary | SB08 |
| B1 | P-AGENCY | G2,P2,S2,S3 | Same as A1 + emphasis on policy in maturity / CLAUDE | SB00 |
| B2 | P-AGENCY | Z0,S2,B1 | Kit vs launch messaging; tier SKU clarity | SB00,SB01 |
| B3 | P-AGENCY | S2,B1 | Checkout or Foundation path; export-first expectation | SB01 |
| B4 | P-AGENCY | A7,J22,F4 | Intake without accidental client deploy; scope preview | SB02 |
| B5 | P-AGENCY,P-PROCURE | B3,B4,C8,R2 | Strategy artifacts client-presentable; plain-language toggle | SB03,SB04 |
| B6 | P-AGENCY | F4,R3,P2 | SPEC, MANUAL-ACTIONS, `.env.example`, START-HERE | SB04 |
| B7 | P-AGENCY | F9,G2 | Validation Gate; local/CI verify | SB05 |
| B8 | P-AGENCY | J22,J23,P2 | Export / repo-only handoff; liability boundary in docs | SB06 |
| B9 | P-AGENCY,P-OPERATOR | G4–G7,H1,H2 | Client Vercel env; DNS; Stripe webhook in **their** dashboard | SB06,SB08 |
| B10 | P-AGENCY,P-OPERATOR | J20,J21,F4 | Runbooks; optional managed narrative | SB08 |
| C1 | P-PROCURE | D6,J22,S4 | Public maturity + policy; scope boundary | SB00 |
| C2 | P-PROCURE | J15,P2,J22 | Credential boundary; no customer secret injection (option a) | SB00,SB02,SB06 |
| C3 | P-PROCURE | J22,C8 | PO path; versioned deliverable list | SB01 |
| C4 | P-PROCURE | A7,J22 | Redacted/constrained intake | SB02 |
| C5 | P-PROCURE | B5,B14,J22 | Auditable strategy outputs | SB03 |
| C6 | P-PROCURE | F1,F2,J22 | SPEC, DATA-MODEL, API-CONTRACTS, integration map | SB04 |
| C7 | P-PROCURE | G1,J22 | **No** auto-deploy or staging-only workflow (product decision) | SB05,SB06 |
| C8 | P-PROCURE | J22,J23 | Sign-off on handoff vs production | SB06 |
| C9 | P-PROCURE,P-OPERATOR | G4,G7,F4 | IT-run deploy using shipped runbooks | SB08 |
| D1 | P-OPERATOR | R3,F4,P2 | MANUAL-ACTIONS, `.env.example`, CREDENTIALS inventory, `public/onboard.html`, `LAUNCH-PLAYBOOK.md`, test suite (`src/__tests__/`), seed data (`src/data/seed/`), API collection (`docs/openapi.json`) | SB08 |
| D2 | P-OPERATOR | H2,H3,J21 | Stripe/Clerk dashboards; webhook health | SB08 |
| D3 | P-OPERATOR | F9,J20 | Fork; drift from template | SB08 |
| D4 | P-OPERATOR | M2,T2,J19 | Expectation: marketing not infinite; docs pointer | SB08 |
| D5 | P-OPERATOR | J21 | Support playbooks (generated hints) | SB08 |
| D6 | P-OPERATOR | D2,J22 | Counsel-reviewed legal updates (handoff from generated drafts) | SB08 |

---

## 12. Service blueprint episodes — persona, pains, outputs, messaging

| SB | Primary personas | Pain clusters (letters) | Representative pain IDs | System outputs / behaviors | Messaging / surface |
|----|------------------|-------------------------|-------------------------|----------------------------|---------------------|
| SB00 | All | S,B,Z0 | S2,S3,S4,B1,Z0 | Honest tier + module truth; inventory API | `index.html`, `maturity.html`, `/for/index.html` |
| SB01 | P-FOUNDER,P-AGENCY,P-PROCURE | B,S,J22 | B1,S2,J22 | Stripe tier verify; auth to builder | Hero CTAs; checkout copy |
| SB02 | All | A,F,J22,P | A1,A7,F4,P2,J22 | Intake; R/D/S scope; vendor-key callout | `app.html` Expected scope |
| SB03 | P-FOUNDER,P-AGENCY,P-PROCURE | B,R | B1–B8,B14,R4 | Multi-model review; scorecard | Builder strategy UI |
| SB04 | P-FOUNDER,P-AGENCY,P-PROCURE,P-CAPITAL | F,C,D,E,M,R,W,Q | F1–F9,C1–C8,D*,E*,M*,R*,W*,Q* | Doc+code phases; optional gov/trade packs | Phase list in builder |
| SB05 | P-FOUNDER,P-AGENCY,P-PROCURE | F,G | F9,G8 | Eight-check validation gate | Gate UI in `app.html` |
| SB06 | P-FOUNDER,P-AGENCY,P-PROCURE,P-OPERATOR | G,H,P,J22 | G1–G7,P2,H1 | Provision OR export; placeholder Vercel env | Provision results; policy in CLAUDE |
| SB07 | P-FOUNDER,(P-AGENCY clients) | H–O,U | H1,I1,J1,K1,L1,M1,N1,O1 | `mod_*` per tier/archetype | Module status JSON in UI |
| SB08 | P-OPERATOR,P-AGENCY | P,T,J21,R | P2,T1,R3,J21 | MANUAL-ACTIONS, `.env.example`, ops boundary | Post-build docs; `/for/managed` |

---

## 13. Machine-readable traces (CSV)

| File | Contents |
|------|-----------|
| **`docs/PERSONA_JOURNEY_STAGE_TRACE.csv`** | One row per journey **stage** (A1…D6): persona, pain_ids, outputs, sb_episodes |
| **`docs/PERSONA_SERVICE_BLUEPRINT_TRACE.csv`** | One row per **SB00–SB08**: personas, pain_ids, outputs, messaging_surface |
| **`docs/PERSONA_HOMEPAGE_MESSAGING.csv`** | One row per **messaging field** per persona kit (§10) |

Update these CSVs whenever §10–12 change.

---

## 14. Conversation-sourced decisions (changelog)

Record **product/architecture insights** from internal sessions so GTM and code stay aligned.

| Date | Topic | Decision / insight | Where enforced / linked |
|------|--------|-------------------|-------------------------|
| 2026-04-12 | Credential boundary | Launcher keys: **derivative creation + one-time provisioning**, not long-term operation of customer apps | `CLAUDE.md`, `maturity.html`, `app.html` Expected scope, `templates/MODULE_INTERFACE.md`, `api/provision.js` header comment |
| 2026-04-12 | Customer Vercel secrets | **Option (a):** no real Clerk/Stripe secrets auto-pushed; placeholders + customer dashboard; `mod_billing` no Vercel env push; `set_vercel_db` no `DATABASE_URL` push | `api/provision.js`, `api/neon.js`, `CLAUDE.md` |
| 2026-04-12 | Commercial architecture | **Kit / preparation** vs **complete build-out** = **separate offers** (messaging + pricing); may share one engine, hard boundary at deploy/export | This doc SB01, SB06; marketing TBD |
| 2026-04-12 | Pivot pipeline UI | Card count must follow **`REVIEW_MODELS` after `initReviewModels()`**; labels use dynamic model count, not fixed “7” | `app.html` (`runPivotReview`, `showPipelineUI`, prompts) |
| 2026-04-12 | Tier truth | Foundation does **not** auto-provision integration modules | `index.html`, `provision.js` `TIER_MODULES`, `app.html` `V3_TIERS` |
| 2026-04-12 | Persona ↔ journey ↔ SB ↔ pain ↔ messaging | Full trace in **§9–13** + CSVs; `PAIN_POINT_MASTER_MAP.md` Part 4 item 5 | This file, `docs/PERSONA_*_TRACE.csv` |

---

## 15. Maintenance

When you change **tier promises**, **provision behavior**, or **key-handling policy**:

1. Update **`maturity.html`**, this file **§14**, and **§11–12** if customer-visible steps move.
2. Update **service blueprints** SB06–SB08 and the **CSV traces**.
3. Re-scan **coverage matrix** if new episodes appear (e.g. managed services).
4. Keep **`PAIN_POINT_MASTER_MAP.md`** Part 2 rows and this doc **§11–12** aligned on pain IDs.

---

*End of document.*
