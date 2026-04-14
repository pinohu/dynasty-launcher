# PA CROP Services — Complete Automation Inventory
### 146 Automations Across 3 Layers | March 2026 Final State (v4.0)
**Dynasty Empire LLC | Built March 2026 | pacropservices.com**

---

## Summary

| Metric | Count |
|--------|-------|
| **APIs deployed on Vercel** | 90 |
| **HTML pages** | 36 |
| **Automations deployed** | 113 (82%) |
| **Automations specified (need config)** | 8 |
| **Automations remaining (Layer 2)** | 17 |
| **Automations identified (Layer 3)** | 8 |
| **Grand total** | 146 |
| **n8n workflow exports** | 17 |
| **AppSumo tool connectors** | 11 |

---

## LAYER 1 — DEPLOYED & LIVE (113 Automations)

### Phase 1: Client Acquisition & Lead Capture

| # | Automation | API/System | Status |
|---|-----------|------------|--------|
| 1 | Website compliance check form → lead capture | `/api/intake` | ✅ LIVE |
| 2 | Lead scoring (5 signals: visitedDeadline +20, completedCheck +30, hasForeignEntity +25, planInterest +15, source +10) | `/api/qualify-lead` | ✅ LIVE |
| 3 | Hot lead alert → n8n webhook | `/api/intake` → `crop-hot-lead-alert` | ✅ LIVE |
| 4 | Lead nurture drip start | `/api/subscribe` → `crop-lead-nurture-start` | ✅ LIVE |
| 5 | Partner referral attribution on intake | `/api/intake` (data-partner field) | ✅ LIVE |
| 6 | Embeddable widget for partner sites | `/embed/crop-widget.js` | ✅ LIVE |
| 7 | A/B test hero section (control vs urgency variant) | `index.html` cookie-based 50/50 | ✅ LIVE |
| 8 | Microsoft Clarity visitor analytics | `index.html` snippet | ✅ LIVE |
| 9 | Plausible custom event tracking (CTAs, check starts) | `index.html` events | ✅ LIVE |
| 10 | Interactive compliance checklist (M1 lead magnet) | `/pa-2027-compliance-checklist` | ✅ LIVE |

### Phase 2: Client Onboarding

| # | Automation | API/System | Status |
|---|-----------|------------|--------|
| 11 | New client onboarding n8n workflow | n8n `OkjdJx2bRqlgl1s7` | ✅ LIVE |
| 12 | SuiteDash contact creation on Stripe payment | `/api/stripe-webhook` | ✅ LIVE |
| 13 | Welcome email via Emailit | `/api/stripe-webhook` → Emailit | ✅ LIVE |
| 14 | Portal access code generation + delivery | `/api/stripe-webhook` | ✅ LIVE |
| 15 | Entity intake form (new entity registration) | `/api/entity-intake` | ✅ LIVE |
| 16 | Foreign entity qualification flow | `/api/entity-request` | ✅ LIVE |
| 17 | Portal onboarding checklist (7-step tracker) | Portal Dashboard | ✅ LIVE |
| 18 | Client context assembly (tier, entity, history) | `/api/client-context` | ✅ LIVE |

### Phase 3: Content & SEO

| # | Automation | API/System | Status |
|---|-----------|------------|--------|
| 19 | Full content pipeline (research → write → publish → social → newsletter) | `/api/auto-article` | ✅ LIVE |
| 20 | Auto-generated social media posts from articles | Built into `/api/auto-article` | ✅ LIVE |
| 21 | Newsletter blurb auto-generation | Built into `/api/auto-article` | ✅ LIVE |
| 22 | FAQ expansion from chatbot conversations | `/api/auto-article` FAQ mode | ✅ LIVE |
| 23 | 67-county PA landing page generator | `/api/county-pages` | ✅ LIVE |
| 24 | Article publishing with SEO metadata | `/api/publish-article` | ✅ LIVE |
| 25 | Article generation with Groq | `/api/generate-article` | ✅ LIVE |
| 26 | Brand voice context files (5 hook types, voice pillars) | `context/brand-voice.md` | ✅ LIVE |
| 27 | Niche config (keywords, competitors, content standards) | `context/niche-config.md` | ✅ LIVE |
| 28 | Internal link map for SEO interlinking | `context/internal-links-map.md` | ✅ LIVE |
| 29 | Annual report guide (rewritten, 2000+ words) | `/annual-report-guide` | ✅ LIVE |
| 30 | CROP explainer (rewritten, 2100+ words) | `/what-is-crop` | ✅ LIVE |
| 31 | 2027 deadline article (rewritten, 1900+ words) | `/2027-deadline` | ✅ LIVE |
| 32 | CROP vs agent comparison (rewritten, 1600+ words) | `/crop-vs-agent` | ✅ LIVE |
| 33 | How to change CROP (rewritten, 1700+ words) | `/how-to-change-crop` | ✅ LIVE |
| 34 | PA LLC Registered Office Requirements | new article | ✅ LIVE |
| 35 | How to File PA Annual Report 2026 | new article | ✅ LIVE |
| 36 | Reinstate Dissolved PA LLC guide | new article | ✅ LIVE |
| 37 | Foreign Entity Annual Report guide | new article | ✅ LIVE |
| 38 | PA Business Glossary (15 terms, schema markup) | new page | ✅ LIVE |
| 39 | About page (Person + AboutPage schema) | `/about` | ✅ LIVE |

### Phase 4: AI & Chatbot

| # | Automation | API/System | Status |
|---|-----------|------------|--------|
| 40 | AI compliance chatbot (Groq llama-3.3-70b) | `/api/chat` | ✅ LIVE |
| 41 | Chatbot RAG on PA statutes, annual reports, 2027 deadline | `/api/chat` system prompt | ✅ LIVE |
| 42 | Context-aware chatbot (reads client tier, entity name) | `/api/client-context` → `/api/chat` | ✅ LIVE |
| 43 | Public chatbot embed script | `/embed/chatbot.js` | ✅ LIVE |
| 44 | Portal floating chat bubble | Portal widget | ✅ LIVE |
| 45 | Chatbot analytics | `/api/chatbot-analytics` | ✅ LIVE |
| 46 | AI email triage (classify, score urgency, draft reply) | `/api/email-triage` | ✅ LIVE |
| 47 | Smart lead qualifier (5-dimension scoring) | `/api/qualify-lead` | ✅ LIVE |

### Phase 5: Client Portal Self-Service

| # | Automation | API/System | Status |
|---|-----------|------------|--------|
| 48 | Document upload with AI classification | Portal + `/api/classify-document` | ✅ LIVE |
| 49 | Entity info self-update (name, address, officers) | Portal + `/api/entity-update` | ✅ LIVE |
| 50 | Multi-entity management dashboard | Portal multi-entity tab | ✅ LIVE |
| 51 | Client-initiated tier upgrade | Portal + `/api/client-upgrade` | ✅ LIVE |
| 52 | Notification preferences (email/SMS/phone toggles) | Portal + `/api/notification-preferences` | ✅ LIVE |
| 53 | In-portal notification bell with badge count | Portal JS | ✅ LIVE |
| 54 | Knowledge base search | Portal KB tab | ✅ LIVE |
| 55 | Certification badge display | Portal badge | ✅ LIVE |
| 56 | Multi-state compliance monitor | Portal monitor | ✅ LIVE |
| 57 | Portal login with access code | Portal auth | ✅ LIVE |
| 58 | Business credit building guide (6-step) | Portal module | ✅ LIVE |
| 59 | Legal templates (7 docs, tier-gated) | Portal module | ✅ LIVE |
| 60 | New entity formation flow (PA LLC, WY LLC, S-Corp) | Portal module | ✅ LIVE |
| 61 | Insurance requirements guide (GL, E&O, BOP, cyber) | Portal module | ✅ LIVE |

### Phase 6: Financial Automation

| # | Automation | API/System | Status |
|---|-----------|------------|--------|
| 62 | Stripe webhook processing (payment → SuiteDash → welcome) | `/api/stripe-webhook` | ✅ LIVE |
| 63 | Branded invoice generation on every payment | `/api/invoice-generate` | ✅ LIVE |
| 64 | Invoice auto-emailed to client | stripe-webhook → invoice-generate → Emailit | ✅ LIVE |
| 65 | MRR/ARR tracking dashboard | `/api/mrr-dashboard` | ✅ LIVE |
| 66 | Partner commission payout reports | `/api/partner-commission` | ✅ LIVE |
| 67 | Tax-ready revenue export (quarterly CSV) | `/api/tax-export` | ✅ LIVE |
| 68 | Failed payment recovery (SMS Day 1, email Day 3, phone Day 7) | `/api/dunning` | ✅ LIVE |

### Phase 7: Communication Stack

| # | Automation | API/System | Status |
|---|-----------|------------|--------|
| 69 | Emailit transactional email | Emailit API | ✅ LIVE |
| 70 | SMS-iT text messaging | SMS-iT API | ✅ LIVE |
| 71 | Twilio SMS fallback | `/api/sms-send` | ✅ LIVE |
| 72 | CallScaler call tracking (814-228-2822) | CallScaler API | ✅ LIVE |
| 73 | Insighto voice agent | Insighto API | ✅ LIVE |
| 74 | Thoughtly voice agent | Thoughtly API | ✅ LIVE |
| 75 | Trafft appointment booking | Trafft API | ✅ LIVE |
| 76 | Acumbamail email marketing sync | n8n workflow | ✅ LIVE |

### Phase 8: Compliance & Monitoring

| # | Automation | API/System | Status |
|---|-----------|------------|--------|
| 77 | PA DOS entity status monitor (daily cron) | `/api/entity-monitor` + n8n | ✅ LIVE |
| 78 | Real-time compliance health scoring (7 factors) | `/api/compliance-score` | ✅ LIVE |
| 79 | Annual report reminder automation | n8n workflow | ✅ LIVE |
| 80 | Compliance alert blog post generation | `/api/auto-article` compliance mode | ✅ LIVE |
| 81 | Legislative change monitor | `/api/legislative-monitor` | ✅ LIVE |

### Phase 9: Partner & Referral

| # | Automation | API/System | Status |
|---|-----------|------------|--------|
| 82 | Partner onboarding workflow | n8n `partner-onboarding` | ✅ LIVE |
| 83 | Partner intake form | `/api/partner-intake` | ✅ LIVE |
| 84 | Partner commission tracking | `/api/partner-commission` | ✅ LIVE |
| 85 | Partner performance reports | `/api/partner-reports` | ✅ LIVE |
| 86 | Partner referral widget with attribution | `/embed/crop-widget.js` | ✅ LIVE |

### Phase 10: Infrastructure & DevOps

| # | Automation | API/System | Status |
|---|-----------|------------|--------|
| 87 | System health monitor | `/api/health` | ✅ LIVE |
| 88 | Portal health check | `/api/portal-health` | ✅ LIVE |
| 89 | Uptime monitor | `/api/uptime` | ✅ LIVE |
| 90 | Error analysis | `/api/error-analysis` | ✅ LIVE |
| 91 | Client hosting status (20i) | `/api/client-hosting` | ✅ LIVE |
| 92 | 20i hosting provisioning on new client | `/api/provision` | ✅ LIVE |
| 93 | Portal reset code flow | `/api/reset-code` | ✅ LIVE |
| 94 | Admin authentication | `/api/admin-auth` | ✅ LIVE |

### Phase 11: Retention & Growth

| # | Automation | API/System | Status |
|---|-----------|------------|--------|
| 95 | Client health scoring | `/api/client-health` | ✅ LIVE |
| 96 | Churn prediction alerts | `/api/churn-predict` | ✅ LIVE |
| 97 | Upsell opportunity detection | `/api/upsell-detect` | ✅ LIVE |
| 98 | Review request automation | `/api/review-request` | ✅ LIVE |
| 99 | Win-back sequence for churned clients | n8n workflow | ✅ LIVE |
| 100 | Newsletter auto-generation (monthly) | `/api/newsletter` | ✅ LIVE |
| 101 | Analytics digest (weekly ops report) | `/api/analytics-digest` | ✅ LIVE |

### Phase 12: N8N Workflow Exports & Tool Connectors

| # | Automation | API/System | Status |
|---|-----------|------------|--------|
| 102 | n8n workflow export system (17 workflows) | `/api/n8n-export` | ✅ LIVE |
| 103 | Unified tool connector hub (11 AppSumo tools) | `/api/tool-connector` | ✅ LIVE |
| 104 | Setup guide system (6 sections) | `/api/setup-guide` | ✅ LIVE |
| 105 | Master automation status dashboard | `/api/automation-status` | ✅ LIVE |
| 106-113 | Individual n8n cron workflows (ops-digest, entity-monitor, hosting-health, churn, upsell, reviews, winback, newsletter) | n8n crons | ✅ LIVE |

---

## LAYER 2 — SPECIFIED (Need External Config, No Code Needed)

| # | Automation | Tool | Config Needed |
|---|-----------|------|---------------|
| 114 | SuiteDash native onboarding drip | SuiteDash | Auto-Template chain config |
| 115 | SuiteDash renewal reminder sequence | SuiteDash | Auto-Template chain config |
| 116 | SuiteDash engagement scoring | SuiteDash | Custom field formula |
| 117 | Thoughtly voice agent training | Thoughtly | Knowledge base upload |
| 118 | Insighto knowledge base articles (25) | Insighto | Article creation |
| 119 | Trafft service type configuration | Trafft | Service + staff setup |
| 120 | Stripe subscription conversion (links → subscriptions) | Stripe | Product reconfiguration |
| 121 | Acumbamail list segments + templates | Acumbamail | List + template design |
| 122-130 | SuiteDash native automations (10 specified) | SuiteDash | Dashboard click-config |

---

## LAYER 3 — IDENTIFIED (Future Build)

### AppSumo Tool Arsenal (5 remaining)
| # | Automation | Tools |
|---|-----------|-------|
| 131 | WriterZen SEO research integration | WriterZen API |
| 132 | Vadoo AI video from articles | Vadoo API |
| 133 | Fliki video from articles | Fliki API |
| 134 | Castmagic podcast-to-content | Castmagic API |
| 135 | Dynasty Developer theme for client sites | WordPress |

### Government/Regulatory (5 remaining)
| # | Automation | Tools |
|---|-----------|-------|
| 136 | PA DOS direct e-filing API | PA DOS |
| 137 | IRS EIN verification | IRS API |
| 138 | UCC lien monitoring | PA DOR |
| 139 | Multi-state SOS monitoring | Secretary of State APIs |
| 140 | Workers' comp verification | PA L&I |

### Scale & Replication (4 remaining)
| # | Automation | Tools |
|---|-----------|-------|
| 141 | 50-state platform cloning | Vercel + Neon |
| 142 | FindMyCROP.com directory | Brilliant Directories |
| 143 | PABusinessServices.com directory | Brilliant Directories |
| 144 | Franchise system (135 SuiteDash licenses) | SuiteDash |

### Data/Intelligence Moats (2 remaining)
| # | Automation | Tools |
|---|-----------|-------|
| 145 | ML compliance risk scoring model | Python + Neon |
| 146 | 2027 dissolution wave prediction | Data analysis |

---

## N8N WORKFLOW REGISTRY

All 17 exportable via `/api/n8n-export?workflow=list`

| ID | Workflow Name | Trigger | Frequency |
|----|-------------|---------|-----------|
| 1 | ops-digest | Cron | Weekly Mon 8AM |
| 2 | entity-monitor | Cron | Daily 6AM |
| 3 | hosting-health | Cron | Daily 7AM |
| 4 | churn-predict | Cron | Daily 9AM |
| 5 | upsell-detect | Cron | Weekly Wed 10AM |
| 6 | review-request | Cron | Daily 2PM |
| 7 | winback | Cron | Weekly Fri 11AM |
| 8 | newsletter | Cron | Monthly 1st 9AM |
| 9 | auto-article | Cron | Weekly Tue 6AM |
| 10 | client-health | Cron | Daily 8AM |
| 11 | backup | Cron | Daily 3AM |
| 12 | uptime | Cron | Every 5min |
| 13 | analytics-digest | Cron | Weekly Mon 7AM |
| 14 | chatbot-analytics | Cron | Daily 11PM |
| 15 | faq-expansion | Cron | Weekly Thu 6AM |
| 16 | partner-reports | Cron | Monthly 15th 9AM |
| 17 | legislative-monitor | Cron | Daily 5AM |

---

## STRIPE PRODUCTS

| Tier | Price | Payment Link | Product ID |
|------|-------|-------------|------------|
| Compliance Only | $99/yr | `buy.stripe.com/6oU9AUcheaD173I2Ys6sw0c` | `prod_UHYFelsYQb0fJb` |
| Business Starter | $199/yr | `buy.stripe.com/28E7sM80YdPdewa42w6sw09` | — |
| Business Pro | $349/yr | `buy.stripe.com/7sY4gAepm12rbjYaqU6sw0a` | — |
| Business Empire | $699/yr | `buy.stripe.com/cNi4gAgxueTh9bQaqU6sw0b` | — |

---

## INFRASTRUCTURE

| Component | Detail |
|-----------|--------|
| **GitHub** | `pinohu/pa-crop-services` |
| **Vercel** | Project `prj_MrCHRfSE1tdtaLy7Niwr7D4DlJ8c`, Team `team_fuTLGjBMk3NAD32Bm5hA7wkr` |
| **Neon DB** | `ep-small-pond-ajxunei4-pooler.c-3.us-east-2.aws.neon.tech` |
| **n8n** | `https://n8n.audreysplace.place` |
| **Comms** | CallScaler (814-228-2822), SMS-iT, Emailit, Insighto, Thoughtly, Trafft |
| **20i** | ResellerId 10455 |
| **Admin Key** | `CROP-ADMIN-2026-IKE` |
