# Environment names ↔ codebase ↔ tools

This repo reads **`process.env.*`** with **exact** names (case-sensitive). Vercel “shared env vars” only work if the **name in the dashboard equals the name in code** (or you duplicate the value under the canonical name).

Secondary pattern: **`DYNASTY_TOOL_CONFIG`** — one JSON string on Vercel containing nested keys (e.g. `infrastructure.twentyi_general`, `payments.stripe_live`, `comms.emailit`). Many vendor secrets can live there instead of flat envs.

---

## 1. Tools the launcher actually orchestrates (by area)

| Area | External tools / APIs | Typical secret surface |
|------|------------------------|-------------------------|
| **Repo + deploy** | GitHub, Vercel | `GITHUB_TOKEN`, `VERCEL_API_TOKEN`, optional `GITHUB_ORG` |
| **Payments** | Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (or nested under `DYNASTY_TOOL_CONFIG.payments`) |
| **Auth (shipped apps + admin)** | Clerk | `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (or `CLERK_PUBLISHABLE_KEY` in `api/auth.js`) |
| **DB / tenants** | Neon / Postgres | `DATABASE_URL` or `POSTGRES_URL`, `NEON_API_KEY` |
| **Hosting / DNS / email (20i)** | 20i | `TWENTYI_API_KEY` **or** `DYNASTY_TOOL_CONFIG.infrastructure.twentyi_general` (+ `twentyi_oauth` per `api/twentyi.js`) |
| **AI (free-LLM chain + chatbot)** | Anthropic, Google/Gemini, Groq, Cerebras, Moonshot, Z.AI, MiniMax, Fireworks, Hyperbolic, Together, Dashscope/Qwen, NVIDIA/NIM, Baseten | Individual `process.env.*` keys in `api/provision.js` / `api/ai.js` (see §3) |
| **Chatbot FAQ gen** | Anthropic + optional Google in **generated** customer code | `ANTHROPIC_API_KEY`; generated routes reference `GOOGLE_API_KEY` |
| **Email marketing** | Acumbamail | `ACUMBAMAIL_API_KEY` in automations; `ACUMBAMAIL_KEY` in `api/events/_providers.mjs` |
| **Transactional email** | Emailit | `EMAILIT_API_KEY` |
| **SMS** | SMS-iT | `SMSIT_API_KEY` (no underscore between `SMS` and `IT`) |
| **n8n** | n8n Cloud / self-host | `N8N_API_KEY`, `N8N_URL` |
| **Voice / booking stack** | CallScaler, Insighto, Trafft (keys pulled in provision paths) | `CALLSCALER_API_KEY`, `INSIGHTO_API_KEY`; Trafft often via `DYNASTY_TOOL_CONFIG` |
| **SEO / content** | NeuronWriter, WriterZen (config), etc. | `NEURONWRITER_API_KEY`, plus `DYNASTY_TOOL_CONFIG.content.*` |
| **Video / design** | Vadoo, SUPERMACHINE, Fliki, etc. | `VADOO_API_KEY`, `SUPERMACHINE_API_KEY`, `FLIKI_API_KEY` |
| **Social** | Vista Social | `VISTA_SOCIAL_API_KEY` |
| **Analytics / leads** | PostHog, Happierleads, Salespanel | `POSTHOG_API_KEY`, `HAPPIERLEADS_API_KEY`, `SALESPANEL_API_KEY` |
| **CRM / directory** | SuiteDash, Brilliant Directories | `SUITEDASH_*`, `BRILLIANT_API_KEY` |
| **Uptime / misc** | Pulsetic | `PULSETIC_API_KEY` |
| **Scraping / research** | Outscraper, Firecrawl, Exa, Hexomatic | `OUTSCRAPER_API_KEY`, `OUTSCRAPER_API_KEY_2`, `FIRECRAWL_API_KEY`, `EXA_AI_API_KEY`, `HEXOMATIC_API_KEY` |
| **Alerts** | Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| **Observability** | Langfuse | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` |

Anything else in your shared list (AITable, ngrok tunnel keys, unrelated SaaS) is **not wired** under those exact names in `api/` for this product unless you add code or map them into **`DYNASTY_TOOL_CONFIG`**.

---

## 2. Your names → names this repo reads (rename or duplicate value on Vercel)

| Your shared name (examples) | **Canonical name in code** | Notes |
|-----------------------------|-----------------------------|--------|
| `CLERK_AUTH_SECRET_KEY` | **`CLERK_SECRET_KEY`** | Used in `api/admin.js`; generated `.env` templates use `CLERK_SECRET_KEY`. |
| `CLERK_AUTH_PUBLISHABLE_KEY` | **`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`** or **`CLERK_PUBLISHABLE_KEY`** | `api/auth.js` reads `CLERK_PUBLISHABLE_KEY` **or** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. |
| `VERCEL_TOKEN_GITTOKEN` | **`VERCEL_API_TOKEN`** | `api/provision.js` uses `VERCEL_API_TOKEN` (fallback: `DYNASTY_TOOL_CONFIG.infrastructure.vercel`). |
| `STRIPE_SIIGNING_SECRET` (typo) | **`STRIPE_WEBHOOK_SECRET`** | `api/billing/_lib.mjs` and smoke tests expect `STRIPE_WEBHOOK_SECRET`. |
| `STRIPE_API_KEY` | **`STRIPE_SECRET_KEY`** | Server uses **secret** key variable name above, not `STRIPE_API_KEY`. |
| `SMS_IT_API_KEY`, `SMS_IT_API_KEY_1` | **`SMSIT_API_KEY`** | Single name in `api/provision.js`. |
| `INSIGHTO_AI_API_KEY`, `INSIGHTO_AI_1_API_KEY`, … | **`INSIGHTO_API_KEY`** | No `_AI_` infix in provision. |
| `GOOGLE_GEMINI_API_KEY`, `GEMINI_API_KEY_1` | **`GEMINI_API_KEY`** or **`GOOGLE_AI_KEY`** | Free-LLM chain in `api/provision.js` / `api/ai.js`. |
| `HYPERBOLIC_AI_KEY` | **`HYPERBOLIC_API_KEY`** | |
| `EXA_AI_MCP_API_KEY` | **`EXA_AI_API_KEY`** | `api/research.js`. |
| `POSTHOG_PROJECT_TOKEN` | **`POSTHOG_API_KEY`** | `api/telemetry.js` uses `POSTHOG_API_KEY` (+ optional `POSTHOG_HOST`). |
| `VADOO_AI_API_KEY` | **`VADOO_API_KEY`** | `api/provision.js` merge block. |
| `OPEN_AI_API_KEY` | **`OPENAI_API_KEY`** | Automations / catalog files use `OPENAI_API_KEY`. |
| `20I_COM_GENERAL_API_KEY`, `20I_COM_OAUTH_CLIENT_KEY`, … | **`DYNASTY_TOOL_CONFIG`** → `infrastructure.twentyi_general`, `infrastructure.twentyi_oauth` **or** flat **`TWENTYI_API_KEY`** for general | `api/twentyi.js` only reads **JSON** keys; `mod_hosting` in provision also accepts `TWENTYI_API_KEY` as fallback for general. |

If you keep a non-canonical name for your own memory, **also** set the canonical name to the same value (Vercel allows duplicate values across two keys).

---

## 3. Flat env names referenced in `api/` (canonical checklist)

Use this when auditing Vercel. (Not all are required for every deployment.)

**Core / security:** `ADMIN_KEY`, `TEST_ADMIN_KEY`, `PAYMENT_ACCESS_SECRET`, `CORS_ORIGIN`, `DYNASTY_TOOL_CONFIG`, `DYNASTY_ADMIN_TOKEN`, `ADMIN_TOKEN`, `AUTOMATION_ONLY_MODE`, `NODE_ENV`

**Data:** `DATABASE_URL`, `POSTGRES_URL`, `NEON_API_KEY`, `NEON_STORE_ID`

**Stripe / checkout:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`

**Clerk:** `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

**GitHub / Vercel:** `GITHUB_TOKEN`, `GITHUB_ORG`, `VERCEL_API_TOKEN`

**AI / LLM:** `GOOGLE_AI_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `GROQ_API_KEY_2`, `CEREBRAS_API_KEY`, `MOONSHOT_API_KEY`, `ZAI_API_KEY`, `Z_AI_API_KEY`, `MINIMAX_API_KEY`, `FIREWORKS_API_KEY`, `HYPERBOLIC_API_KEY`, `TOGETHER_API_KEY`, `DASHSCOPE_API_KEY`, `QWEN_API_KEY`, `NVIDIA_API_KEY`, `NIM_API_KEY`, `BASETEN_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `PERPLEXITY_API_KEY`, `OLLAMA_URL`, `GITHUB_MODELS_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CHUTES_API_KEY`, `INCEPTION_API_KEY`, `SAMBANOVA_API_KEY`, `OPENAI_TRANSCRIBE_MODEL`, `CLOUDFLARE_ACCOUNT_ID`

**Comms / growth:** `EMAILIT_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ACUMBAMAIL_KEY`, `RESEND_KEY`, `SMSIT_KEY` (`api/events/_providers.mjs` — different from `SMSIT_API_KEY` in provision; align with your wiring)

**Integrations (provision merge):** `CHATBASE_API_KEY`, `VADOO_API_KEY`, `SUPERMACHINE_API_KEY`, `DOCUMENTERO_API_KEY`, `NEURONWRITER_API_KEY`, `VISTA_SOCIAL_API_KEY`, `FLIKI_API_KEY`, `POSTHOG_API_KEY`, `HAPPIERLEADS_API_KEY`, `SALESPANEL_API_KEY`, `SUITEDASH_API_KEY`, `SUITEDASH_PUBLIC_ID`, `SUITEDASH_SECRET_KEY`, `BRILLIANT_API_KEY`, `N8N_API_KEY`, `N8N_URL`, `OUTSCRAPER_API_KEY`, `OUTSCRAPER_API_KEY_2`, `PULSETIC_API_KEY`, `CALLSCALER_API_KEY`, `INSIGHTO_API_KEY`, `SMSIT_API_KEY`, `TWENTYI_API_KEY`

**Research (`api/research.js`):** `FIRECRAWL_API_KEY`, `EXA_AI_API_KEY`, `HEXOMATIC_API_KEY`

**Langfuse:** `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`

**20i / Clerk in generated customer env:** strings embedded in `mod_hosting` / provision output (see `api/provision.js` around generated `.env` text).

**Automations subtree** (if those serverless routes are deployed): additional names such as `ACUMBAMAIL_API_KEY`, `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `NEON_DATABASE_URL`, `FORMS_WEBHOOK_SECRET`, `CRMEVENT_WEBHOOK_SECRET`, `FRONTEND_URL`, `BUSINESS_DOMAIN`, `ADMIN_EMAIL`, `N8N_BASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OWNER_EMAIL`, `CLAIMSMATE_API_KEY`, `GCP_PROJECT_ID`, `GCP_KEY_FILE` — only if you ship those functions.

---

## 4. “Tools I need” short list (minimal honest set)

To run **this** Vercel project’s core flows (build + billing + admin + health):

1. **`GITHUB_TOKEN`** — repo create/push  
2. **`VERCEL_API_TOKEN`** — deploy / project wiring  
3. **`STRIPE_SECRET_KEY`** (+ **`STRIPE_WEBHOOK_SECRET`** for webhooks)  
4. **`DATABASE_URL`** or **`POSTGRES_URL`**  
5. **`ADMIN_KEY`** or **`TEST_ADMIN_KEY`** — builder/admin HMAC paths  
6. **`DYNASTY_TOOL_CONFIG`** **or** the individual flat keys for each module you want live (20i, n8n, email, etc.)

Everything else is **module-specific**: add flat keys **as named above** or nest equivalents inside **`DYNASTY_TOOL_CONFIG`** per existing module code.

---

## 5. Optional: re-scan the repo

Names drift over time. From repo root:

```bash
rg -o "process\.env\.([A-Za-z0-9_]+)" api automations --no-filename | sort -u
```

Compare that output to your Vercel shared group.
