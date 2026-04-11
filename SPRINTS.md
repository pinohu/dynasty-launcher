# Sprint Tracking — Your Deputy V3

## Sprint 0: Prep (Week 0, 12 hrs)
- [ ] Fork `ritik-prog/n8n-automation-templates-5000` → curate 50 workflows into `templates/n8n-workflows/`
- [ ] Fork `enescingoz/awesome-n8n-templates` → extract email, CRM, billing templates
- [ ] Study `vercel/nextjs-subscription-payments` → extract Stripe patterns into `templates/stripe-billing/`
- [ ] Study `boxyhq/saas-starter-kit` → extract enterprise patterns into `templates/enterprise/`
- [ ] Study `zinedkaloc/aipage.dev` → document architecture improvements
- [ ] Create `pinohu/dynasty-n8n-library` repo with tagged workflow templates
- [ ] Update DYNASTY_TOOL_CONFIG with complete schema (empty keys for uncollected)

## Sprint 1: Foundation (Week 1, 30 hrs)
- [ ] mod_hosting.js — 20i domain + email + SPF/DKIM/DMARC (8h)
- [ ] mod_billing.js — Stripe products + webhooks + dunning (6h → 3h with Sprint 0 patterns)
- [ ] mod_email.js — Acumbamail list + sequences + automation (5h)
- [ ] License tracking DB table in Neon (3h)
- [ ] Build pipeline reorder: deployment checkpoint between phases 7c and 9 (4h)
- [ ] DYNASTY_TOOL_CONFIG schema update on Vercel (2h)
- [ ] Cost tracking system (2h)
- [ ] Test all 3 modules end-to-end with a test project

## Sprint 2: Communications + UI (Week 2, 28 hrs)
- [ ] mod_phone.js — CallScaler + Insighto + Trafft (8h)
- [ ] mod_sms.js — SMS-iT campaigns (4h)
- [ ] mod_chatbot.js — Chatbase website widget (4h)
- [ ] Build configuration UI in app.html (domain input, toggles, pricing, location) (8h)
- [ ] Deferred DNS verification check system (2h)
- [ ] Clerk per-project documentation in generated OPERATIONS.md (2h)

## Sprint 3: Content + SEO + Design (Week 3, 30 hrs)
- [ ] mod_seo.js — WriterZen + NeuronWriter (10h)
- [ ] mod_video.js — Vadoo AI + Fliki (6h)
- [ ] mod_design.js — SUPERMACHINE + Pixelied + RelayThat (6h)
- [ ] Image optimization pipeline (WebP, compression, lazy load) (3h)
- [ ] Multi-language content generation (3h)
- [ ] Rate limiting / fallback system (2h)

## Sprint 4: Intelligence + Automation (Week 4, 32 hrs)
- [ ] mod_analytics.js — Plerdy + PostHog funnels (4h)
- [ ] mod_leads.js — Happierleads + Salespanel scoring (5h)
- [ ] mod_automation.js — 7 n8n workflows from curated library (10h → 4h with Sprint 0 library)
- [ ] mod_docs.js — Documentero PDFs + SparkReceipt (4h)
- [ ] Database migration endpoint (api/setup route in generated apps) (3h)
- [ ] Post-deploy smoke test (mod_verify) (4h)
- [ ] End-to-end flow test (2h)

## Sprint 5: Specialized + Polish (Week 5, 28 hrs)
- [ ] mod_crm.js — SuiteDash (10h)
- [ ] mod_directory.js — Brilliant Directories (8h)
- [ ] mod_wordpress.js — 20i WP + Dynasty Developer theme (6h)
- [ ] mod_social.js — Vista Social import (2h)
- [ ] Review/testimonial collection workflow (2h)

## Sprint 6: Revenue + Portfolio (Week 6, 22 hrs)
- [ ] Your Deputy Stripe checkout (gate builds behind payment) (8h)
- [ ] Tier gating + Stripe-verified Checkout session for `provision_modules` (Foundation $1,997 / Professional $4,997 / Enterprise $9,997) (4h)
- [ ] OPERATIONS.md generator (per-build, complete) (3h)
- [ ] CREDENTIALS.md generator (masked + full versions) (2h)
- [ ] GBP content generator (2h)
- [ ] Competitor monitoring setup with RTILA (3h)
