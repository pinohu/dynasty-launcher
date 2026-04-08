# Dynasty Launcher V3 — Full Business Provisioning Engine
## Complete Build Specification

**Author:** Claude (CEO, Dynasty Empire)
**Date:** April 7, 2026
**Status:** PLAN — Awaiting approval before implementation
**Scope:** Transform Dynasty Launcher from a code generator into a complete business provisioning engine

---

## 1. VISION

**Current state:** User describes a business idea → Dynasty generates code + documents → deploys to Vercel. The user gets a website and markdown files. Everything else is manual.

**Target state:** User describes a business idea → Dynasty provisions a complete operating business: live website on custom domain, business email, phone number with AI receptionist, CRM with client portal, email marketing sequences active, SMS campaigns ready, SEO content published, booking system, billing configured, legal documents generated, analytics active, and automation workflows connecting everything. The user walks away able to accept customers.

---

## 2. ARCHITECTURE

```
┌─────────────────────────────────────────────────────────┐
│                    DYNASTY LAUNCHER V3                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  app.html (Frontend)                                     │
│    └→ Build Pipeline: 16 phases (currently 12)           │
│                                                          │
│  api/provision.js (Backend Orchestrator)                  │
│    └→ Integration Modules (new):                         │
│         ├→ mod_hosting.js    (20i)                        │
│         ├→ mod_crm.js        (SuiteDash)                 │
│         ├→ mod_email.js      (Acumbamail)                │
│         ├→ mod_phone.js      (CallScaler + Insighto)     │
│         ├→ mod_sms.js        (SMS-iT)                    │
│         ├→ mod_seo.js        (WriterZen + NeuronWriter)  │
│         ├→ mod_video.js      (Vadoo AI + Fliki)          │
│         ├→ mod_design.js     (SUPERMACHINE + Pixelied)   │
│         ├→ mod_billing.js    (Stripe)                    │
│         ├→ mod_analytics.js  (Plerdy + PostHog)          │
│         ├→ mod_leads.js      (Happierleads + Salespanel) │
│         ├→ mod_docs.js       (Documentero)               │
│         ├→ mod_automation.js (n8n workflows)             │
│         ├→ mod_directory.js  (Brilliant Directories)     │
│         └→ mod_community.js  (Heartbeat + FuseBase)      │
│                                                          │
│  DYNASTY_TOOL_CONFIG (env var — credential store)        │
│    └→ Already exists with 40+ keys by category           │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Key principle:** Each integration module is a standalone function that takes the project config (name, description, type, credentials) and provisions one service. Modules are independent — if one fails, others continue. Every module returns a status object that gets included in the build report.

---

## 3. BUILD PIPELINE (16 Phases)

### Existing Phases (keep as-is)
| # | Phase | What it does | Time |
|---|-------|-------------|------|
| 1 | Design System | DESIGN.md + CLAUDE.md | 8s |
| 2 | Product Docs | SPEC, ROADMAP, README, MANUAL-ACTIONS, .env | 15s |
| 3 | Supporting Docs | DATA-MODEL, API-CONTRACTS, KB-OUTLINES | 12s |
| 4a | Business System | BUSINESS-SYSTEM, REVENUE-MODEL, GTM-PLAYBOOK | 15s |
| 4b | Agent System | AGENT-SYSTEM, FAILURE-MODES | 10s |
| 5 | Backend Code | FastAPI + Docker (when applicable) | 12s |
| 7 | Frontend | Next.js scaffold (8 core files) | 15s |
| 7b | Template Override | All 10 template components + translations | 12s |
| 7c | Backend Integration | DB schema, API routes, dashboard, billing config | 12s |

### New Phases (add these)
| # | Phase | What it does | Time |
|---|-------|-------------|------|
| 8 | Hosting & Domain | 20i: provision hosting, custom domain, DNS, SSL, business email | 5s |
| 9 | CRM & Portal | SuiteDash: create workspace, configure pipeline, load onboarding | 8s |
| 10 | Communications | CallScaler: phone number + Insighto: voice agent + Trafft: booking | 6s |
| 11 | Email & SMS | Acumbamail: create list + import sequences + SMS-iT: campaigns | 5s |
| 12 | SEO & Content | WriterZen: keyword research + NeuronWriter: write 5 blog posts | 20s |
| 13 | Visual Assets | SUPERMACHINE: hero image + Pixelied: OG images + Vadoo: explainer video | 15s |
| 14 | Analytics & Leads | Plerdy: heatmaps + Happierleads: visitor ID + PostHog: funnels | 4s |
| 15 | Legal Documents | Documentero: ToS, Privacy Policy, Service Agreement as PDFs | 5s |
| 16 | Automation | n8n: create 5 core workflows connecting all provisioned tools | 10s |

**Total estimated build time:** 3-4 minutes (up from ~2 minutes currently)

---

## 4. INTEGRATION MODULES — DETAILED SPECIFICATIONS

### Module 1: mod_hosting.js (20i)

**Credential keys from DYNASTY_TOOL_CONFIG:**
```json
{
  "infrastructure": {
    "twentyi_general": "c63ba26830d4bc889",
    "twentyi_oauth": "cb5fbe874ef1d15f0",
    "twentyi_reseller_id": "10455"
  }
}
```

**API calls:**
1. `POST /reseller/{id}/addWeb` — Create hosting package
   - type: 88291 (WordPress) or 80359 (static)
   - domain_name: from user input or auto-generated
2. `POST /package/{id}/web/addDomain` — Attach custom domain
3. `GET /package/{id}/dns` — Get DNS records for user to configure
4. `POST /package/{id}/web/forceSSL` — Enable HTTPS
5. `POST /package/{id}/email/addMailbox` — Create business email

**Input:** `{ domain, project_type, project_name }`
**Output:** `{ hosting_id, domain, dns_records, email, ssl_status }`

**Fallback:** If no custom domain provided, skip this module (Vercel subdomain used).

---

### Module 2: mod_crm.js (SuiteDash)

**Credential keys:**
```json
{
  "suitedash": {
    "api_url": "https://app.suitedash.com/secure-api/v1",
    "api_key": "...",
    "licenses_total": 136,
    "licenses_used": 0
  }
}
```

**API calls:**
1. Create new workspace/company for the project
2. Configure custom fields (project-specific: service type, budget, timeline)
3. Create deal pipeline stages (Lead → Qualified → Proposal → Closed Won → Onboarding → Active)
4. Create 3 onboarding task templates
5. Create invoice template with project branding
6. Configure client portal (logo, colors from DESIGN.md)

**Input:** `{ project_name, accent_color, pipeline_stages, services }`
**Output:** `{ workspace_url, portal_url, api_key, pipeline_id }`

**License tracking:** Increment `licenses_used` counter in DYNASTY_TOOL_CONFIG. Reject if at capacity.

---

### Module 3: mod_email.js (Acumbamail)

**Credential keys:**
```json
{
  "comms": {
    "acumbamail": "0cdbad074aa140a5bf7274027a53f780"
  }
}
```

**API calls:**
1. `POST /createList/` — Create email list named "{project_name} Subscribers"
2. `POST /addMergeField/` — Add custom fields (first_name, source, plan)
3. `POST /createCampaign/` × 5 — Create the 5-email welcome sequence
4. `POST /createAutomation/` — Set up automation: new subscriber → welcome sequence

**Input:** `{ project_name, email_sequences (from phase 2 generation) }`
**Output:** `{ list_id, campaign_ids[], automation_id, signup_form_html }`

**Integration point:** The signup form HTML gets embedded in the generated landing page.

---

### Module 4: mod_phone.js (CallScaler + Insighto)

**Credential keys:**
```json
{
  "comms": {
    "callscaler": "120|ZPLZosyaRbCmkwTs01wRtYxtfJt1m9SUUTcBzz7K",
    "insighto": "in-8sy7gCOBIkfcftX7SJ-0tNSeVHI1GKoR3u9LwGDvyLA",
    "thoughtly": "0dy3971e2bgvrk3y6j1cs9l"
  }
}
```

**CallScaler API calls:**
1. `POST /numbers/purchase` — Get a local phone number (area code from user's location)
2. `POST /numbers/{id}/greeting` — Upload AI-generated greeting

**Insighto API calls:**
1. `POST /agents` — Create voice agent
2. `POST /agents/{id}/knowledge` — Upload business FAQ, services, pricing as knowledge base
3. `POST /agents/{id}/actions` — Configure: book appointment (→Trafft), take message (→email), transfer to owner

**Input:** `{ project_name, location, services, pricing, faq, owner_phone }`
**Output:** `{ phone_number, agent_id, greeting_url }`

---

### Module 5: mod_sms.js (SMS-iT)

**Credential keys:**
```json
{
  "comms": {
    "smsit": "SMSIT_a1a5c935d1626fb1ad8d95de9455857d3225730e1b992f62c355c83158a4a7dc"
  }
}
```

**API calls:**
1. `POST /contacts/groups` — Create contact group "{project_name} Customers"
2. `POST /campaigns` — Create 3 SMS templates:
   - Welcome: "Thanks for signing up for {project_name}! Here's how to get started: {url}"
   - Appointment reminder: "Reminder: Your {service} appointment is tomorrow at {time}. Reply C to confirm."
   - Follow-up: "How was your experience with {project_name}? Reply with feedback or call us: {phone}"

**Input:** `{ project_name, url, phone_number, services }`
**Output:** `{ group_id, template_ids[], sender_id }`

---

### Module 6: mod_seo.js (WriterZen + NeuronWriter)

**Credential keys:**
```json
{
  "content": {
    "writerzen": "...",
    "neuronwriter": "..."
  }
}
```

**WriterZen API calls:**
1. `POST /keyword-explorer` — Research top 20 keywords for the niche
2. `POST /topic-cluster` — Generate topic cluster map
3. `POST /content-brief` × 5 — Generate 5 content briefs from top keywords

**NeuronWriter API calls:**
1. `POST /projects` — Create project
2. `POST /content-editor` × 5 — Generate 5 SEO-optimized articles from the briefs
3. Articles are pushed to the site as blog pages (or WordPress posts via 20i)

**Input:** `{ project_name, niche, location, target_audience }`
**Output:** `{ keywords[], topic_clusters[], articles[{title, content, target_keyword, seo_score}] }`

**Note:** This is the longest phase (~20s) because it involves real SERP analysis.

---

### Module 7: mod_video.js (Vadoo AI + Fliki)

**Credential keys:**
```json
{
  "content": {
    "vadoo_ai": "...",
    "fliki": "..."
  }
}
```

**Vadoo AI API call:**
1. `POST /videos/create` — Generate explainer video from:
   - Script: VIDEO-SCRIPT.md (already generated in phase 4a)
   - Style: professional/corporate/friendly based on project type
   - Duration: 60-90 seconds

**Fliki API calls:**
1. `POST /videos/create` × 3 — Generate 3 short social clips (15s each) from key selling points

**Output:** `{ explainer_video_url, social_clips_urls[], thumbnail_url }`

**Integration:** Video URL embedded in hero section. Social clips added to social media calendar.

---

### Module 8: mod_design.js (SUPERMACHINE + Pixelied + RelayThat)

**Credential keys:**
```json
{
  "content": {
    "supermachine": "...",
    "pixelied": "...",
    "relaythat": "..."
  }
}
```

**SUPERMACHINE:**
1. Generate hero image matching business description and brand colors
2. Generate 3 feature illustration images
3. Generate team/office photo (AI)

**Pixelied:**
1. Create OG image (1200×630) with project name + tagline
2. Create favicon from first letter or icon

**RelayThat:**
1. Upload brand asset → auto-generate 40+ platform-sized variants
   - Facebook cover, LinkedIn banner, Twitter header, YouTube thumbnail
   - Instagram post, story, Pinterest pin
   - Email header, favicon

**Output:** `{ hero_image_url, og_image_url, favicon_url, social_kit_urls{} }`

---

### Module 9: mod_billing.js (Stripe)

**Credential keys:**
```json
{
  "payments": {
    "stripe_live": "sk_live_51RZLN8Le...",
    "stripe_publishable": "pk_live_..."
  }
}
```

**API calls:**
1. `POST /products` — Create product for the business
2. `POST /prices` × 3 — Create Free, Pro, Enterprise price tiers
3. `POST /webhook_endpoints` — Create webhook endpoint pointing to the deployed app's `/api/webhooks/stripe`
4. Set price IDs in the app's AppConfig.ts and Vercel env vars

**Input:** `{ project_name, tiers[{name, price, interval, features}] }`
**Output:** `{ product_id, price_ids[], webhook_id, webhook_secret }`

**Important:** This creates REAL Stripe products. The deployed app can accept payments immediately.

---

### Module 10: mod_analytics.js (Plerdy + PostHog)

**Credential keys:**
```json
{
  "data_research": {
    "plerdy": "..."
  }
}
```

**Plerdy API calls:**
1. `POST /sites` — Register the deployed domain
2. Returns tracking script to inject into the site

**PostHog (already integrated):**
1. Create custom events: `signup`, `checkout_started`, `checkout_completed`, `feature_used`
2. Create funnel: Landing → Signup → Dashboard → Upgrade

**Output:** `{ plerdy_tracking_script, posthog_api_key, funnel_id }`

---

### Module 11: mod_leads.js (Happierleads + Salespanel)

**Credential keys:**
```json
{
  "data_research": {
    "happierleads": "...",
    "salespanel": "..."
  }
}
```

**Happierleads:**
1. `POST /websites` — Register domain for visitor tracking
2. Returns tracking pixel to inject into the site

**Salespanel:**
1. `POST /segments` — Create lead scoring rules:
   - Visited pricing page: +20 points
   - Visited 3+ pages: +10 points
   - Returned within 7 days: +15 points
   - Score > 50: tag as "hot lead"
2. `POST /notifications` — Alert owner when hot lead detected

**Output:** `{ happierleads_pixel, salespanel_segment_id, hot_lead_threshold }`

---

### Module 12: mod_docs.js (Documentero)

**Credential keys:**
```json
{
  "content": {
    "documentero": "R6OL3LQ-HSKETSA-RSNQ3TA-77PJH3A"
  }
}
```

**API calls:**
1. `POST /documents/generate` × 3:
   - Terms of Service (from LEGAL-TEMPLATES.md, formatted as PDF)
   - Privacy Policy (GDPR-compliant template)
   - Client Service Agreement (from project type and pricing)

**Output:** `{ tos_pdf_url, privacy_pdf_url, agreement_pdf_url }`

**Integration:** PDF URLs linked from the site footer.

---

### Module 13: mod_automation.js (n8n)

**Credential keys:**
```json
{
  "automation": {
    "n8n_api": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**n8n instance:** Running on Flint VM (pinohu@172.20.192.46)

**Creates 5 core workflows via n8n API:**

1. **New Signup Flow**
   Trigger: webhook (from app's signup endpoint)
   → Create SuiteDash contact
   → Add to Acumbamail list
   → Send welcome SMS
   → Slack notification to owner

2. **New Booking Flow**
   Trigger: Trafft webhook
   → Create SuiteDash task
   → Send confirmation email
   → Send reminder SMS (24hr before)
   → Post-service follow-up email

3. **New Payment Flow**
   Trigger: Stripe webhook
   → Create SuiteDash invoice
   → Send receipt email
   → Send thank-you SMS
   → Update analytics

4. **Hot Lead Alert**
   Trigger: Salespanel webhook (score > 50)
   → Create SuiteDash deal
   → Send personalized email (via Acumbamail)
   → SMS alert to owner
   → Create follow-up task

5. **Missed Call Recovery**
   Trigger: CallScaler missed-call webhook
   → Send SMS: "Sorry we missed your call. Book online: {url}"
   → Create SuiteDash lead
   → Email notification to owner

**Input:** `{ all webhook URLs, all API keys from other modules }`
**Output:** `{ workflow_ids[], webhook_urls[] }`

---

### Module 14: mod_directory.js (Brilliant Directories)

**Only triggered for directory-type projects.**

**Credential keys:**
```json
{
  "directories": {
    "brilliant_api": "...",
    "brilliant_licenses": 100
  }
}
```

**API calls:**
1. Provision new directory instance
2. Configure membership tiers (Free, Basic $99/mo, Premium $299/mo)
3. Create category taxonomy (from niche analysis)
4. Set up claim listing workflow
5. Configure review system
6. Generate 50 programmatic SEO pages (city × category combinations)
7. Connect Stripe for directory payments

**Input:** `{ niche, geography, categories[], pricing_tiers[] }`
**Output:** `{ directory_url, admin_url, membership_tier_ids[], listing_count }`

---

### Module 15: mod_community.js (Heartbeat + FuseBase)

**Only triggered when project type benefits from community.**

**Heartbeat:**
1. Create community space
2. Set up channels: General, Announcements, Help, Feature Requests
3. Configure welcome message

**FuseBase:**
1. Create knowledge base
2. Populate with FAQ content (from generation phase)
3. Create "Getting Started" guide from README.md

**Output:** `{ community_url, knowledge_base_url }`

---

## 5. CREDENTIAL REQUIREMENTS

### Already Available (in memory/DYNASTY_TOOL_CONFIG)
| Tool | Key | Status |
|------|-----|--------|
| 20i | c63ba26830d4bc889 | ✅ Have |
| CallScaler | 120\|ZPLZo... | ✅ Have |
| Insighto | in-8sy7g... | ✅ Have |
| Thoughtly | 0dy3971e... | ✅ Have |
| SMS-iT | SMSIT_a1a5c9... | ✅ Have |
| Acumbamail | 0cdbad07... | ✅ Have |
| Documentero | R6OL3LQ-... | ✅ Have |
| Stripe (live) | sk_live_51... | ✅ Have (in DYNASTY_TOOL_CONFIG) |
| n8n | JWT token | ✅ Have |
| Trafft | Client ID 380067... | ✅ Have |
| GitHub | ghp_eLrBYAch... | ✅ Have |
| Vercel | sVUgRDQu... | ✅ Have |

### Need to Add to DYNASTY_TOOL_CONFIG
| Tool | What's Needed | How to Get |
|------|--------------|------------|
| WriterZen | API key | WriterZen dashboard → Settings → API |
| NeuronWriter | API key | NeuronWriter → Account → API Access |
| SUPERMACHINE | API key | SUPERMACHINE dashboard → API |
| Pixelied | API key | Pixelied → Account → Developer |
| RelayThat | API key | RelayThat → Integrations |
| Vadoo AI | API key | Vadoo dashboard → API |
| Fliki | API key | Fliki → Account → API |
| Plerdy | API key | Plerdy → Settings → API |
| Happierleads | API key | Happierleads → Settings → Integrations |
| Salespanel | API key | Salespanel → Settings → API |
| SuiteDash | API key per instance | SuiteDash → Settings → API |
| Brilliant Directories | API key per directory | BD Admin → API Settings |
| Heartbeat | API key | Heartbeat → Settings → API |
| FuseBase | API key | FuseBase → Workspace → API |

---

## 6. IMPLEMENTATION ORDER

### Sprint 1: Foundation (Week 1)
**Goal:** Core infrastructure modules that every business needs.

1. **mod_hosting.js** — 20i domain + email provisioning
   - Highest impact: custom domain transforms perceived legitimacy
   - API already tested in PA CROP Services stack
   
2. **mod_billing.js** — Real Stripe products + webhooks
   - Second highest: turns placeholder into revenue-ready
   - Stripe API is well-documented, fast to implement

3. **mod_email.js** — Acumbamail list + welcome sequence
   - Third: email sequences already generated, just need to import them
   - API key already available

### Sprint 2: Communications (Week 2)
**Goal:** Every channel a customer might use to reach the business.

4. **mod_phone.js** — CallScaler + Insighto voice agent
5. **mod_sms.js** — SMS-iT campaigns
6. **Trafft booking** — (fold into mod_phone.js)

### Sprint 3: Content & SEO (Week 3)
**Goal:** Organic acquisition engine.

7. **mod_seo.js** — WriterZen + NeuronWriter
8. **mod_video.js** — Vadoo AI + Fliki
9. **mod_design.js** — SUPERMACHINE + Pixelied + RelayThat

### Sprint 4: Intelligence & Automation (Week 4)
**Goal:** Connect everything, add intelligence.

10. **mod_analytics.js** — Plerdy + PostHog
11. **mod_leads.js** — Happierleads + Salespanel
12. **mod_automation.js** — n8n workflow creation
13. **mod_docs.js** — Documentero PDFs

### Sprint 5: Specialized (Week 5)
**Goal:** Directory and community modules for specific project types.

14. **mod_directory.js** — Brilliant Directories
15. **mod_community.js** — Heartbeat + FuseBase
16. **mod_crm.js** — SuiteDash (most complex, saved for last)

---

## 7. PROVISION.JS ARCHITECTURE

### Current Structure
```
provision.js (1105 lines, monolithic)
  ├── action: inventory
  ├── action: authority_deploy
  ├── action: fullstack_deploy
  └── action: retry_deploy
```

### Target Structure
```
api/
  provision.js (orchestrator — routes to modules)
  modules/
    mod_hosting.js
    mod_crm.js
    mod_email.js
    mod_phone.js
    mod_sms.js
    mod_seo.js
    mod_video.js
    mod_design.js
    mod_billing.js
    mod_analytics.js
    mod_leads.js
    mod_docs.js
    mod_automation.js
    mod_directory.js
    mod_community.js
```

**Note:** Vercel serverless functions require all code in a single file OR using dynamic imports. Each module will be a self-contained function exported from provision.js, not a separate file. This avoids Vercel bundling issues.

### Module Interface
Every module follows the same interface:
```javascript
async function mod_hosting(config, project) {
  // config = DYNASTY_TOOL_CONFIG parsed
  // project = { name, slug, description, type, domain, accent, ... }
  
  const results = { ok: false, service: 'hosting', details: {} };
  try {
    // ... API calls ...
    results.ok = true;
    results.details = { domain, email, dns_records };
  } catch (e) {
    results.error = e.message;
    results.fallback = 'Manual setup instructions in OPERATIONS.md';
  }
  return results;
}
```

---

## 8. ERROR HANDLING & FALLBACKS

**Principle:** No module failure should block the build. Every module has a fallback.

| Module | If it fails... | Fallback |
|--------|---------------|----------|
| mod_hosting | 20i API error | Keep Vercel subdomain, document manual domain setup |
| mod_crm | SuiteDash API error | Generate SuiteDash setup guide in OPERATIONS.md |
| mod_email | Acumbamail error | Email sequences stay as markdown, document manual import |
| mod_phone | CallScaler error | Document manual phone setup, skip voice agent |
| mod_sms | SMS-iT error | Skip SMS, document manual setup |
| mod_seo | WriterZen/NeuronWriter error | Generate blog posts via Claude instead (lower quality) |
| mod_video | Vadoo error | Skip video, keep VIDEO-SCRIPT.md as manual reference |
| mod_design | SUPERMACHINE error | Use CSS gradients and Tailwind illustrations |
| mod_billing | Stripe error | Keep placeholder config, document manual Stripe setup |
| mod_analytics | Plerdy error | Keep PostHog only |
| mod_leads | Happierleads error | Skip lead intelligence |
| mod_docs | Documentero error | Keep legal templates as markdown |
| mod_automation | n8n error | Document workflows as AUTOMATIONS.md for manual creation |
| mod_directory | BD error | Generate directory setup guide |
| mod_community | Heartbeat error | Skip community |

---

## 9. BUILD REPORT & OPERATIONS MANUAL

Every build generates two deliverables alongside the code:

### BUILD-REPORT.html (already exists, enhanced)
- Add status of every integration module (✅/⚠️/❌)
- Add direct links to every provisioned service (CRM, phone, email dashboard)
- Add credentials summary (what was configured, what needs manual setup)

### OPERATIONS.md (new)
A step-by-step guide for the business owner:

```markdown
# {Business Name} — Operations Manual

## What's Already Set Up
- ✅ Website: {url}
- ✅ Business email: {email}
- ✅ Phone: {phone} (AI receptionist active)
- ✅ CRM: {suitedash_url}
- ✅ Email marketing: 5-email welcome sequence active
- ...

## What You Need to Do (in order)
1. Point your domain DNS (instructions: ...)
2. Update your Google Business Profile with new phone number
3. Create your Clerk account for dedicated auth (instructions: ...)
4. Review and customize email sequences in Acumbamail
5. Record a personal welcome video using BIGVU
6. ...

## Ongoing Operations
- Weekly: Review hot leads in CRM
- Monthly: Check email campaign stats
- Quarterly: Run SEO audit with Labrika
```

---

## 10. REVENUE MODEL

### Pricing Tiers for Dynasty Launcher

| Tier | Price | What's Included |
|------|-------|----------------|
| **Starter** | $297 | Code + docs + Vercel deploy (current output) |
| **Professional** | $997 | + Custom domain + email + Stripe + CRM + email marketing |
| **Enterprise** | $2,497 | + Phone/voice + SEO content + video + automations + analytics |
| **Portfolio** (monthly) | $197/mo | Ongoing monitoring + content + campaign management |

### License Economics
| Resource | Total | Cost per Use | Revenue per Use | Margin |
|----------|-------|-------------|----------------|--------|
| SuiteDash | 136 | $0 (owned) | $200 (in $997 package) | 100% |
| Brilliant Directories | 100 | $0 (owned) | $500 (in $2,497 package) | 100% |
| CallScaler | 9 | ~$5/mo recurring | $50/mo (in $197/mo package) | 90% |
| API costs (AI + tools) | per-build | ~$2-5 per build | $297-2,497 per build | 99% |

---

## 11. TESTING STRATEGY

### Per-Module Testing
Before integrating any module into the build pipeline:
1. Test with a throwaway project name
2. Verify API call succeeds
3. Verify provisioned resource is accessible
4. Verify cleanup/rollback works
5. Test error handling and fallback

### End-to-End Testing
1. Run a full build with all modules enabled
2. Verify every provisioned service is accessible
3. Verify automations fire correctly (n8n workflows)
4. Verify billing works (Stripe test mode)
5. Verify cross-tool data flow (signup → CRM → email → SMS)

### Canary Builds
Before deploying module changes to production:
1. Run 3 builds with the new module
2. Check build success rate
3. Check build time (must stay under 5 minutes)
4. Check error rate per module

---

## 12. MIGRATION PATH

### Phase 1: Feature Flags
Each module is gated by a feature flag in DYNASTY_TOOL_CONFIG:
```json
{
  "modules_enabled": {
    "hosting": true,
    "crm": false,
    "email": true,
    "phone": false,
    ...
  }
}
```
Modules can be enabled one at a time as they're tested and ready.

### Phase 2: User-Facing Controls
Add a "Services" section to the builder UI where users can toggle which integrations to include:
- [ ] Custom domain + email (requires domain name input)
- [ ] CRM + client portal
- [ ] Phone + AI receptionist
- [ ] Email marketing automation
- [ ] SEO content (5 blog posts)
- [ ] Explainer video
- [ ] Analytics + lead tracking

### Phase 3: Tier Gating
Lock advanced modules behind pricing tiers (Starter/Professional/Enterprise).

---

## 13. OPEN QUESTIONS

1. **SuiteDash multi-instance:** Can one API key manage multiple workspaces, or does each workspace need its own key? Need to test.

2. **Brilliant Directories provisioning:** Can BD be provisioned via API, or does it require manual setup per directory? Need to verify API capabilities.

3. **WriterZen/NeuronWriter rate limits:** How many API calls per minute? Can 5 articles be generated in parallel?

4. **Vadoo AI turnaround:** Is video generation synchronous or async (webhook callback)? If async, need polling mechanism.

5. **n8n workflow creation via API:** The n8n API can create workflows, but can it also create credentials? If not, credentials for each tool must be pre-configured in n8n.

6. **Custom domain DNS:** 20i can set DNS records, but the user still needs to update their domain registrar's nameservers. This is always a manual step — document clearly in OPERATIONS.md.

---

## 14. SUCCESS CRITERIA

Dynasty Launcher V3 is complete when:

1. A user can describe a business idea in one text prompt
2. Within 5 minutes, they receive:
   - A live website on a custom domain (or Vercel subdomain)
   - Working authentication and billing
   - A CRM with client portal
   - A business phone number with AI receptionist
   - Active email marketing sequences
   - 5 published blog posts with SEO optimization
   - Analytics and lead tracking active
   - Automated workflows connecting all services
   - Legal documents as PDFs
   - A complete Operations Manual
3. Every integration that fails gracefully falls back to documented manual instructions
4. The build report shows the status of every provisioned service
5. The total build cost is under $5 in API usage
6. The system can handle 10+ builds per day without hitting rate limits

---

## APPROVAL

This specification covers the complete transformation of Dynasty Launcher from a code generator to a full business provisioning engine. Implementation follows the 5-sprint plan over ~5 weeks, starting with the highest-impact modules (hosting, billing, email) and progressing to specialized modules (directories, community).

**Estimated engineering effort:** 80-120 hours across 5 sprints
**Estimated API testing/debugging:** 20-30 hours
**Total:** ~100-150 hours

Ready to begin Sprint 1 on your approval.
