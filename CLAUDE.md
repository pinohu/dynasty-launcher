# CLAUDE.md — Your Deputy V3

## What This Is
Your Deputy (`dynasty-launcher.vercel.app`) is a business provisioning engine. A user describes a business idea in one prompt, and the system generates a complete deployed business: code, infrastructure, CRM, phone, email marketing, SEO content, billing, analytics, automation workflows, and legal documents. It currently outputs ~65% of what a real business needs. V3 brings it to 95%+ by integrating 30+ tools from Dynasty Empire's 830+ AppSumo license arsenal.

## Repo Structure
```
dynasty-launcher/
├── index.html              # Landing page (standalone, 169 lines)
├── app.html                # Builder app (monolith, ~8000 lines)
├── api/
│   └── provision.js        # Backend orchestrator (~1100 lines)
├── DYNASTY_LAUNCHER_V3_FINAL.md  # Complete build specification
├── CLAUDE.md               # This file
├── vercel.json             # Deployment config (cleanUrls: true)
├── .vercel/project.json    # Vercel project binding
└── templates/              # Template patterns (to be built)
    └── stripe-billing/     # Stripe patterns from vercel/nextjs-subscription-payments
```

## Architecture
- **app.html**: Single-file frontend. Contains the entire builder UI + AI generation pipeline + build validation gate. All phases run client-side calling the Anthropic API and GitHub API directly.
- **api/provision.js**: Vercel serverless function. Handles deployment: creates GitHub repos (via template fork), creates Vercel projects, sets env vars, triggers deployments. Also handles authority site deploys and retry logic.
- **DYNASTY_TOOL_CONFIG**: Encrypted Vercel env var containing 50+ API keys organized by category (ai, payments, infrastructure, comms, content, crm_pm, automation, data_research, directories, suitedash, community, modules_enabled).

## Current Build Pipeline (20 Phases)
Phases 1-7c: Generate code + docs (client-side AI calls)
Phase 8: Deploy to Vercel/20i (provision.js)
Phases 9-17: Provision external services using live URL (TO BE BUILT)
Phases 18-20: Automation, env update, verify (TO BE BUILT)

## What Exists vs What's Needed

### ✅ EXISTS (Phases 1-8)
- 7-model viability scoring with cross-framework synthesis
- Design system generation (DESIGN.md, CLAUDE.md per project)
- 13+ strategy documents (SPEC, GTM, competitive analysis, etc.)
- Next.js frontend generation with 10 template component overrides
- 8-check build validation gate (vercel.json, package.json, heroicons→lucide, globals.css, unused imports, template branding, translations, link fixes)
- Backend integration (DB schema, API routes, dashboard)
- GitHub repo creation + Vercel deployment + env var provisioning
- /docs and /pricing page generation
- .env.example generation

### ❌ TO BUILD (V3 — 17 Integration Modules)
Each module is a function in provision.js following this interface:
```javascript
async function mod_example(config, project) {
  // config = parsed DYNASTY_TOOL_CONFIG
  // project = { name, slug, description, type, domain, accent, url, ... }
  const results = { ok: false, service: 'example', details: {} };
  try {
    // ... API calls ...
    results.ok = true;
    results.details = { /* provisioned resources */ };
  } catch (e) {
    results.error = e.message;
    results.fallback = 'Manual setup instructions';
  }
  return results;
}
```

Modules to build (in sprint order):
1. mod_hosting (20i: domain, email, SPF/DKIM/DMARC, SSL)
2. mod_billing (Stripe: real products, price tiers, webhooks, dunning)
3. mod_email (Acumbamail: list, welcome sequence, automation)
4. mod_phone (CallScaler + Insighto + Trafft: number, AI voice, booking)
5. mod_sms (SMS-iT: campaigns, templates)
6. mod_chatbot (Chatbase: website widget)
7. mod_seo (WriterZen + NeuronWriter: keyword research, 5 blog posts)
8. mod_video (Vadoo AI + Fliki: explainer video, social clips)
9. mod_design (SUPERMACHINE + Pixelied + RelayThat: hero, OG, social kit)
10. mod_analytics (Plerdy + PostHog: heatmaps, funnels)
11. mod_leads (Happierleads + Salespanel: visitor ID, lead scoring)
12. mod_docs (Documentero + SparkReceipt: legal PDFs, expense tracking)
13. mod_automation (n8n: 7 workflows — see V3 spec)
14. mod_social (Vista Social: import 260-post calendar)
15. mod_crm (SuiteDash: workspace, pipeline, portal, invoicing)
16. mod_directory (Brilliant Directories: full directory provisioning)
17. mod_wordpress (20i + Dynasty Developer theme: WP provisioning)

## Credentials Available
All stored in DYNASTY_TOOL_CONFIG env var on Vercel. Key structure:
```
config.infrastructure.twentyi_general  → 20i API key
config.infrastructure.twentyi_reseller_id → 10455
config.payments.stripe_live → sk_live_...
config.comms.acumbamail → API key
config.comms.callscaler → API key
config.comms.insighto → API key
config.comms.smsit → API key
config.comms.trafft_client_id → Client ID
config.content.documentero → API key
config.automation.n8n_api → JWT token
config.data_research.posthog → API key
```

Keys still needed (empty strings in config — collect before using):
writerzen, neuronwriter, supermachine, pixelied, relaythat, vadoo_ai, fliki, plerdy, happierleads, salespanel, chatbase, sparkreceipt, vista_social, heartbeat, fusebase

## Git Conventions
```bash
git config user.email "polycarpohu@gmail.com"
git config user.name "pinohu"
```
- Branch: `main`
- Commit format: `feat:` / `fix:` / `docs:` / `refactor:`
- Always test build locally before pushing

## Vercel Project
- Project ID: `prj_ohqrZxB5qgn4Hkc5rt8qZAG5fDHX`
- Team: `team_fuTLGjBMk3NAD32Bm5hA7wkr`
- Domain: `dynasty-launcher.vercel.app`
- Routes: `/` → index.html, `/app` → app.html (cleanUrls)
- API: `/api/provision` → api/provision.js

## Testing
After any change:
1. `curl -s -o /dev/null -w "%{http_code}" https://dynasty-launcher.vercel.app` → 200
2. `curl -s -o /dev/null -w "%{http_code}" https://dynasty-launcher.vercel.app/app` → 200
3. `curl -s https://dynasty-launcher.vercel.app/api/provision?action=inventory` → JSON with tool status

On **Windows PowerShell**, `curl` is an alias for `Invoke-WebRequest` — use **`curl.exe`** with the same flags, or `Invoke-WebRequest` equivalents.

## Key Files to Edit
- **app.html lines 5900-6060**: Frontend generation (phases g7, g7b, g7c)
- **app.html lines 6700-7000**: Build validation gate (8 checks)
- **app.html lines 7100-7250**: Provisioning trigger (calls provision.js)
- **api/provision.js lines 40-65**: DYNASTY_TOOL_CONFIG parsing + inventory
- **api/provision.js lines 735-810**: Fullstack deploy (project creation, env vars, deployment)
- **api/provision.js lines 1030-1070**: Retry deploy logic

## V3 Specification
See `DYNASTY_LAUNCHER_V3_FINAL.md` for the complete 720-line spec covering:
- 20-phase build pipeline with deployment checkpoint
- 17 integration module specifications with API contracts
- 7-sprint implementation plan (Sprint 0-6)
- 32 identified gaps all resolved
- DYNASTY_TOOL_CONFIG complete JSON schema
- Error handling, fallbacks, rollback strategy
- Revenue model ($1,997-$9,997 per build)
- Success criteria and testing strategy

## Public GTM / trust artifacts (keep in sync when maturity changes)
- **`maturity.html`** — “What ships today” truth deck (live vs partial vs spec); linked from landing nav as **What ships**.
- **`PAIN_POINT_MASTER_MAP.md`** + **`PAIN_POINT_MASTER_MAP.csv`** — exhaustive pain taxonomy + traceability matrix for sales/RevOps.
- **Builder:** `app.html` includes **Expected scope (honest preview)** under build package (V4 R/D/S matrix + tier caveat).
- **Tier truth:** **`index.html`** states that **Foundation** does **not** auto-provision integration modules, matching **`api/provision.js`** `TIER_MODULES.foundation: []` and **`app.html`** `V3_TIERS.foundation.modules: []`.
