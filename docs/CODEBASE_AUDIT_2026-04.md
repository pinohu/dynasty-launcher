# Codebase Audit — Dynasty Launcher / Your Deputy

**Audit date:** 2026-04-23
**Branch reviewed:** `main` (HEAD `6ff6a3f`)
**Scope:** Full repository — serverless API, edge middleware, static HTML
monoliths, build/deploy config, scripts, docs.

This audit is a **read-only review**. No code was modified during the audit
itself; it documents findings and recommendations. Apply fixes in follow-up
PRs.

---

## 1. Repo shape

| Surface | Lines / files | Notes |
|---|---|---|
| `api/*.js` (HTTP handlers) | 24 files, ~10.1K LOC | Plus 2 nested groups: `api/admin/`, `api/automations/`, `api/billing/`, `api/catalog/`, `api/events/`, `api/health/`, `api/storefront/`, `api/tenants/`. |
| `api/**/*.mjs` (shared libs) | 17 files, ~2.5K LOC | Stores, providers, dispatcher, Stripe wrapper, etc. |
| `app.html` (builder) | ~14 340 lines, 980 KB | Monolith. **Mirrored** at `public/app.html` (912 KB) — diverged. |
| `index.html` (landing) | ~370 lines, 78 KB | Mirrored at `public/index.html` (72 KB) — diverged. |
| `middleware.js` | 207 lines | Edge gate for `/app` and `/admin`. |
| `sw.js` | 68 lines | Service worker. |
| `scripts/` | 13 mjs/sh + 2 SQL migrations | Smoke tests, page generation, n8n import. |
| `templates/`, `product/`, `automations/` | Many JSON | Catalog + workflow templates. |

**Test coverage signal:** smoke tests live in `scripts/smoke-*.mjs`
(`catalog`, `tenants`, `activation`, `events`, `workflows`, `billing`).
There is no unit test framework configured (Vitest declared in user rules
but not installed). `npm run test` chains all smoke tests; relies on
in-memory store fallback.

---

## 2. Highest-priority findings

### 2.1  Static HTML duplication (`/` vs `/public`)  ★ High

`app.html`, `index.html`, `admin.html`, `marketplace.html`, `maturity.html`,
etc. all exist **twice** — once at the repo root and once under `public/`.
Sizes differ (e.g. root `app.html` 980 KB vs `public/app.html` 912 KB), so
the two copies are **not in sync**. Vercel will serve the root copy because
of `cleanUrls: true` and no explicit `public` rewrite, but search engines
and crawlers can hit either.

- Risk: bug fixes or copy edits applied to one copy silently regress on the
  other. Fingerprinted by the `mirror for/ directory into public/for/`
  commit history — this drift has bitten before.
- Recommendation: pick one canonical location (probably root, given current
  Vercel routing) and make the other a build-time copy or symlink. Add a
  pre-commit hook (or a CI assertion) that fails when the two diverge.

### 2.2  Service worker can serve a stale `/app` after a fix ships  ★ High

`sw.js` (`'deputy-v5'`) caches every successful HTML navigation via
`cache.put(event.request, copy)`. For `/app` and `/admin` it tries network
first and falls back to cache — which is correct — but for **any other**
HTML navigation (`/`, `/marketplace`, `/dashboard`, `/observability`, …) it
caches indefinitely (no `Cache-Control` honoring, no version check beyond
the cache-name bump).

- Recommendation: keep the network-first path for HTML navigations but
  expire entries beyond the latest deploy by either (a) using
  `clients.claim()` + `skipWaiting()` in tandem with a hash-based cache
  name set at build time, or (b) excluding all HTML from cache and only
  caching static assets. The current pattern requires a manual cache-name
  bump in every deploy that fixes a landing-page bug.

### 2.3  CSP allows old paid-AI hosts that the runtime no longer uses  ★ Medium

`vercel.json` `Content-Security-Policy` `connect-src` still lists
`https://api.anthropic.com`, `https://api.deepseek.com`,
`https://api.mistral.ai`. The repo root README, `api/claude.js`, and
`api/ai.js` all explicitly state Anthropic/DeepSeek/paid Mistral routing was
**purged** to enforce zero inference cost.

- Risk: the CSP no longer matches the threat model (any successful XSS
  could exfiltrate to those hosts), and it advertises providers that the
  product cannot actually call.
- Recommendation: tighten `connect-src` to the providers `api/ai.js`
  actually targets (Google AI Studio, Groq, OpenRouter, Cerebras,
  SambaNova, Moonshot, Z.AI bigmodel, MiniMax, Fireworks, Hyperbolic,
  Together, Perplexity, DashScope, Nvidia integrate, Baseten, GitHub
  Models, Cloudflare, Chutes, Inception). Same applies to the
  `/api/(.*)` block.

### 2.4  CSP `script-src` keeps `'unsafe-inline'`  ★ Medium

`script-src 'self' 'unsafe-inline' …` neutralizes most of the CSP's value
because inline scripts in `app.html`/`index.html`/`middleware.js`-issued
HTML are pervasive. Removing inline scripts from a 14k-line monolith is a
large refactor, but in the meantime adding **nonces** (Vercel can inject
them on edge responses) eliminates the global allow.

- Recommendation: short-term, leave `'unsafe-inline'` for HTML pages but
  remove it from the `/api/(.*)` block (no API responses should ever
  execute inline JS). Long-term, attach a per-response nonce in
  `middleware.js` and rewrite inline `<script>` tags to use it.

### 2.5  `api/automations/handler.js` accepts `tenant_id` from query/Bearer with **no signature** ★ High

```67:53:api/automations/handler.js
function extractTenantId(req) {
  if (req.query?.tenant_id) return req.query.tenant_id;
  const auth = req.headers?.authorization || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    return token;
  }
  return null;
}
```

The "Bearer token" is just the literal `tenant_id` string. There is no
HMAC verification, no JWT validation, no per-tenant secret. Anyone who
guesses or learns a tenant_id (or finds one in a public log line) can
list, activate, deactivate, and trigger that tenant's automations — and
pull every row from `automation_runs`.

- Same pattern in `api/automations/webhook.js` for inbound webhooks
  (Stripe is signature-verified; CallScaler/Trafft fall back to "stub
  mode" if `*_WEBHOOK_SECRET` starts with `STUB`, accepting **any**
  payload).
- Recommendation: introduce a per-tenant API token (HMAC-signed similarly
  to the existing paid-access tokens in `api/checkout.js`) and require it
  as `Authorization: Bearer <token>` on every `/api/automations/*` call.
  For webhooks, treat missing/STUB secrets as **deny** (currently the
  function allows the request through with `return true`).

### 2.6  Admin gate inconsistency  ★ High

There are **three** different admin auth checks:

| File | Mechanism | Notes |
|---|---|---|
| `api/auth.js` | HMAC token issued from `ADMIN_KEY`/`TEST_ADMIN_KEY`, with `timingSafeEqual` and rate-limit | Reference implementation. |
| `api/admin.js`, `api/github.js`, `api/twentyi.js`, `api/research.js`, `api/memory.js`, `api/orchestrate.js`, `api/provision.js` | Reuse the HMAC token via `verifyAdmin()` or inline duplicates. | Duplication; small surface for drift. |
| `api/billing/catalog-sync.js`, `api/admin/test-fire-event.js`, `api/admin/metrics.js` | **Plain string compare** of `x-admin-key` to `ADMIN_KEY || TEST_ADMIN_KEY`. | No `timingSafeEqual` ⇒ vulnerable to length-distinguishing timing attacks. Also accepts the *raw* key over the wire instead of a short-lived HMAC, expanding the blast radius if logs leak. |
| `api/neon.js` | `process.env.DYNASTY_ADMIN_TOKEN || ADMIN_TOKEN` (different env vars) | Yet another secret name. The header `x-dynasty-admin-token` is also distinct from the rest of the codebase. |
| `api/health.js` | Simple `adminKey !== ADMIN || TEST_ADMIN_KEY` check, no constant-time | Same as above. |

- Recommendation: extract one `verifyAdmin(req)` helper into
  `api/_auth.js` and have every admin endpoint import it. Always use
  HMAC-signed short-lived tokens; never accept the raw key over HTTP.

### 2.7  `api/ai.js` `reset_quota` admin check is partly broken  ★ Medium

```719:721:api/ai.js
    if (!k || (!adminKey && !testAdminKey) || ((() => { try { const { timingSafeEqual } = require("crypto"); const a = Buffer.from(String(k || "")); const b = Buffer.from(String(adminKey || "")); return a.length !== b.length || !timingSafeEqual(a, b); } catch { return true; } })() && k !== testAdminKey)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
```

Two problems:

1. **`require('crypto')` in an ES-module file** (`type: module` in
   `package.json`). On Vercel the line throws synchronously, the inner
   `try/catch` swallows it, the IIFE returns `true`, and execution falls
   through to `&& k !== testAdminKey`. So in practice the endpoint is
   gated **only** by `TEST_ADMIN_KEY` — the production `ADMIN_KEY` cannot
   reset quota via this path.
2. The fallback to `k !== testAdminKey` uses plain `!==`, not
   constant-time, on the raw key string.
- Recommendation: replace with `await isValidAdminToken(token)` (already
  defined in this file) to require the HMAC token, and remove the
  CommonJS `require`.

### 2.8  Same `require('crypto')` bug in `api/neon.js`  ★ Medium

```39:39:api/neon.js
    if ((() => { try { const { timingSafeEqual } = require("crypto"); ... } catch { return true; } })()) return res.status(401).json({ ok: false, error: 'Unauthorized' });
```

Same root cause. In ESM this swallows the import error and returns
`true`, denying *every* request even when the supplied token is valid.
Net result: `create_project` and `set_vercel_db` are unusable — the
endpoint always 401s. (Tested by reading the code path; reproduce by
calling the endpoint with a valid `x-dynasty-admin-token`.)
- Recommendation: change to `import { timingSafeEqual } from 'node:crypto'`
  at module top, and use it directly.

### 2.9  CSP origin gate trusts the CORS origin only via an env var  ★ Low

Every API handler does `process.env.CORS_ORIGIN || 'https://yourdeputy.com'`.
If `CORS_ORIGIN` is ever set to a wildcard or to a less-restrictive value
(e.g. an attacker-influenced preview URL during local debugging) every
endpoint silently relaxes. There is no allow-list.
- Recommendation: validate `CORS_ORIGIN` at module load against an explicit
  allow-list (`['https://yourdeputy.com', 'https://www.yourdeputy.com',
  'https://dynasty-launcher.vercel.app']`) and refuse to start otherwise.

### 2.10  Edge middleware HTML responses use `style-src 'unsafe-inline'`  ★ Low

`SEC_HEADERS` in `middleware.js` ships
`Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; …`.
`script-src 'unsafe-inline'` is required because every gate page embeds a
small inline `<script>` (test-login, admin gate, plan→checkout redirect).
- Recommendation: same as 2.4 — generate a per-response nonce and remove
  `'unsafe-inline'` from `script-src`. The pages are short enough that
  this is a 1-2 line patch each.

---

## 3. Architecture / drift findings

### 3.1  CLAUDE.md describes 17 modules; `api/provision.js` ships 19  ★ Cosmetic

`CLAUDE.md` says "17 integration modules in provision.js" and lists them.
The file actually exports 19 `mod_*` functions per its own header, and the
`automation` & `verify` modules are also wired into the orchestrator.
Update the doc when a module list changes.

### 3.2  `api/billing/webhook.js` calls undefined `getCatalog()` ★ High (functional bug)

```45:53:api/billing/webhook.js
function expandPackToModules(sku_code) {
  try {
    const catalog = getCatalog();
    ...
  } catch { return []; }
}
```

`getCatalog` is never imported in this file. The `try/catch` silently
swallows the `ReferenceError`, so **every pack/bundle SKU resolves to zero
constituent modules** and no entitlements are granted. This is the
production code path that translates a Stripe `checkout.session.completed`
event into `entitlements` rows.
- Recommendation: add
  `import { getCatalog } from '../catalog/_lib.mjs';` at the top, and add
  a smoke test that exercises a `pack` SKU through the webhook.

### 3.3  `api/storefront/catalog.js` imports the `stripe` SDK that is not in `package.json`  ★ High (functional bug)

```62:67:api/storefront/catalog.js
    const Stripe = (await import('stripe')).default;
    _stripe = new Stripe(key);
```

`package.json` does **not** declare `stripe`. The dynamic import will
throw `ERR_MODULE_NOT_FOUND` on Vercel and `_stripe` will be set to `null`,
silently disabling Stripe-backed flows. Same for
`api/tenants/upgrade-module.js`. The rest of the project speaks to
Stripe's REST API directly via fetch (`api/checkout.js`,
`api/billing/_stripe.mjs`).
- Recommendation: either add `"stripe": "^17.x"` to `dependencies`, or
  refactor those two files to use the existing `api/billing/_stripe.mjs`
  fetch wrapper. The latter keeps the lambda cold-start light.

### 3.4  `api/ai-sdk.js` `resolveProvider` looks for `OPENAI_API_KEY` even though the project is "free-only"  ★ Low

`api/ai.js` purged paid Anthropic/OpenAI routing, but `api/ai-sdk.js`
(used by `pivot-graph` and the new typed-output flow) still happily picks
up `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` if they are set. That is a
deliberate design (it is the modern wrapper) but the rest of the docs
imply zero cost. Document this contradiction or gate it behind a feature
flag.

### 3.5  Two parallel "smart router" maps disagree  ★ Low

- `api/ai.js` `TASK_FALLBACKS` (general, code, reasoning, long_context, web_current, vision, structured, creative).
- `api/orchestrate.js` `ROUTING_TIERS` (architect, standard, fast, code, reasoning, web_current).

They overlap conceptually but do not share a source of truth. Adding a
new free provider requires editing 4-5 places (`api/ai.js`,
`api/orchestrate.js`, `api/provision.js#freeLLM`, `api/ai-sdk.js`).
- Recommendation: extract one provider registry (`api/_models.js`) that
  exports model id → `{provider, capabilities[]}` and have the routers
  consume it. The current state is the source of #2.3 and #3.4.

### 3.6  `api/checkout.js` allows blueprint credit math that can underflow  ★ Low

```115:116:api/checkout.js
    const blueprintCreditCents = wantsBlueprintCredit ? Math.min(29700, Math.max(0, tierDef.amount - 5000)) : 0;
    const finalAmount = Math.max(5000, tierDef.amount - blueprintCreditCents);
```

The `Math.max(5000, …)` floor means a customer with the credit applied
still pays a $50 minimum, which is correct as a guard, but the credit
amount is *not* clamped against what the customer actually has on
account — it simply assumes the credit is available. Any caller can pass
`apply_blueprint_credit: true` and receive the discount without proof of a
prior `blueprint` purchase. This is a revenue leak.
- Recommendation: verify a prior `blueprint` Stripe checkout exists for
  the supplied email/user before applying the credit.

### 3.7  `api/orchestrate.js` `routeModel` defaults `provider` to `'anthropic'`  ★ Cosmetic

```341:342:api/orchestrate.js
    const model = routeModel(phase_id || 'standard', provider || 'anthropic', override);
```

`'anthropic'` is no longer a key in `ROUTING_TIERS` (it was purged), so
the default falls to `tierModels.fallback`. Working as intended, but the
literal string is misleading bait when reading the file.

---

## 4. Reliability / operational findings

### 4.1  In-memory rate limit `Map`s share a serverless cold-start lifetime ★ Medium

`api/auth.js`, `api/checkout.js`, `api/waitlist.js` all keep their rate
limit counters in module-level `Map`s. On Vercel each lambda instance has
its own memory, so an attacker who reaches multiple instances effectively
multiplies the limit. The "limit" is therefore best-effort, not enforced.
- Recommendation: store rate-limit counters in Postgres (the
  `dynasty_ai_quota_usage` table already exists) or in Vercel KV / Upstash
  Redis. The current design only deters casual abuse.

### 4.2  Pool leak risk in `api/memory.js`  ★ Low

```20:97:api/memory.js
async function getPool() {
  const connStr = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connStr) return null;
  try { const { Pool } = await import('pg'); return new Pool(...); }
}
```

A new `Pool` is created **per request** and `pool.end()` is only called in
the `finally` block when an action ran. Idempotent for short tests, but
under sustained load the connection count grows until Postgres rejects
new connections. The same idiom is used in `api/admin.js` (Pool created
in handler, ended in scope) and `api/provision.js getPool()`.
- Recommendation: cache the pool on `globalThis.__dynastyMemoryPool`
  (the pattern already in `api/ai.js` `getUsagePool`) so each lambda
  reuses one pool across invocations.

### 4.3  `api/provision.js` writes a `BUILD-REPORT.json` containing module results  ★ Low

The report includes `details` per module which can include things like
`embed_script`, `posthog_snippet`, etc. — these are not credentials, but
the same code path also stores `CREDENTIALS.md` (which is correctly
**not** pushed to GitHub). Audit periodically that no module accidentally
writes a long-lived secret into `details`. Today the suppress list is
implicit: `// CREDENTIALS.md contains sensitive data — do NOT push to repo`.
- Recommendation: define an explicit allow-list of fields that may be
  serialized into BUILD-REPORT.json, instead of dumping `details` whole.

### 4.4  `api/provision.js` Telegram alerts include raw error strings  ★ Low

`failedMods.join('\n')` is sent verbatim to Telegram. `sanitizeError`
exists in this file but is not applied to the alert text — only the regex
sanitiser in `api/admin.js` (`safeErr`) does the `sk_live_***` /
`postgres://***` substitution. A failing Stripe call could leak the API
key into the operator Telegram channel.
- Recommendation: pass every alert string through a shared
  `sanitizeError`.

### 4.5  Service worker precache failure is silent  ★ Low

```9:11:sw.js
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).catch(() => {})
```

If `/privacy`, `/terms`, or `/quiz` 404 (rename, deploy mismatch), the
install completes silently. Either drop the `.catch` (so install fails
loudly and the new SW is rejected) or remove the precache list — the
benefit is small.

---

## 5. Code-quality findings

### 5.1  Duplicate auth blocks across handlers  ★ Medium

`api/github.js`, `api/twentyi.js`, `api/research.js`, `api/memory.js`,
`api/orchestrate.js`, `api/provision.js` (admin gate) all paste the same
~40-line "verify HMAC token from `x-dynasty-admin-token` or paid token in
body/header" block. Three different bugs in those copies could already
exist and be invisible. Hoist into one helper.

### 5.2  `api/provision.js` is a 3 715-line monolith  ★ Medium

19 `mod_*` functions, the orchestrator, the freeLLM fallback chain, the
`generateOperationsMd`/`generateCredentialsMd` writers, the deploy logic,
and the verify-and-retry loop all live in one file. The CLAUDE.md "Key
Files to Edit" section maps line ranges (e.g. "lines ~2880-3200") which
itself is a smell.
- Recommendation: split each `mod_*` function into its own file under
  `api/provision/modules/` and let `api/provision.js` import them.
  Same for `freeLLM`, `pushFile`, `verifyAndReconcile`.

### 5.3  `app.html` / `public/app.html` are 14k+ line monoliths  ★ Medium

Performance: every visit ships ~900 KB of HTML/JS even before any AI
work happens. Maintenance: the file is large enough that the workspace
rule pins specific line ranges (4900-5100, 9200-9500, 10000-10350,
12700-12900), which means the rules also need to change every time
unrelated edits shift line numbers.
- Recommendation: extract the AI generation pipeline (the bulk of the
  weight) into a TypeScript module, served from `/static/builder.js`
  with caching. Keep `app.html` as a thin shell.

### 5.4  Mixed semicolons / quoting style ★ Cosmetic

`biome.json` enforces single quotes + semicolons + trailing commas, but
some files (e.g. `api/telemetry.js`) drop semicolons. `npm run lint`
should be run in CI; today there is no CI workflow file under
`.github/workflows/`.

### 5.5  `index.html` lazy-loads Google Fonts via `media="print"` swap  ★ Low

This pattern works but blocks layout shifts on slower networks for ~150ms.
Consider self-hosting the two used font subsets.

### 5.6  `vercel.json` declares `maxDuration` per file but several handlers also `export const maxDuration`  ★ Cosmetic

When both are set the per-file value in `vercel.json` wins for the deploy.
Decide on one source of truth to avoid drift (e.g. drop the per-file
exports for handlers that already have a `vercel.json` entry).

---

## 6. Documentation drift

### 6.1  `CLAUDE.md` claims `mod_chatbot` requires Anthropic Claude  ★ Cosmetic

```
chatbot: !!(process.env.ANTHROPIC_API_KEY),
```
Inventory still gates the chatbot module on `ANTHROPIC_API_KEY`. With
Claude routing removed, that flag will always be false in practice, so
the `inventory` endpoint reports the chatbot module as unavailable even
when the actual provisioning relies on `freeLLM` (free providers only).
- Recommendation: gate on `freeLLM` provider availability instead.

### 6.2  `DYNASTY_LAUNCHER_V3_FINAL.md` references prod IDs in plain text  ★ Low

`Product ID: prod_XXX`, `Webhook secret: whsec_XXX` are placeholders, but
several lines reference real Vercel team and project IDs. Fine for
internal docs, but treat that file as **not for public publication**.

### 6.3  README has no quickstart for local dev  ★ Cosmetic

`README.md` is short and aspirational. Add a 5-line "how to run smoke
tests locally" block (`POSTGRES_URL=stub npm run test`).

---

## 7. Summary by severity

| Severity | Count | Findings |
|---|---|---|
| **High** (functional break or auth weakness) | 5 | 2.1, 2.5, 2.6, 3.2, 3.3 |
| **High** (tampered admin path / broken admin) | 2 | 2.7, 2.8 |
| **Medium** | 8 | 2.2, 2.3, 2.4, 2.10 (a/b shared), 3.1, 3.5, 4.1, 5.1, 5.2, 5.3 |
| **Low / cosmetic** | many | the rest |

The most urgent fixes are the four functional bugs (2.7, 2.8, 3.2, 3.3)
and the unauthenticated `/api/automations/*` surface (2.5). Static-HTML
duplication (2.1) is the maintenance landmine most likely to bite next.

---

## 8. Suggested fix order

1. **Functional bugs (today):**
   - `api/billing/webhook.js`: import `getCatalog` (3.2).
   - `api/storefront/catalog.js` & `api/tenants/upgrade-module.js`: drop
     the `await import('stripe')` and use the existing fetch wrapper, or
     declare `stripe` in `package.json` (3.3).
   - `api/ai.js#reset_quota`: replace the inline `require('crypto')` IIFE
     with `await isValidAdminToken(token)` (2.7).
   - `api/neon.js`: top-level `import { timingSafeEqual } from 'node:crypto';`
     and use it directly (2.8).
2. **Auth hardening:**
   - Hoist `verifyAdmin` into `api/_auth.js` and migrate every endpoint
     (2.6).
   - Add HMAC tenant token to `/api/automations/*` (2.5).
   - Treat missing webhook signing secrets as **deny**, not "stub allow"
     (2.5 second half).
3. **Static drift:**
   - Resolve the root vs `public/` HTML duplication (2.1).
4. **CSP cleanup:**
   - Drop unused paid-AI hosts from `connect-src` (2.3); add nonces and
     remove `'unsafe-inline'` from API responses (2.4 / 2.10).
5. **Reliability:**
   - Move rate-limit Maps to Postgres / KV (4.1).
   - Cache Postgres `Pool` instances on `globalThis` (4.2).
6. **Refactor:**
   - Split `api/provision.js` into per-module files (5.2).
   - Extract `app.html`'s pipeline into a TS module (5.3).
   - Single provider registry consumed by all routers (3.5).

---

**Methodology.** This audit read the full file tree, walked every file
under `api/`, examined `middleware.js`, `vercel.json`, `sw.js`,
`package.json`, `.env.example`, the static HTML monoliths, and a sampling
of `templates/`, `product/`, `scripts/`. No live HTTP probes were issued
against the deployed environment.
