# Your Deputy V3

> One prompt deploys a complete operating business in under 10 minutes. Website, domain, email, phone, CRM, billing, marketing, SEO, video, design, analytics, automation, and legal docs — all provisioned automatically.

## What It Does

Your Deputy takes a plain-English business description and provisions:

**Infrastructure** (Phase 8)
- GitHub repo with 30+ production files
- Vercel/20i deployment with custom domain + SSL
- Neon PostgreSQL database
- Business email with SPF/DKIM/DMARC

**17 Integration Modules** (Phases 9-20)
| Module | Service | What It Provisions |
|--------|---------|-------------------|
| mod_hosting | 20i | Domain, DNS, email, SSL, SPF/DKIM/DMARC |
| mod_billing | Stripe | Product, 3 price tiers, webhooks, dunning, customer portal |
| mod_email | Acumbamail | Subscriber list, 5-email welcome sequence, automation |
| mod_phone | CallScaler + Insighto + Trafft | Local number, AI voice agent, booking page |
| mod_sms | SMS-iT | Contact group, 3 SMS templates |
| mod_chatbot | Chatbase | Website chatbot trained on business FAQ |
| mod_seo | WriterZen + NeuronWriter | Keyword research, 5 SEO blog posts |
| mod_video | Vadoo AI + Fliki | 60-90s explainer video, 3 social clips |
| mod_design | SUPERMACHINE + Pixelied + RelayThat | Hero image, OG image, 40+ social graphics |
| mod_analytics | Plerdy + PostHog | Heatmaps, funnels, session recording |
| mod_leads | Happierleads + Salespanel | Visitor ID, lead scoring, hot lead alerts |
| mod_automation | n8n | 7 workflows (signup, booking, payment, leads, missed call, dunning, reviews) |
| mod_docs | Documentero + SparkReceipt | ToS, Privacy Policy, Service Agreement PDFs |
| mod_crm | SuiteDash | Workspace, pipeline, client portal, invoicing |
| mod_directory | Brilliant Directories | Directory instance, tiers, categories (directory projects) |
| mod_wordpress | 20i | WordPress package, theme, plugins (WordPress projects) |
| mod_social | Vista Social | 260-post social calendar import |

**Plus:** 13+ strategy documents, 8-framework viability analysis, OPERATIONS.md owner's manual, CREDENTIALS.md service credentials.

## Architecture

```
index.html              <- Landing page (V3 pricing + features)
app.html                <- Builder app (~8300 lines, monolith frontend)
api/provision.js        <- Backend orchestrator (~2450 lines, 17 modules)
api/ai.js               <- Multi-provider AI router (7 providers)
api/orchestrate.js      <- Compaction engine + smart routing
api/memory.js           <- Project history (Neon)
api/flags.js            <- Feature flags
api/health.js           <- Credential health checks
api/checkout.js         <- Stripe checkout for Dynasty tiers
vercel.json             <- Vercel config (300s timeout for modules)
```

## Pricing Tiers

- **Foundation** ($497/build): Strategy docs + code + deployment (Phases 1-8)
- **Professional** ($1,497/build): + domain, email, billing, CRM, marketing, chatbot, analytics
- **Enterprise** ($2,997/build): All 17 modules + managed operations available

## Deploy

```
npx vercel --prod
```

## Vercel Project

- Domain: `dynasty-launcher.vercel.app`
- Project ID: `prj_ohqrZxB5qgn4Hkc5rt8qZAG5fDHX`
- Team: `team_fuTLGjBMk3NAD32Bm5hA7wkr`

---

*Dynasty Empire LLC — Built for multi-generational permanence.*
