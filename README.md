# Your Deputy V3

**First-time operator?** Open [`doc/START-HERE.md`](doc/START-HERE.md) — tier matrix, 347 vs 353, and where receipts live.

**Product accuracy (warranted claims):** [`docs/PRODUCT_ACCURACY_SCOPE.md`](docs/PRODUCT_ACCURACY_SCOPE.md) — run `npm run verify:product` before release; it asserts `TIER_MODULES`, catalog counts, `maturity.html` parity, and banned absolute-automation phrasing on customer HTML.

> One prompt generates consulting-grade documents, application code, and deployment (**Phases 1–8**). **Foundation** and **Professional** share the **same 11-slot** server integration allowlist in `api/provision.js` (`TIER_MODULES`). **Enterprise** adds **two** more slots (**13** total: WordPress + post-deploy verification). **Custom Volume** is the **19-slot** allowlist (voice, SMS, CRM, directory, leads, video, etc.). Success still depends on keys, archetype rules, and vendor APIs — see `maturity.html` and each build’s `BUILD-MANIFEST.json`.

## What It Does

Your Deputy takes a plain-English business description and generates:

**Always (paid build, Phases 1–8)**
- GitHub repo with many production files (archetype-dependent counts)
- Vercel deployment path + strategy/technical document set
- Application code and owner runbooks (`OPERATIONS.md`, etc.)

**When tier + package + provisioning succeed (Phases 9–20, not all automatic today)**
- Optional: database, domain/email patterns, and third-party integrations per module

**19 `mod_*` integration types** exist in `api/provision.js`; each **paid build tier** only runs the subset in `TIER_MODULES` for that tier (11 / 11 / 13 / 19 — see `CLAUDE.md`)

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
| mod_verify | Orchestrator | Post-deploy smoke checks on live URL (Enterprise + Managed allowlist) |
| mod_vertical_tool | Repo + APIs | Vertical niche scaffold (Blob/Postgres when configured; tier-gated) |

**Plus:** 8-framework viability analysis, large strategy + technical document set (counts vary by archetype), `OPERATIONS.md`, and `CREDENTIALS.md` when integrations are actually provisioned.

## Architecture

```
index.html              <- Landing page (V3 pricing + features)
app.html                <- Builder app (monolith frontend; large single file)
api/provision.js        <- Backend orchestrator (19 mod_* types; tier allowlists gate which run)
api/ai.js               <- Multi-provider AI router (7 providers)
api/orchestrate.js      <- Compaction engine + smart routing
api/memory.js           <- Project history (Neon)
api/flags.js            <- Feature flags
api/health.js           <- Credential health checks
api/checkout.js         <- Stripe checkout for Dynasty tiers
vercel.json             <- Vercel config (300s timeout for modules)
```

## Pricing Tiers (see `index.html` / checkout for live SKUs)

- **Foundation** ($1,997/build): Strategy docs + code + deployment + **11-slot** integration attempts (same allowlist as Professional)
- **Professional** ($4,997/build): Same **11-slot** server allowlist as Foundation; higher build-tier positioning — still key- and archetype-gated
- **Enterprise** ($9,997/build): **13-slot** allowlist (adds WordPress + post-deploy verification). Voice/SMS/CRM/directory/leads/video require **Custom Volume** or manual work — see `maturity.html`
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
