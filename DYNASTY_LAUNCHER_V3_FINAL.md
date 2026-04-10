# Your Deputy V3 — FINAL Build Specification
## Consolidated: Original Spec + Addendum (17 gaps) + Final Review (15 gaps)
## Total: 32 identified gaps, all resolved

**Date:** April 7, 2026 | **Version:** 3.0 FINAL | **Status:** PLAN — Awaiting approval

---

## 1. VISION

User describes a business idea in one prompt → Your Deputy provisions a **complete operating business** within 5 minutes: live website on custom domain, business email with SPF/DKIM/DMARC, phone number with AI receptionist, CRM with client portal, email marketing sequences active and deliverable, SMS campaigns, 5 SEO blog posts published, explainer video, brand asset library, booking system, real Stripe billing accepting payments, legal PDFs, analytics with heatmaps, lead intelligence, chatbot, review collection, automated workflows connecting everything, database with tables and seed data, post-deploy smoke test passing, and a complete Operations Manual + Credentials Document.

---

## 2. ARCHITECTURE

```
┌──────────────────────────────────────────────────────────────┐
│                         YOUR DEPUTY V3                         │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  app.html (Frontend)                                          │
│    ├→ Build Config UI (domain, toggles, pricing, location)    │
│    └→ Build Pipeline: 20 phases with deployment checkpoint    │
│                                                               │
│  api/provision.js (Backend Orchestrator)                       │
│    ├→ 17 Integration Modules                                  │
│    ├→ License Allocation Tracker (Neon DB)                    │
│    ├→ Cost Tracker (per-build + cumulative)                   │
│    └→ Rollback Registry (cleanup on failure)                  │
│                                                               │
│  DYNASTY_TOOL_CONFIG (encrypted env var — 50+ keys)           │
│    └→ modules_enabled flags gate each integration             │
│                                                               │
│  Neon DB: dynasty_ops                                         │
│    ├→ license_allocations (tool, project, resource_id)        │
│    ├→ build_history (project, cost, status, services)         │
│    └→ deferred_checks (domain DNS, pending verifications)     │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. BUILD PIPELINE — 20 Phases

The pipeline has a **deployment checkpoint** at Phase 8. Phases 1-7c generate files. Phase 8 deploys. Phases 9-17 provision external services using the live URL. Phases 18-20 finalize.

### Generation Phases (offline — no live URL needed)
| # | Phase | What | Time |
|---|-------|------|------|
| 1 | Design System | DESIGN.md, CLAUDE.md, brand colors/fonts | 8s |
| 2 | Product Docs | SPEC, ROADMAP, README, MANUAL-ACTIONS, .env | 15s |
| 3 | Supporting Docs | DATA-MODEL, API-CONTRACTS, KB-OUTLINES | 12s |
| 4a | Business System | BUSINESS-SYSTEM, REVENUE-MODEL, GTM-PLAYBOOK | 15s |
| 4b | Agent System | AGENT-SYSTEM, FAILURE-MODES | 10s |
| 5 | Backend Code | FastAPI + Docker (when applicable) | 12s |
| 7 | Frontend | Next.js scaffold OR WordPress content | 15s |
| 7b | Template Override | All 10 components + 27×2 translations | 12s |
| 7c | Backend Integration | DB schema, API routes, dashboard, billing, Env.ts | 12s |

### Deployment Checkpoint
| # | Phase | What | Time |
|---|-------|------|------|
| 8 | **Deploy** | Push to GitHub → Deploy to Vercel/20i → **GET LIVE URL** | 30s |

### Provisioning Phases (require live URL)
| # | Phase | What | Tool(s) | Time |
|---|-------|------|---------|------|
| 9 | Domain + Email + DNS Auth | Custom domain, SSL, email, SPF/DKIM/DMARC | **20i** | 5s |
| 10 | CRM + Client Portal | Workspace, pipeline, onboarding, invoicing, portal | **SuiteDash** | 8s |
| 11 | Phone + Voice + Booking | Local number, AI agent, greeting, booking page | **CallScaler + Insighto + Trafft** | 6s |
| 12 | Email + SMS Marketing | List, 5-email sequence, automations, SMS templates | **Acumbamail + SMS-iT** | 5s |
| 13 | SEO Content | Keyword research, 5 optimized blog posts, publish | **WriterZen + NeuronWriter** | 20s |
| 14 | Video + Design Assets | Explainer video, social clips, hero image, OG, social kit | **Vadoo + SUPERMACHINE + Pixelied + RelayThat** | 15s |
| 15 | Billing | Real Stripe products, 3 price tiers, webhook | **Stripe** | 4s |
| 16 | Analytics + Leads + Chatbot | Heatmaps, visitor ID, lead scoring, website chatbot | **Plerdy + Happierleads + Salespanel + Chatbase** | 5s |
| 17 | Legal PDFs + Accounting | ToS, Privacy Policy, Agreement as PDFs; expense tracking | **Documentero + SparkReceipt** | 5s |

### Finalization Phases
| # | Phase | What | Time |
|---|-------|------|------|
| 18 | Automation Workflows | 7 n8n workflows (happy + unhappy paths) | **n8n** | 10s |
| 19 | Post-Deploy Config | Update Vercel env vars with all service keys → final redeploy | 15s |
| 20 | Verify + Deliver | Smoke test all routes, Lighthouse check, build report, OPERATIONS.md, CREDENTIALS.md | 10s |

**Total: ~4-5 minutes**

---

## 4. INTEGRATION MODULES — 17 Total

### Module 1: mod_hosting.js (20i)
**Creates:** Hosting package, custom domain, DNS, SSL, business email
**Also creates:** SPF, DKIM, DMARC DNS records for email deliverability *(Gap 1 from final review)*
**DNS propagation:** Registers a deferred check in Neon — emails owner when domain is live *(Gap 4)*
**Credentials:** ✅ HAVE (20i general + oauth keys)

### Module 2: mod_crm.js (SuiteDash)
**Creates:** White-labeled workspace, deal pipeline, onboarding tasks, invoice template, client portal
**License tracking:** Checks + increments counter in Neon DB before allocating *(Gap 4 from addendum)*
**Credentials:** Need per-instance API key (one-time setup)

### Module 3: mod_email.js (Acumbamail)
**Creates:** Subscriber list, imports 5-email welcome sequence, activates automation, returns signup form HTML
**Deliverability:** Depends on mod_hosting.js completing SPF/DKIM/DMARC *(Gap 1)*
**Credentials:** ✅ HAVE

### Module 4: mod_phone.js (CallScaler + Insighto + Trafft)
**Creates:** Local phone number, AI voice agent trained on business FAQ/pricing, booking page
**Booking integration:** Embeds Trafft link on website, syncs with Google Calendar *(Gap 9)*
**Credentials:** ✅ HAVE (all three)

### Module 5: mod_sms.js (SMS-iT)
**Creates:** Contact group, 3 SMS templates (welcome, reminder, follow-up)
**Credentials:** ✅ HAVE

### Module 6: mod_seo.js (WriterZen + NeuronWriter)
**Creates:** Top 20 keywords, topic cluster map, 5 SEO-optimized blog posts, published to site
**Rate limit guard:** Falls back to Claude-generated content if daily limits hit *(Gap 13 from addendum)*
**Multi-language:** If bilingual market detected, generates content in both languages *(Gap 8)*
**Credentials:** NEED (WriterZen + NeuronWriter API keys)

### Module 7: mod_video.js (Vadoo AI + Fliki)
**Creates:** 60-90s explainer video, 3×15s social clips
**Image optimization:** All assets compressed to WebP, proper sizing, lazy loading *(Gap 5)*
**Credentials:** NEED (Vadoo + Fliki API keys)

### Module 8: mod_design.js (SUPERMACHINE + Pixelied + RelayThat)
**Creates:** Hero image, feature illustrations, OG image, favicon, 40+ social platform variants
**Image optimization:** Output as WebP, compressed, with explicit width/height attributes *(Gap 5)*
**Credentials:** NEED (all three API keys)

### Module 9: mod_billing.js (Stripe)
**Creates:** Real product, 3 price tiers, webhook endpoint, sets price IDs in app config
**Unhappy path:** Also creates dunning email templates for failed payments *(Gap 7)*
**Credentials:** ✅ HAVE (sk_live in DYNASTY_TOOL_CONFIG)

### Module 10: mod_analytics.js (Plerdy + PostHog)
**Creates:** Heatmap tracking, session recording, conversion funnels, custom events
**Credentials:** NEED (Plerdy API key); PostHog ✅ HAVE

### Module 11: mod_leads.js (Happierleads + Salespanel)
**Creates:** Visitor identification, lead scoring rules, hot lead alerts
**Credentials:** NEED (both API keys)

### Module 12: mod_chatbot.js (Chatbase) *(New — Gap 12)*
**Creates:** Website chatbot trained on business FAQ, pricing, services
**Embeds:** Chat widget script injected into generated site
**Credentials:** NEED (Chatbase API key)

### Module 13: mod_docs.js (Documentero + SparkReceipt)
**Creates:** ToS PDF, Privacy Policy PDF, Service Agreement PDF
**Also creates:** SparkReceipt account for expense tracking from day one *(Gap 6)*
**Credentials:** ✅ HAVE (Documentero); NEED (SparkReceipt API key)

### Module 14: mod_automation.js (n8n)
**Creates 7 workflows (5 happy path + 2 unhappy path):**
1. New Signup → CRM → Email list → Welcome SMS → Slack notification
2. New Booking → SuiteDash task → Confirmation email → 24hr reminder SMS → Follow-up
3. New Payment → Invoice → Receipt email → Thank you SMS → Accounting
4. Hot Lead → CRM deal → Personalized email → SMS alert to owner
5. Missed Call → SMS ("Sorry, book online: {url}") → CRM lead → Email to owner
6. **Failed Payment → Dunning email → SMS reminder → 3-day escalation → Owner alert** *(Gap 7)*
7. **Post-Service → Review request email → Collect testimonial → Update website** *(Gap 13)*
**Credentials:** ✅ HAVE (n8n JWT)

### Module 15: mod_social.js (Vista Social) *(New — Gap 10)*
**Creates:** Imports 260-post social media calendar into scheduling platform
**Credentials:** NEED (Vista Social API key)

### Module 16: mod_directory.js (Brilliant Directories)
**Only for directory-type projects.**
**Creates:** Directory instance, membership tiers, categories, claim listings, 50 SEO pages
**License tracking:** Checks Neon DB before allocating
**Credentials:** NEED (BD API key per directory)

### Module 17: mod_wordpress.js (20i + Dynasty Developer) *(New — Gap 1 from addendum)*
**Only for WordPress deployment targets.**
**Creates:** 20i WordPress package, installs Dynasty Developer theme, activates plugins (WPAutoBlog, Hide My WP Ghost, Stackable, ElementsKit), pushes blog posts via WP REST API, configures theme preset
**Credentials:** ✅ HAVE (20i keys)

---

## 5. DEPLOYMENT TARGET DECISION TREE *(Gap 1 from addendum)*

```
Project Type → Deployment Path:

  SaaS / Dashboard / AI platform     → Next.js on Vercel + Neon DB
  Directory / Membership site        → Brilliant Directories (100 licenses)
  Authority site / Blog / Local biz  → WordPress on 20i (Dynasty Developer theme)
  Landing page / Microsite           → Static HTML on Vercel or Brizy Cloud
  Client portal / Service business   → SuiteDash (136 licenses)
  E-commerce                         → Next.js on Vercel + Stripe
```

---

## 6. DATABASE & MIGRATION *(Gap 2 from addendum)*

Generated apps include `src/app/api/setup/route.ts`:
- Runs Drizzle schema push against DATABASE_URL
- Inserts seed data (demo content so dashboard isn't empty)
- Sets `setup_complete` flag in DB
- Self-disables after first successful run

Your Deputy calls `POST /api/setup` after deployment succeeds (Phase 19).

---

## 7. BUILD CONFIGURATION UI *(Gap 7 from addendum)*

New inputs in the builder before build starts:

```
┌─────────────────────────────────────────────────┐
│ DEPLOYMENT SETTINGS                              │
│                                                  │
│ Custom domain (optional): [____________.com]     │
│ Location (for phone area code): [Erie, PA    ]   │
│                                                  │
│ Deploy as:  ◉ Next.js (Vercel)                   │
│             ○ WordPress (20i)                    │
│             ○ Brilliant Directory                │
│             ○ Static Landing Page                │
│                                                  │
│ Pricing (for Stripe):                            │
│   Free tier:  [$0   /mo]                         │
│   Pro tier:   [$49  /mo]                         │
│   Enterprise: [$199 /mo]                         │
│                                                  │
│ INTEGRATIONS (toggle on/off):                    │
│ ☑ Custom domain + business email                 │
│ ☑ CRM + client portal (SuiteDash)               │
│ ☑ Phone + AI receptionist                        │
│ ☑ Email marketing (5-email sequence)             │
│ ☑ SMS campaigns                                  │
│ ☑ SEO content (5 blog posts)                     │
│ ☑ Explainer video                                │
│ ☑ Design assets (hero, OG, social kit)           │
│ ☑ Analytics + heatmaps                           │
│ ☑ Lead intelligence                              │
│ ☑ Website chatbot                                │
│ ☑ Automation workflows                           │
│ ☐ Community (Heartbeat)                          │
│ ☐ Social media scheduling                        │
└─────────────────────────────────────────────────┘
```

Each toggle maps to a `modules_enabled` flag. Disabled modules are skipped entirely.

---

## 8. POST-DEPLOYMENT VERIFICATION *(Gap 8 from addendum, Gap 3 final review)*

### Phase 20: mod_verify.js

**Route smoke test:**
- `GET /` → 200
- `GET /docs` → 200
- `GET /pricing` → 200
- `GET /api/v1` → 200 (health check)
- `GET /en/sign-in` → 200 or 307
- Verify HTML contains project name (not "SaaS Template")
- Verify zero `[object Object]` in HTML

**End-to-end flow test** *(Gap 3 final review):*
- Render homepage → verify hero text matches project
- Click "Get Started" → verify Clerk redirect fires
- Hit `/api/data` → verify JSON response (not 500)
- Hit `/api/v1` → verify health check returns OK

**Performance check:**
- PageSpeed Insights API: target Performance > 70, SEO > 80, Accessibility > 80 *(Gap 15 addendum)*

**Results:** All check results included in BUILD-REPORT.html with pass/fail/remediation.

---

## 9. DELIVERABLES PER BUILD

### Code & Content
| File | What |
|------|------|
| Next.js app OR WordPress site | Complete frontend + backend + API routes |
| 5 SEO blog posts | Published on site, keyword-optimized |
| Explainer video (60-90s) | Embedded on homepage |
| 3 social video clips (15s each) | For social media |
| Hero image, OG image, favicon | All WebP-optimized |
| 40+ social media graphics | Every platform size |
| 13+ strategy/business documents | SPEC, GTM, competitive analysis, etc. |

### Infrastructure
| Service | What's provisioned |
|---------|-------------------|
| Hosting | Custom domain, SSL, DNS (with SPF/DKIM/DMARC) |
| Email | business@domain.com (deliverable, not spam-filtered) |
| Database | Neon Postgres with tables created + seed data |
| Auth | Clerk integration (shared or per-project) |
| Billing | Real Stripe products, 3 price tiers, webhook active |

### Business Tools
| Service | What's provisioned |
|---------|-------------------|
| CRM | SuiteDash workspace with pipeline, portal, invoicing |
| Phone | Local number with AI voice agent |
| Booking | Trafft page linked from website |
| Email marketing | Acumbamail list + 5-email sequence active |
| SMS | SMS-iT templates (welcome, reminder, follow-up) |
| Chatbot | Chatbase widget on website |
| Analytics | Plerdy heatmaps + PostHog funnels |
| Lead tracking | Happierleads + Salespanel with scoring |
| Expense tracking | SparkReceipt configured |

### Automation
| Workflow | Trigger → Action |
|----------|-----------------|
| New Signup | → CRM → Email → SMS → Slack |
| New Booking | → Task → Confirmation → Reminder |
| New Payment | → Invoice → Receipt → Accounting |
| Hot Lead | → Deal → Email → Alert |
| Missed Call | → SMS → CRM → Email |
| Failed Payment | → Dunning → SMS → Escalation |
| Post-Service | → Review Request → Collect → Update Site |

### Documents
| Document | Format |
|----------|--------|
| Terms of Service | PDF (Documentero) |
| Privacy Policy | PDF (Documentero) |
| Service Agreement | PDF (Documentero) |
| BUILD-REPORT.html | Status of every service |
| OPERATIONS.md | Step-by-step owner's manual |
| CREDENTIALS.md | Every login URL + access key (masked in report) |

---

## 10. ERROR HANDLING

**Principle:** No module failure blocks the build. Every module has a fallback.

Every module returns:
```javascript
{
  ok: boolean,
  service: string,
  details: {},           // provisioned resources
  error?: string,        // if failed
  fallback?: string,     // manual instructions
  cleanup?: () => void   // rollback function
}
```

**Rollback registry** *(Gap 5 addendum):* All provisioned resources are logged. On catastrophic failure, admin can trigger cleanup. Resources are NOT auto-deleted (they have value).

**Rate limiting** *(Gap 13 addendum):* Daily build counter per tool. If NeuronWriter/WriterZen would exceed limits, fall back to Claude-generated content.

**Cost tracking** *(Gap 12 addendum):* Real-time `V2_BUILD_COST` tracker. Warn if projected cost exceeds $10. Store cumulative spend in Neon.

---

## 11. SECURITY *(Gap 14 addendum)*

- DYNASTY_TOOL_CONFIG encrypted on Vercel
- All API calls server-side only (never exposed to browser)
- Build report masks all keys: `sk_live_51RZ...****`
- CREDENTIALS.md delivered separately from public build report
- Stripe restricted keys (minimal permissions)
- Key rotation schedule in OPERATIONS.md

---

## 12. OPERATIONS.md STRUCTURE *(Gap 9 addendum)*

```markdown
# {Business Name} — Operations Manual

## ✅ What's Already Set Up
(list of every provisioned service with direct links)

## 🔧 What You Need to Do (in order)
1. Verify custom domain DNS (instructions + expected timeline)
2. Create Google Business Profile (description, photos, hours pre-generated)
3. Set up dedicated Clerk app (step-by-step with screenshots)
4. Record personal welcome video using BIGVU
5. Review email sequences in Acumbamail dashboard
6. Connect Google Calendar to Trafft booking
7. Set up social media accounts (content calendar ready to import)

## 📊 Ongoing Operations
- Daily: Check CRM for new leads
- Weekly: Review email campaign stats, hot lead alerts
- Monthly: SEO audit, content calendar review, expense reconciliation
- Quarterly: Review pricing, competitor analysis, renewal campaigns

## 🔑 Credentials Reference
→ See CREDENTIALS.md (separate document)

## 🆘 If Something Breaks
(troubleshooting guide per service)
```

---

## 13. CREDENTIALS.md *(Gap 2 final review)*

```markdown
# {Business Name} — Service Credentials

## Website
- URL: https://yourdomain.com
- GitHub: https://github.com/pinohu/{repo}
- Vercel Dashboard: https://vercel.com/...

## Email
- Business email: hello@yourdomain.com
- Acumbamail dashboard: https://acumbamail.com/...
- List ID: {id}

## Phone
- Number: (814) XXX-XXXX
- CallScaler dashboard: https://callscaler.com/...
- Insighto agent: https://insighto.ai/agents/{id}

## CRM
- SuiteDash: https://{workspace}.suitedash.com
- Client portal: https://{workspace}.suitedash.com/portal

## Billing
- Stripe Dashboard: https://dashboard.stripe.com
- Product ID: prod_XXX
- Webhook secret: whsec_XXX

(etc. for every provisioned service)
```

---

## 14. DYNASTY_TOOL_CONFIG COMPLETE SCHEMA *(Gap 10 addendum)*

```json
{
  "ai": {
    "anthropic": "sk-ant-...",
    "groq": "gsk_...",
    "openrouter": "sk-or-..."
  },
  "payments": {
    "stripe_live": "sk_live_...",
    "stripe_publishable": "pk_live_...",
    "stripe_webhook_secret": "whsec_..."
  },
  "infrastructure": {
    "vercel": "sVUgRDQu...",
    "twentyi_general": "c63ba268...",
    "twentyi_oauth": "cb5fbe87...",
    "twentyi_reseller_id": "10455",
    "neon_api": "napi_kaqggq22...",
    "neon_org": "org-small-credit-59990711",
    "neon_store": "store_dlRpluZOBH0L34D3",
    "github_token": "ghp_eLrBY..."
  },
  "comms": {
    "acumbamail": "0cdbad07...",
    "callscaler": "120|ZPLZo...",
    "insighto": "in-8sy7g...",
    "thoughtly": "0dy3971e...",
    "smsit": "SMSIT_a1a5c9...",
    "trafft_client_id": "380067799...",
    "novocall": "...",
    "emaildelivery": "..."
  },
  "content": {
    "writerzen": "",
    "neuronwriter": "",
    "supermachine": "",
    "pixelied": "",
    "relaythat": "",
    "vadoo_ai": "",
    "fliki": "",
    "documentero": "R6OL3LQ-...",
    "castmagic": "",
    "chatbase": "",
    "vista_social": ""
  },
  "crm_pm": {
    "suitedash_api": "...",
    "suitedash_url": "https://app.suitedash.com"
  },
  "automation": {
    "n8n_api": "eyJhbGci...",
    "n8n_url": "https://n8n.audreysplace.place",
    "konnectzit": "..."
  },
  "data_research": {
    "plerdy": "",
    "happierleads": "",
    "salespanel": "",
    "posthog": "phc_por7UB...",
    "sparkreceipt": ""
  },
  "directories": {
    "brilliant_api": "",
    "brilliant_licenses": 100,
    "brilliant_licenses_used": 0
  },
  "suitedash": {
    "licenses_total": 136,
    "licenses_used": 0
  },
  "community": {
    "heartbeat": "",
    "fusebase": ""
  },
  "modules_enabled": {
    "hosting": true,
    "wordpress": false,
    "crm": false,
    "email": true,
    "phone": false,
    "sms": false,
    "seo": false,
    "video": false,
    "design": false,
    "billing": true,
    "analytics": false,
    "leads": false,
    "chatbot": false,
    "docs": false,
    "automation": false,
    "social": false,
    "directory": false,
    "community": false
  }
}
```

Keys with `""` = need to collect from tool dashboards.

---

## 15. IMPLEMENTATION PLAN — 7 Sprints

### Sprint 0: Prep — Fork Repos + Build Workflow Library (Week 0, 12 hours)

**Goal:** Acquire open-source assets that accelerate Sprints 1-6. No code writing — just forking, organizing, and extracting reusable patterns.

| Task | Repo | What Your Deputy Gets | Hours |
|------|------|-------------------|-------|
| Fork n8n workflow library | `ritik-prog/n8n-automation-templates-5000` | 5,000+ workflow JSONs. mod_automation.js selects + customizes proven templates instead of generating from scratch | 2 |
| Fork curated n8n templates | `enescingoz/awesome-n8n-templates` | 280+ curated workflows for email, WhatsApp, Telegram, RAG chatbots, social media | 1 |
| Fork n8n searchable library | `Zie619/n8n-workflows` | 4,343 workflows with FastAPI search server. Deploy on Flint VM for instant lookup | 2 |
| Study Stripe subscription starter | `vercel/nextjs-subscription-payments` | Battle-tested webhook handlers, customer portal, dunning, subscription lifecycle. Extract patterns for mod_billing.js | 1 |
| Study enterprise SaaS kit | `boxyhq/saas-starter-kit` | SSO, SAML, directory sync, audit logs, team management. Add as template option for B2B projects | 1 |
| Study AI website builder | `Ratna-Babu/Ai-Website-Builder` | Convex backend + Gemini AI + theme customization + export-ready code. Architecture reference for Your Deputy's code generation | 1 |
| Study AI landing page generator | `zinedkaloc/aipage.dev` | Prompt → HTML/Tailwind generation patterns. Improve Your Deputy's page generation quality | 1 |
| Create dynasty-n8n-library | New repo: `pinohu/dynasty-n8n-library` | Curated subset of workflows tagged by Your Deputy project type (saas, directory, service, ecom). Each workflow has placeholder variables for project-specific webhook URLs and API keys | 2 |
| Extract Stripe patterns | From `vercel/nextjs-subscription-payments` | Create `templates/stripe-billing/` in dynasty-launcher with webhook handler, customer portal route, subscription status component, dunning email templates | 1 |

**Sprint 0 Deliverables:**
- `pinohu/dynasty-n8n-library` repo with 50+ curated, tagged workflow templates
- `templates/stripe-billing/` directory with production-grade Stripe patterns
- `templates/enterprise/` directory with B2B SaaS patterns from boxyhq
- Architecture notes document for code generation improvements
- All repos forked under `pinohu` org for modification

**Why this matters:** Sprint 4 (mod_automation.js) drops from 10 hours to 4 hours because workflows are pre-built. Sprint 1 (mod_billing.js) drops from 6 hours to 3 hours because Stripe patterns are extracted. Total savings: ~15 hours across later sprints.

---

### Repo Reference — Complete List

**AUTOMATION & WORKFLOWS**
| Repo | Stars | Use |
|------|-------|-----|
| `ritik-prog/n8n-automation-templates-5000` | 500+ | 5,000 workflow JSONs — Stripe, CRM, email, AI agents |
| `enescingoz/awesome-n8n-templates` | 300+ | 280 curated: Gmail, Telegram, WhatsApp, RAG chatbots |
| `Zie619/n8n-workflows` | 200+ | 4,343 workflows with searchable FastAPI server |
| `n8n-io/self-hosted-ai-starter-kit` | 5K+ | Self-hosted AI environment (Flint reference) |
| `n8n-io/n8n` | 182K+ | n8n source — reference for node API and workflow JSON format |

**SAAS TEMPLATES (potential template upgrades)**
| Repo | Stars | Use |
|------|-------|-----|
| `ixartz/SaaS-Boilerplate` | 8K+ | Current template — keep as default |
| `boxyhq/saas-starter-kit` | 5K+ | Enterprise: SSO, SAML, audit logs — add as B2B option |
| `adrianhajdin/saas-template` | 2K+ | Clerk + Supabase + Stripe — cleaner alternative |
| `The-SaaS-Factory/next-14-saas-boilerplate` | 1K+ | Multi-tenancy + Prisma — better for client portals |
| `NextJSTemplates/play-nextjs` | 800+ | Has MDX blogging built in — solves blog gap |

**BILLING**
| Repo | Stars | Use |
|------|-------|-----|
| `vercel/nextjs-subscription-payments` | 6K+ | Gold standard Stripe + Next.js — webhook, portal, dunning |

**AI WEBSITE GENERATION**
| Repo | Stars | Use |
|------|-------|-----|
| `zinedkaloc/aipage.dev` | 2K+ | Prompt → HTML/Tailwind patterns |
| `cameronking4/nextjs-ai-page-generator` | 500+ | GPT page gen with Sandpack preview |
| `Ratna-Babu/Ai-Website-Builder` | 300+ | Full-stack AI builder with Convex + theme export |

**DESIGN**
| Repo | Stars | Use |
|------|-------|-----|
| `shadcn-ui/ui` | 80K+ | Component library — generate shadcn patterns directly |
| GitHub topic: `design-md` | — | DESIGN.md collection from popular sites — reference patterns |

---

### Sprint 1: Foundation (Week 1) — 30 hours
| Task | Module | Hours | Priority |
|------|--------|-------|----------|
| mod_hosting.js — 20i domain + email + SPF/DKIM/DMARC | 1 | 8 | P0 |
| mod_billing.js — Stripe products + webhooks + dunning | 9 | 6 | P0 |
| mod_email.js — Acumbamail list + sequences + automation | 3 | 5 | P0 |
| License tracking DB table in Neon | infra | 3 | P0 |
| Build pipeline reorder (deployment checkpoint) | infra | 4 | P0 |
| DYNASTY_TOOL_CONFIG schema update | infra | 2 | P0 |
| Cost tracking system | infra | 2 | P1 |

**Sprint 1 delivers:** Every build gets a custom domain with deliverable email, real Stripe billing, and active email marketing. The three highest-value integrations.

### Sprint 2: Communications + UI (Week 2) — 28 hours
| Task | Module | Hours | Priority |
|------|--------|-------|----------|
| mod_phone.js — CallScaler + Insighto + Trafft booking | 4 | 8 | P0 |
| mod_sms.js — SMS-iT campaigns | 5 | 4 | P0 |
| mod_chatbot.js — Chatbase website widget | 12 | 4 | P1 |
| Build configuration UI (toggles, domain input, pricing) | frontend | 8 | P0 |
| Clerk per-project documentation in OPERATIONS.md | docs | 2 | P1 |
| Deferred DNS verification check | infra | 2 | P1 |

**Sprint 2 delivers:** Every channel a customer might use to reach the business — phone, SMS, chatbot, booking. Plus user-facing configuration controls.

### Sprint 3: Content + SEO + Design (Week 3) — 30 hours
| Task | Module | Hours | Priority |
|------|--------|-------|----------|
| mod_seo.js — WriterZen + NeuronWriter (5 posts) | 6 | 10 | P0 |
| mod_video.js — Vadoo AI + Fliki | 7 | 6 | P1 |
| mod_design.js — SUPERMACHINE + Pixelied + RelayThat | 8 | 6 | P1 |
| Image optimization pipeline (WebP, compression, lazy load) | infra | 3 | P1 |
| Multi-language content generation | 6 | 3 | P2 |
| Rate limiting / fallback system | infra | 2 | P1 |

**Sprint 3 delivers:** Organic acquisition engine — SEO content, video, branded design assets. The business has a content foundation from day one.

### Sprint 4: Intelligence + Automation (Week 4) — 32 hours
| Task | Module | Hours | Priority |
|------|--------|-------|----------|
| mod_analytics.js — Plerdy + PostHog funnels | 10 | 4 | P0 |
| mod_leads.js — Happierleads + Salespanel scoring | 11 | 5 | P1 |
| mod_automation.js — 7 n8n workflows (happy + unhappy) | 14 | 10 | P0 |
| mod_docs.js — Documentero PDFs + SparkReceipt | 13 | 4 | P1 |
| Database migration endpoint (api/setup) | infra | 3 | P0 |
| Post-deploy smoke test (mod_verify.js) | 20 | 4 | P0 |
| End-to-end flow test | 20 | 2 | P1 |

**Sprint 4 delivers:** Intelligence layer (who's visiting, who's hot, what's converting) plus the automation backbone connecting everything. Also: database actually has tables and data.

### Sprint 5: Specialized + Polish (Week 5) — 28 hours
| Task | Module | Hours | Priority |
|------|--------|-------|----------|
| mod_crm.js — SuiteDash (most complex module) | 2 | 10 | P0 |
| mod_directory.js — Brilliant Directories | 16 | 8 | P1 |
| mod_wordpress.js — 20i WP + Dynasty Developer theme | 17 | 6 | P1 |
| mod_social.js — Vista Social import | 15 | 2 | P2 |
| Review/testimonial collection workflow | 14 | 2 | P2 |

**Sprint 5 delivers:** CRM with client portal, directory deployments, WordPress path. The specialized modules.

### Sprint 6: Revenue + Portfolio (Week 6) — 22 hours
| Task | Hours | Priority |
|------|-------|----------|
| Your Deputy's own Stripe checkout (gate builds behind payment) | 8 | P0 |
| Tier gating (Starter/Professional/Enterprise) | 4 | P0 |
| OPERATIONS.md generator (complete, per-build) | 3 | P0 |
| CREDENTIALS.md generator (masked + full versions) | 2 | P0 |
| GBP content generator (description, categories, photos for manual setup) | 2 | P1 |
| Competitor monitoring setup (RTILA) | 3 | P2 |

**Sprint 6 delivers:** Your Deputy is a revenue-generating product. Builds are gated behind payment tiers. Every deliverable is polished.

---

## 16. CREDENTIALS NEEDED — COLLECTION CHECKLIST

Before Sprint 3 starts, collect these API keys:

| Tool | Where to Get | Sprint Needed |
|------|-------------|---------------|
| WriterZen | Dashboard → Settings → API | Sprint 3 |
| NeuronWriter | Account → API Access | Sprint 3 |
| SUPERMACHINE | Dashboard → API | Sprint 3 |
| Pixelied | Account → Developer | Sprint 3 |
| RelayThat | Integrations tab | Sprint 3 |
| Vadoo AI | Dashboard → API | Sprint 3 |
| Fliki | Account → API | Sprint 3 |
| Plerdy | Settings → API | Sprint 4 |
| Happierleads | Settings → Integrations | Sprint 4 |
| Salespanel | Settings → API | Sprint 4 |
| SparkReceipt | Settings → API | Sprint 4 |
| Chatbase | Settings → API | Sprint 2 |
| Vista Social | Settings → API | Sprint 5 |
| SuiteDash | Settings → API (per instance) | Sprint 5 |
| Brilliant Directories | Admin → API (per directory) | Sprint 5 |
| Heartbeat | Settings → API | Sprint 5 |
| FuseBase | Workspace → API | Sprint 5 |

**Sprint 1 needs zero new keys** — all credentials already available.
**Sprint 2 needs 1 key** (Chatbase).
**Sprint 3 needs 6 keys** (content + design tools).

---

## 17. REVENUE MODEL

### Pricing Tiers
| Tier | Price | Modules Included |
|------|-------|-----------------|
| **Foundation** | $1,997 | 90+ strategy documents + code + Vercel deployment (Phases 1-8) |
| **Professional** | $4,997 | + Domain/email + Stripe + CRM + email marketing + chatbot + analytics + leads + automation |
| **Enterprise** | $9,997 | All 17 modules — phone/voice + SMS + SEO + video + design + docs + directory + social |
| **Managed Operations** | $497/mo | Weekly reports, priority support, automation monitoring, ongoing content |

### Unit Economics
| Item | Cost | Revenue | Margin |
|------|------|---------|--------|
| API costs per build | ~$5-10 | $1,997-$9,997 | 99%+ |
| CallScaler per number | $2/mo | $497/mo (in managed ops) | 99% |
| Total tool licenses | $0 (owned) | $590K+ inventory | 100% |

---

## 18. SUCCESS CRITERIA

Your Deputy V3 is **complete** when:

1. ☐ User describes business in one prompt
2. ☐ Within 5 minutes, receives all deliverables from Section 9
3. ☐ Custom domain resolves with SSL (within 24-48hr DNS)
4. ☐ Business email sends and delivers (not spam)
5. ☐ Phone number answers with AI voice agent
6. ☐ Stripe checkout accepts real payments
7. ☐ CRM has working client portal
8. ☐ Email sequences fire on new signup
9. ☐ 5 blog posts live and indexed
10. ☐ All n8n automations fire correctly
11. ☐ Smoke test passes (all routes 200/307)
12. ☐ Lighthouse: Performance > 70, SEO > 80, Accessibility > 80
13. ☐ Build report + OPERATIONS.md + CREDENTIALS.md delivered
14. ☐ Build cost under $10
15. ☐ System handles 10+ builds/day without rate limit failures

---

## 19. OPEN QUESTIONS

1. **SuiteDash multi-instance API** — can one master key manage multiple workspaces? Need to test.
2. **Brilliant Directories programmatic provisioning** — does BD API support creating new directory instances, or manual-only?
3. **Vadoo AI async vs sync** — if async, need polling/webhook mechanism.
4. **n8n credential creation** — can n8n API create credentials, or must they be pre-configured?
5. **Domain registration** — should Your Deputy auto-purchase domains via 20i reseller API? (Involves real money — requires explicit confirmation.)

---

## 20. ESTIMATED TOTALS

| Metric | Value |
|--------|-------|
| **Total sprints** | 7 (Sprint 0-6, one per week) |
| **Total hours** | 182 |
| **Total modules** | 17 |
| **Total build phases** | 20 |
| **Forked repos** | 8 |
| **n8n workflow templates** | 50+ curated (from 9,600+ source) |
| **Credentials already have** | 15 tools |
| **Credentials to collect** | 17 tools |
| **Services provisioned per build** | up to 15 |
| **Files generated per build** | 30-50+ |
| **Documents generated per build** | 15+ |
| **Automation workflows per build** | 7 |
| **Estimated build time** | 4-5 minutes |
| **Estimated build cost** | $5-10 |
| **Revenue per build** | $297-$2,497 |

---

*Ready to begin Sprint 0 (repo forking + workflow library) on approval.*
