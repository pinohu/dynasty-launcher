# Your Deputy V3

> One prompt generates consulting-grade documents, application code, and deployment (**Phases 1–8**). **Foundation** matches the server: **no automatic `mod_*` integration provisioning** (`TIER_MODULES.foundation` is empty). **Professional** and **Enterprise** unlock live integration attempts where APIs, keys, and your **site package** allow; see `maturity.html` and `BUILD-MANIFEST.json` for what a given build actually shipped.

## What It Does

Your Deputy takes a plain-English business description and generates:

**Always (paid build, Phases 1–8)**
- GitHub repo with many production files (archetype-dependent counts)
- Vercel deployment path + strategy/technical document set
- Application code and owner runbooks (`OPERATIONS.md`, etc.)

**When tier + package + provisioning succeed (Phases 9–20, not all automatic today)**
- Optional: database, domain/email patterns, and third-party integrations per module

**17 Integration Modules** (target design — **Enterprise tier** attempts the broadest set; **Foundation** does **not** auto-run these on the server)

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

**Plus:** 8-framework viability analysis, large strategy + technical document set (counts vary by archetype), `OPERATIONS.md`, and `CREDENTIALS.md` when integrations are actually provisioned.

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

## Pricing Tiers (see `index.html` / checkout for live SKUs)

- **Foundation** ($1,997/build): Strategy docs + code + deployment; **no** server-side auto `mod_*` provisioning
- **Professional** ($4,997/build): Foundation + core live integrations **where APIs succeed** (domain/email, payments, CRM, marketing, chatbot, analytics, automation — subject to keys and deferrals)
- **Enterprise** ($9,997/build): Broadest integration set (up to **17 module types** when not skipped by package); **not** a guarantee every vendor API succeeds — see `maturity.html`
- **Managed Operations** ($497/mo): Add-on subscription after a build ships

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
