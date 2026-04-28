# CLAUDE.md — Your Deputy V3

## What This Is
Your Deputy (`dynasty-launcher.vercel.app`, product domain `yourdeputy.com`) is a business provisioning engine. A user describes a business idea in one prompt, and the system generates documents, code, and deployment. **Foundation** ($1,997) now provisions the full 11-module integration set (matching Professional) — open-weight models (WebLLM + Gemma 4 free tier) removed the cost barrier that previously justified skipping paid integrations on Foundation. **Professional** ($4,997) runs the same 11 modules with higher throughput; **Enterprise** ($9,997) runs up to 13 modules; **custom_volume** unlocks all 19 `mod_*` functions. All `mod_*` functions are implemented; some vendor API keys are still empty — see "Keys still needed" below.

**Buyer-true copy:** `docs/PRODUCT_ACCURACY_SCOPE.md` + `npm run verify:product` define which repo surfaces are warranted against `TIER_MODULES` / `automation-catalog.js` / `maturity.html` parity; CI runs `.github/workflows/product-alignment.yml`.

## Repo Structure
```
dynasty-launcher/
├── index.html              # Landing page (standalone, ~370 lines)
├── app.html                # Builder app (monolith, ~14340 lines)
├── maturity.html           # "What ships today" truth deck (~140 lines)
├── deliverables.html       # Deliverables hub page
├── deliverables/           # Category + individual deliverable pages (160 files)
├── api/
│   ├── provision.js        # Backend orchestrator (~3570 lines, 19 mod_* functions)
│   ├── automation-catalog.js # 353 n8n workflow catalog + generator (45 categories; 347 = strategy micro-tasks in docs)
│   ├── checkout.js         # Stripe checkout + session recovery (~290 lines)
│   ├── auth.js             # Clerk auth + admin key verification (~130 lines)
│   ├── waitlist.js         # Waitlist capture (Acumbamail + Telegram + Neon)
│   ├── ai.js               # AI router (legacy hand-rolled multi-provider + quota + rate limiting)
│   ├── ai-sdk.js           # Vercel AI SDK wrapper — typed structured output (Zod), streaming, Langfuse tracing
│   ├── _schemas.js         # Zod schemas for scoring / pivot / synthesis / build diagnostics
│   ├── _langfuse.js        # Langfuse tracing wrapper (no-op when keys absent)
│   ├── neon.js             # Neon DB provisioner (~130 lines)
│   ├── admin.js            # Admin dashboard backend
│   ├── claude.js           # Anthropic Claude API proxy (auth-gated)
│   ├── docgen.js           # Document generation helper (library, not an HTTP endpoint)
│   ├── flags.js            # Feature flags
│   ├── github.js           # GitHub API proxy (auth-gated, path-restricted)
│   ├── health.js           # Health check endpoint (admin-gated detail)
│   ├── memory.js           # Project memory storage (auth-gated)
│   ├── orchestrate.js      # Build orchestration helper (auth-gated)
│   ├── research.js         # Research API proxy (auth-gated)
│   ├── telemetry.js        # Telemetry / analytics events
│   ├── twentyi.js          # 20i hosting API proxy (auth-gated)
│   └── validate.js         # Build validation (payload-limited)
├── for/                    # Persona-specific funnel pages (10 pages)
├── middleware.js           # Vercel Edge Middleware (~210 lines)
├── admin.html              # Admin dashboard UI (~440 lines)
├── quiz.html               # Diagnostic quiz (~310 lines)
├── privacy.html            # Privacy policy
├── terms.html              # Terms of service
├── sw.js                   # Service worker
├── sitemap.xml             # Sitemap (177 URLs)
├── robots.txt              # Robots config
├── manifest.json           # PWA manifest
├── DYNASTY_LAUNCHER_V3_FINAL.md  # Complete build specification
├── CLAUDE.md               # This file
├── vercel.json             # Deployment config (cleanUrls: true)
├── .vercel/project.json    # Vercel project binding
└── templates/              # Template patterns (to be built)
    └── stripe-billing/     # Stripe patterns from vercel/nextjs-subscription-payments
```

## Architecture
- **app.html**: Single-file frontend. Contains the entire builder UI + AI generation pipeline + build validation gate. All phases run client-side calling the Anthropic API and GitHub API directly. **Viability scoring uses WebLLM (client-side WebGPU inference) as the primary path** — a Gemma 2 2B or Qwen2.5-3B model runs directly in the browser for zero-cost, unlimited, private scoring. Falls back to server-side `/api/ai` when WebGPU is unavailable.
- **api/provision.js**: Vercel serverless function. Handles deployment: creates GitHub repos (via template fork), creates Vercel projects, sets env vars, triggers deployments. Implements **19** `mod_*` integration functions (hosting, billing, email, phone, sms, chatbot, seo, video, design, analytics, leads, automation, docs, crm, directory, wordpress, social, verify, vertical_tool). **`TIER_MODULES`** decides which run per paid tier (**11 / 11 / 13 / 19** for Foundation / Professional / Enterprise / Custom Volume — Foundation is **not** an empty list). The `mod_automation` function uses `automation-catalog.js` to deploy n8n workflows via API and can push the **353-workflow** export catalog as importable JSON. Handles authority site deploys and retry logic.
- **api/ai.js**: AI router. Multi-provider (Anthropic, OpenAI, Google/Gemma 4, Groq, DeepSeek, Mistral, OpenRouter, Ollama, Cerebras, SambaNova). Rate limiting + quota system. **Gemma 4 27B (via Google AI Studio, free tier) is the preferred free model** for server-side scoring and generation. Cloud fallback for browsers without WebGPU.
- **DYNASTY_TOOL_CONFIG**: Encrypted Vercel env var containing 50+ API keys organized by category (ai, payments, infrastructure, comms, content, crm_pm, automation, data_research, directories, suitedash, community, modules_enabled).

### WebLLM / client-side inference
Viability scoring defaults to **client-side WebLLM** (Gemma 2 2B or Qwen2.5-3B, ~1-2 GB quantized). The model downloads once via CDN and is cached by the browser. Scoring then runs entirely in-browser using WebGPU — no server calls, no API keys, no cost. **Fallback chain:** WebLLM → server-side Gemma 4 27B (free via Google AI Studio) → other free models (Groq/Cerebras/SambaNova) → paid models. The server-side quota system (3 guest / 6 registered / Scoring Pro $19/mo) only applies when the cloud fallback is used.

### TurboQuant pipeline compression (v3.1)
The build pipeline applies Google TurboQuant's data-oblivious compression philosophy:
- **Parallel batches:** pitch + investor + legal run as one `Promise.allSettled`; emails + discovery + compete run as another; g8_* Day-1 Kit runs as two parallel groups (tests+seed+api, then onboard+playbook).
- **Critical depth docs:** All 9 foundational business documents fire in a single parallel batch (previously 3 sequential groups of 3).
- **Cross-framework synthesis** uses WebLLM first (zero cost), falling back to cloud.
- **Free model priority:** `gemma-4-31b-it` → `gemma-4-26b-a4b-it` → `gemini-2.0-flash` → Groq/Cerebras/SambaNova.

### Third-party credential boundary
Keys in **DYNASTY_TOOL_CONFIG** (and related Vercel env vars on **dynasty-launcher**) exist to **generate derivative work** and to **run one-time provisioning** (repos, deploys, `mod_*` setup) where the orchestrator calls vendor APIs. They are **not** the long-term operating substrate for customer deliverables. Shipped apps should **sustain themselves** on the **customer’s own** vendor accounts: values documented in **`.env.example`**, **MANUAL-ACTIONS.md**, and env vars on the **customer’s** Vercel/GitHub project — not a permanent dependency on the launcher’s shared key pool. When a module creates an external resource, prefer outcomes that **hand off** ownership (customer API keys, webhooks on their URL, their Stripe Connect, etc.) over routing all live traffic through Dynasty-held secrets.

**Enforced in `api/provision.js`:** customer Vercel projects are **not** populated with real Clerk, Stripe, or Stripe-webhook secrets from the launcher; only **placeholders** plus non-secret routing (`NEXT_PUBLIC_APP_URL`, sign-in paths, etc.). **`api/neon.js`** `set_vercel_db` does **not** POST `DATABASE_URL` to Vercel — the customer adds it in their dashboard.

## Current Build Pipeline (20+ Phases)
Phases 1-7c: Generate code + docs (client-side AI calls)
Phase 8 (Day-1 Success Kit): Onboarding dashboard, test suite, seed data, API collection, 90-day launch playbook — runs for all build types
Phase 8d: Deploy to Vercel/20i (provision.js)
Phases 9-17: Provision external services using live URL (`mod_*` subset per **`TIER_MODULES`** row for the paid tier; keys and archetype can defer/skip)
Phases 18-20: Automation, env update, verify (orchestrator logic exists; runs when all prerequisite modules succeed)

## What Exists vs What's Needed

### ✅ EXISTS (Phases 1-8+)
- 7-model viability scoring with cross-framework synthesis
- Design system generation (DESIGN.md, CLAUDE.md per project)
- 13+ strategy documents (SPEC, GTM, competitive analysis, etc.)
- Next.js frontend generation with 10 template component overrides
- 8-check build validation gate (vercel.json, package.json, heroicons→lucide, globals.css, unused imports, template branding, translations, link fixes)
- Backend integration (DB schema, API routes, dashboard)
- GitHub repo creation + Vercel deployment + env var provisioning
- /docs and /pricing page generation
- .env.example generation
- **Day-1 Success Kit** (5 AI-generated resources, no external dependencies):
  - `public/onboard.html` — Interactive onboarding dashboard with checklist, progress bar, vendor links
  - `src/__tests__/` + `e2e/` — Vitest unit tests, RTL component tests, Playwright e2e smoke tests
  - `src/data/seed/` + `src/scripts/seed.ts` — Fictional seed data + executable seeder script
  - `docs/openapi.json` + `docs/postman-collection.json` — OpenAPI 3.0 spec + Postman collection
  - `LAUNCH-PLAYBOOK.md` — Tier-aware 90-day action plan referencing specific repo deliverables

### ✅ IMPLEMENTED (17 Integration Modules in provision.js)
Each module follows this interface pattern:
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

Modules implemented (Foundation+ runs the 11-module set when credentials allow; Enterprise/custom_volume extend to the remaining integrations):
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
- **app.html lines ~12700-12900**: Frontend generation (phases g7, g7b, g7c)
- **app.html lines ~9200-9500**: Build validation gate (8 checks)
- **app.html lines ~4900-5100**: Provisioning trigger (proceedToBuild, calls provision.js)
- **app.html lines ~10000-10350**: Day-1 Success Kit (g8_onboard, g8_tests, g8_seed, g8_api, g8_playbook)
- **api/provision.js lines ~2135-2245**: DYNASTY_TOOL_CONFIG parsing + inventory
- **api/provision.js lines 288-1834**: 19 mod_* integration modules
- **api/provision.js lines ~2880-3200**: Fullstack deploy (project creation, env vars, deployment)
- **api/provision.js lines ~3416-3500**: Verify + retry deploy logic

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
- **`docs/JTBD_JOURNEYS_AND_SERVICE_BLUEPRINTS.md`** — all **JTBD clusters (J01–J26)** mapped to **journey maps** (A–D), **service blueprints** (SB00–SB08), coverage matrices, **persona ↔ pain ID ↔ outputs ↔ messaging** (§9–13), and a **conversation-sourced policy changelog**. **CSVs:** `docs/PERSONA_JOURNEY_STAGE_TRACE.csv`, `docs/PERSONA_SERVICE_BLUEPRINT_TRACE.csv`, `docs/PERSONA_HOMEPAGE_MESSAGING.csv`.
- **`maturity.html`** — “What ships today” truth deck (live vs partial vs spec); linked from landing nav as **What ships**.
- **`PAIN_POINT_MASTER_MAP.md`** + **`PAIN_POINT_MASTER_MAP.csv`** — exhaustive pain taxonomy + traceability matrix for sales/RevOps.
- **Builder:** `app.html` includes **Expected scope (honest preview)** under build package (V4 R/D/S matrix + tier caveat).
- **Tier truth:** **Foundation now provisions the full 11-module integration set**, matching `api/provision.js` `TIER_MODULES.foundation` and `app.html` `V3_TIERS.foundation.modules`. The previous "zero-cost autopilot" default that skipped paid integrations is now an explicit opt-in mode (`automation_mode='zero_cost'`); the default is `'full'` so every build provisions everything the user's tier allows.
- **Strategy frameworks:** 38 strategy frameworks are now available in `FW_PROMPTS` (core 8 surfaced by default + 30 in the "More strategy frameworks" expandable section of the builder). Scoring uses only the frameworks the user toggled; cross-framework synthesis runs on whatever set was selected.
- **L2 Vercel recovery:** `dynastyParseVercelFailLog` in `app.html` classifies build failures into 6 diagnostic classes (`module_not_found`, `missing_dependency`, `ts_error`, `syntax_error`, `env_var_missing`, `eslint_error`, `unknown`). `module_not_found` auto-deletes orphan imports; `missing_dependency` patches `package.json`. Other classes surface the real error line to the user instead of "log has no parseable Module-not-found orphans".
- **Multi-model pivot review:** All 4 phases (Independent Analysis → Cross-Review → Consensus → Devil's Advocate) now fan out across every available model in parallel (Phase 4 previously ran only DeepSeek-R1). A live stream panel under the pipeline visual shows each model's output as it lands — users see per-model insights in real time instead of waiting for a single end-of-run blob.

## Design System
Always read `DESIGN.md` before making any visual or UI decisions.
All font choices, colors, spacing, form behavior, offer copy, and delivery-truth rules are defined there.
Use `design-system.css` and `site-shell.css` for shared public-page styling before adding new inline styles.
Read `UX_COPY.md` before changing paid-offer, provisioning, checkout, or launched-deliverable copy.
Do not deviate from the operational SaaS design direction without explicit user approval.
In QA mode, flag any code or page copy that promises more than the backend can create, store, activate, or expose through a public URL.
