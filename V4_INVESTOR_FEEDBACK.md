# Your Deputy V4 — Investor Feedback Specification
## Plain language · Build archetypes · Sub‑5‑minute real demo · Pain‑point module

**Date:** April 10, 2026 | **Version:** 4.0 DRAFT | **Status:** PLAN — Awaits explicit green light before implementation

**Source:** Post–investor meeting feedback + product owner decisions captured in-session.

---

## 0. RELATIONSHIP TO V3

V3 remains the **reference architecture** (20 phases, 19 `mod_*` integration types tier-gated to 11 / 11 / 13 / 19 slots, `app.html` + `api/provision.js`, `DYNASTY_TOOL_CONFIG`). V4 **adds**:

1. A **plain-language layer** (toggle; dual outputs).
2. **Build archetypes** (site shape + module depth), orthogonal to but **mapped to** commercial tiers.
3. A **Demo / Express** profile that **actually deploys** and finishes in **≤5 minutes** for a live pitch.
4. **`mod_vertical_tool` (working name)** — an **add-on** in the pipeline that generates a **niche pain-point tool** alongside the main business build.

No V3 capabilities are removed; V4 introduces **narrower paths** and **optional depth**.

---

## 1. VISION (V4 ADDENDUM)

**Same north star as V3:** one structured brief → deployed business + docs + integrations.

**V4 stretch:** the same engine must serve (a) a **trades owner** who wants a **one-page site + a blueprint helper**, (b) a **consultant** who wants the **full MBA stack**, and (c) a **live demo** where the founder types an idea on a projector and sees **real URL + real score + real deploy** inside five minutes.

---

## 2. PLAIN-LANGUAGE MODE

### 2.1 Owner decisions (locked)

| # | Decision |
|---|----------|
| 1 | **Toggle** in the builder (not forced default for all users). |
| 2 | **Both outputs** ship: technical depth is **preserved**, not replaced. |
| 3 | **All 78+ depth docs remain technical** in their primary files; plain language is **additive**. |

### 2.2 Product design

- **UI:** Build config step adds **"Document style"**: `Technical (default)` | `+ Plain-language companion` (toggle on = generate companions).
- **Default recommendation:** For **Foundation** tier, pre-enable the toggle in UX copy ("Recommended for most owners"); **Enterprise** defaults off but one click restores full technical-only export.
- **Deliverable layout (recommended):**
  - Keep existing paths, e.g. `docs/GTM-PLAYBOOK.md`, `SPEC.md`, etc. **unchanged** (technical).
  - Add a **parallel tree** `docs/plain/` (or `docs/owner/`) with **1:1 files**: e.g. `docs/plain/GTM-PLAYBOOK.md` = same headings structure where possible, but **8th–10th grade reading level**, **no unexplained acronyms**, **"What this means for you"** boxes, **next actions** bullets.
  - Add a single **`docs/plain/START-HERE.md`** (≤3 pages) that links to the owner summaries and states: *"For lenders/investors, use the technical originals in `/docs`."*

### 2.3 Generation approach

- **Phase 4a–4b / business doc phases:** After technical doc is finalized, run a **second pass** (or parallel model call) with a fixed **Plain Language System Prompt**: define terms on first use, ban acronym-only sentences, mandatory "So what?" closing per section.
- **QA gate extension:** New check: every `docs/plain/*.md` must pass a **readability band** (target ~8th–10th grade reading level, e.g. Flesch-Kincaid grade) + **zero unexplained acronyms** (whitelist: LLC, EIN, URL, SEO if expanded once).

### 2.4 Scope boundary

- **Technical depth is not dumbed down** in primary files; plain folder is the **translation layer**, not a replacement for legal/financial due diligence.

---

## 3. BUILD ARCHETYPES (SITE SHAPE + DEPTH)

### 3.1 Owner decisions (locked)

| # | Decision |
|---|----------|
| 4 | **Tiers that make the most sense** — see §3.2 (product recommendation). |
| 5 | **Relationship to $1,997 / $4,997 / $9,997** — see §3.3 (**orthogonal + mapped**). |
| 6 | **Which modules turn off at smaller builds** — see §3.4 (**module matrix**). |

### 3.2 Recommended archetypes

| Archetype | Site shape | Doc depth (indicative) | Target user |
|-----------|------------|------------------------|-------------|
| **A — Demo / Express** | Single landing + contact/CTA; minimal legal links; **no blog** | Scorecard + 3–5 owner summaries + README | Live pitch; investor in room |
| **B — Landing (1-page)** | Single scrollable page + optional booking embed | Express + light SPEC + OPERATIONS-lite | Solopreneur, lead-gen only |
| **C — Starter (5-page)** | Home, About, Services, Pricing, Contact | Subset of V3 strategy docs; no long-form KB | Local service business |
| **D — Growth (app + marketing)** | Multi-route Next.js app + dashboard shell as today | Near-V3 document set; SEO posts optional count | SaaS-light, coaches, agencies |
| **E — Authority** | Existing authority-site generator path | Authority content pack + SEO cluster | Niches competing on trust |
| **F — Enterprise Full** | Current V3 **full** output | Full 90+ docs + all modules | Maximum bundle |

**Naming in UI:** "Build type" or "Site package" — avoid "tier" alone (confuses with price).

### 3.3 Pricing vs archetype (recommended)

- **Orthogonal dimensions:**
  - **Price tier** (Foundation / Professional / Enterprise): **caps which integrations and API calls** you may run (Stripe connected account, SuiteDash, etc. per V3).
  - **Build archetype**: **caps pages, doc count, and which `mod_*` blocks run** by default.
- **Compatibility matrix (enforcement):**
  - Foundation **cannot** select Custom Volume + all 19 modules; UI grays out invalid combos.
  - Enterprise **can** select Demo Express (e.g. for a fast customer proof) — still bills as Enterprise but **runs a short pipeline**.

### 3.4 Module gating by archetype (recommended defaults)

Legend: **R** = run when price tier allows · **D** = defer (post-build job or owner email "finish setup") · **S** = skip by default.

| Module / phase cluster | Demo | 1-page | 5-page | Growth | Authority | Full |
|------------------------|------|--------|--------|--------|-----------|------|
| Hosting + SSL + email DNS | R | R | R | R | R | R |
| Stripe billing | D | D | R | R | R | R |
| CRM / SuiteDash | S | S | D | R | R | R |
| Phone / voice / booking | S | S | S | D | R | R |
| Email + SMS marketing | S | D | R | R | R | R |
| SEO posts (5) | S | S | D | R | R | R |
| Video + design kit | S | S | S | D | R | R |
| Analytics + leads + chatbot | S | D | R | R | R | R |
| Legal PDFs | D | D | R | R | R | R |
| n8n (7 workflows) | S | S | D | R | R | R |
| Directory / WordPress | S | S | S | D | R | R |
| Social calendar | S | S | D | R | R | R |

*Defaults only; `modules_enabled` and price tier always win in edge cases.*

### 3.5 Implementation hooks

- **`build_profile` JSON** in request body to `api/provision` + mirrored in `app.html` phase runner: `{ archetype, plainLanguage: boolean, verticalTool: boolean, verticalToolSpec: {...} }`.
- **Phase scheduler** in `app.html`: early phases skip file generators not needed for archetype; **provision.js** reads same profile to **skip `mod_*`** and return `skipped: true` with reason (no fake success).

---

## 4. SUB–5-MINUTE REAL DEMO PROFILE

### 4.1 Owner decisions (locked)

| # | Decision |
|---|----------|
| 7 | **Real** deploy and real scoring — not a mock UI. |
| 8 | **Accept arbitrary business ideas on the spot** (typed in session). |

### 4.2 Design

- **Archetype A (Demo / Express)** + **parallel execution:**
  - Viability scoring runs **concurrently** with **Phase 1–2–7** minimal file set (landing only).
  - **Phase 8 deploy** ASAP with **subset repo** (~20–35 files vs 140+).
  - **Post-build queue:** email + dashboard banner "Completing: Stripe, CRM..." for anything deferred.
- **Success metric:** Wall-clock **≤5:00** from "Start" to **live HTTPS URL** + **scorecard visible** in app (not necessarily every module green).
- **Investor narrative:** "This is the same production path — we narrowed the surface for speed."

### 4.3 Guardrails

- Demo profile **must** write `BUILD-MANIFEST.json` listing what was **deferred** so sales does not over-promise.

---

## 5. PAIN-POINT MODULE (`mod_vertical_tool`)

### 5.1 Owner decisions (locked)

| # | Decision |
|---|----------|
| 9 | **Module inside existing pipeline** (add-on), not a separate product SKU at first. |
| 10 | **As many input modalities as practical:** text, image(s), file upload, optional URL, optional voice-to-text (browser). |
| 11–12 | **Output + stack:** product judgment — see §5.2–5.3. |
| 13 | **Flagship example:** *Anthony & Sons Concrete (Erie, PA)* — ingest **blueprint photos/PDFs** → structured **takeoff assist** + **job cost interpretation** (materials/labor assumptions explicit). |
| 14 | **Business model:** see §5.4. |

### 5.2 Recommended output shape (robust + valuable)

- **Not** "magic guaranteed estimate" (liability + accuracy). **Is:** **AI-assisted structured workbook** the contractor reviews before bidding.
- **Deliverable:**
  - **Web tool** at `{primaryDomain}/tool/takeoff` (or subdomain `tool.{domain}` if DNS pattern prefers).
  - **Flow:** Upload drawings → **extracted quantities line items** (with confidence) → **editable assumptions** (waste %, local material $, labor hrs) → **export CSV/PDF** + **audit trail** ("user confirmed line 12").
  - **Human-in-the-loop** mandatory for dollar totals shown to third parties.
- **Stack:** Reuse **same Next.js repo** as main build; **App Router** route group `app/tool/...`; **object storage** for uploads (Vercel Blob or S3-compatible); **Postgres** for job rows; **server actions** for mutations; **Claude + vision** (or dedicated doc model) for blueprint parsing — with **page-level disclaimer** in UI.

### 5.3 Pipeline placement

- **New phase after 7c (pre-deploy):** `7d — Vertical tool scaffold` generates routes, schema (`vertical_jobs`, `line_items`), UI shell, env keys placeholder.
- **`mod_vertical_tool` in provision.js:** provisions storage bucket / env, wires webhook if needed; **fails soft** → OPERATIONS.md manual.
- **Prompt pack:** `VERTICAL-CONCRETE-TAKEOFF.md` (example) as template; future niches clone pattern.

### 5.4 Business model (recommendation)

- **Foundation:** not available (avoid support load).
- **Professional:** **one** vertical tool included (single niche template from library).
- **Enterprise:** **two** tools or custom spec within scope cap.
- **Add-on:** $X one-time for additional vertical pattern (future pricing table).

### 5.5 Honest scope note (for roadmap)

Production-grade **planimetry from arbitrary blueprints** is a **category of product**, not a single sprint. V4 **ships the architecture + first vertical** with **assisted** (not fully autonomous) takeoff; marketing copy must say **"assist"** not **"automatic binding bid."**

---

## 6. ARCHITECTURE DELTA (V3 → V4)

```
app.html
  +-> Build config: documentStyle, archetype, verticalTool + inputs
  +-> Phase scheduler (skip/defer by archetype)
  +-> Demo / Express timing telemetry

api/provision.js
  +-> build_profile parsing on all actions
  +-> mod_vertical_tool (new)
  +-> Module runner respects skip/defer + manifest

repo output
  +-> docs/plain/*  (optional)
  +-> BUILD-MANIFEST.json
  +-> app/tool/* (optional vertical tool)
```

---

## 7. SPRINT ORDER (RECOMMENDED)

| Sprint | Scope | Unlocks |
|--------|--------|---------|
| **S0** | `build_profile` plumbing + module skip matrix + `BUILD-MANIFEST.json` | Honest archetypes |
| **S1** | Demo / Express path + ≤5 min SLA telemetry | Investor-grade live demo |
| **S2** | Plain-language toggle + `docs/plain/` + START-HERE | SMB comprehension |
| **S3** | 1-page + 5-page templates (UI + generator cuts) | Simpler SKUs |
| **S4** | `mod_vertical_tool` MVP (concrete takeoff **assist**) | Differentiated niche story |

Parallel possible: S2 copywriting prompts while S1 engineering runs.

---

## 8. OPEN ITEMS (POST-APPROVAL)

- Exact **file counts** per archetype for sales parity with landing page.
- Whether **Authority** and **Enterprise Full** merge or stay distinct in pricing table.
- **Regulatory** review string for vertical tools (construction estimating disclaimers).
- **Rotate `ADMIN_KEY`** if ever exposed; confirm **`?returning=1`** + admin reload fix is on production branch.

---

## 9. APPROVAL

**Implementation begins only after explicit product owner sign-off** on: (1) archetype list + matrix, (2) plain-language folder convention, (3) demo SLA definition, (4) vertical tool MVP scope wording for marketing.

---

*End of V4 Investor Feedback Specification*
