# Full Codebase Audit — Your Deputy V3

**Date:** 2026-04-23  
**Scope:** All files in the `dynasty-launcher` repository  
**Methodology:** Automated static analysis via parallel exploration agents, covering security, code quality, performance, SEO, accessibility, and architecture

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Findings](#critical-findings)
3. [High-Severity Findings](#high-severity-findings)
4. [Medium-Severity Findings](#medium-severity-findings)
5. [Low-Severity Findings](#low-severity-findings)
6. [File-by-File Audit Notes](#file-by-file-audit-notes)
7. [Recommendations](#recommendations)

---

## Executive Summary

The codebase consists of **~230+ files** across a static HTML + Vercel serverless architecture. The core application is a **~16,000-line monolith** (`app.html`) with **69 API files** under `api/`, **160 deliverable pages**, **11 persona pages**, and supporting documentation/scripts.

### Overall Health

| Area | Rating | Summary |
|------|--------|---------|
| **Security** | Needs Attention | 3 critical, 8 high findings. Unauthenticated API endpoints, XSS vectors, missing SRI |
| **Code Quality** | Good | Well-structured mod_* pattern, consistent error handling in most paths |
| **Performance** | Needs Attention | 16k-line monolith with no code splitting; SW not registered |
| **SEO** | Good | Strong structured data; some missing OG images and canonical inconsistencies |
| **Accessibility** | Fair | Skip links and focus styles present; gaps in ARIA and keyboard paths |
| **Architecture** | Good | Clear separation of concerns; serverless fits the use case |

### Inventory

| Component | Files | Lines (approx.) |
|-----------|-------|-----------------|
| Root HTML pages | 8 | ~17,930 |
| API (serverless) | 69 | ~15,020 |
| Deliverable pages | 160 | ~12,000 |
| Persona pages (for/) | 11 | ~760 |
| Scripts | 10 | ~3,920 |
| Documentation (MD) | 55 | ~15,000 |
| Automation catalog/templates | 18 | ~2,100 |
| Config files | 8 | ~650 |

---

## Critical Findings

### C1. Missing `getCatalog` import in billing webhook — Runtime Error

**File:** `api/billing/webhook.js` (lines 45-47)  
**Impact:** `expandPackToModules` calls `getCatalog()` which is **never imported**. Any Stripe `checkout.session.completed` event involving a pack/bundle SKU will throw `ReferenceError` at runtime, silently failing the webhook handler.

**Fix:** Add `import { getCatalog } from '../catalog/_lib.mjs'` at the top of the file.

---

### C2. `stripe()` not awaited in storefront deactivation — Broken Stripe Cancel

**File:** `api/storefront/catalog.js` (lines 440-444)  
**Impact:** `const stripeClient = stripe();` assigns a **Promise**, not a Stripe client. All subsequent `stripeClient.subscriptions.del(...)` calls will fail. Module deactivation with active subscriptions is broken.

**Fix:** Change to `const stripeClient = await stripe();`

---

### C3. Unauthenticated LLM proxy `/api/ai-sdk` — Cost Amplification

**File:** `api/ai-sdk.js` (lines 176-224)  
**Impact:** No authentication check. Any client allowed by CORS can POST arbitrary prompts and burn Anthropic/OpenAI/Google/Groq API quota. Contrast: `api/ai.js` enforces free/paid tiers with Stripe verification.

**Fix:** Apply the same auth pattern as `api/ai.js` (admin or paid access token check).

---

## High-Severity Findings

### H1. Unauthenticated Tenant/Event API Endpoints

**Files and impact:**

| Endpoint | File | Risk |
|----------|------|------|
| `create-tenant` | `api/tenants/create-tenant.js` | Open tenant creation + side effects |
| `get-tenant` | `api/tenants/get-tenant.js` | Tenant data + entitlements readable by anyone |
| `provision-automations` | `api/tenants/provision-automations.js` | Automation provisioning without auth |
| `upgrade-module` | `api/tenants/upgrade-module.js` | Module activation; charges skip if Stripe unconfigured |
| `ingest-event` | `api/events/ingest-event.js` | Event injection + dispatcher chain execution |
| `opportunity-cards` | `api/events/opportunity-cards.js` | Upsell data readable |
| `storefront/catalog.js` | All actions (`browse`, `purchase-pack`, etc.) | Purchase/deactivate for any tenant |

**Fix:** Apply `adminOnly` or tenant-scoped auth (API key, Clerk session, or signed token) to all write operations.

---

### H2. Admin Keys in URL Query Strings

**File:** `middleware.js` (lines 86, 109-110)  
**Impact:** `?k=ADMIN_KEY` passes secrets in URLs, exposing them to browser history, Vercel logs, referrer headers, and analytics.

**Fix:** Use POST body or one-time exchange; set `Referrer-Policy: no-referrer` on sensitive pages.

---

### H3. XSS via innerHTML with Untrusted Data

**File:** `app.html` — multiple locations  
**Impact:** Several paths concatenate AI/API-derived strings into `innerHTML` without `escapeHtml()`:

| Function | Lines | Risk |
|----------|-------|------|
| `renderBlueprintPreview` / `renderDesignPreview` | 2131-2184 | Model output embedded raw |
| `showPreflightModal` | 2285-2341 | Server report embedded raw |
| `showPreview` | 6219-6232 | Inference JSON embedded raw |
| `acceptPivot` / `modifyPivot` | 5020-5078 | `currentIdea` raw in HTML |
| `generateBuildReport` | 15653-15676 | Framework analysis + research URLs raw |

**Fix:** Apply `escapeHtml()` consistently to all dynamic content before `innerHTML` assignment.

---

### H4. CDN Scripts Without Subresource Integrity (SRI)

**File:** `app.html` (lines 614-617)  
**Impact:** Clerk JS and WebLLM load from CDNs without `integrity` attributes. A CDN compromise could inject malicious code. Only JSZip has SRI.

**Fix:** Add `integrity` and `crossorigin="anonymous"` to Clerk and WebLLM script tags (or self-host).

---

### H5. PostHog Token + Vendor Secrets in GitHub Push

**File:** `api/provision.js` (lines 1294-1297, 2142-2169)  
**Impact:** `mod_analytics` embeds the PostHog `api_token` in snippet code. `BUILD-REPORT.json` includes full `res.details` for each module. Both are pushed to customer GitHub repos, potentially exposing launcher-owned tokens.

**Fix:** Mask or omit sensitive `details` fields before GitHub push. Use customer's own PostHog key in generated snippets.

---

### H6. Unreachable Session Recovery Code

**File:** `app.html` (lines 1352-1459)  
**Impact:** `?returning=1` triggers `enterBuilder()` then `return`, making the session recovery UI (email code verification) unreachable dead code. The "Already purchased? Sign in" link at line 1517 points to this path.

**Fix:** Move `enterBuilder()` after the recovery UI, or restructure the flow.

---

### H7. `.env` Not in `.gitignore`

**File:** `.gitignore` (2 lines: `node_modules/` and `.vercel`)  
**Impact:** A developer creating `.env` from `.env.example` could accidentally commit secrets. No `.env` file exists today, but the protection is missing.

**Fix:** Add `.env`, `.env.local`, `.env.*.local`, `*.log`, `.DS_Store`, `coverage/`, `dist/` to `.gitignore`.

---

### H8. `n8nUrl` Undefined in Provision n8n Block

**File:** `api/provision.js` (lines 3318, 3327)  
**Impact:** Variable `n8nUrl` is used but never defined in the `provision` action's n8n activation block. Should be `n8nBaseUrl` (defined at line 3318). This causes a `ReferenceError` when n8n workflow activation is attempted.

**Fix:** Replace `n8nUrl` with `n8nBaseUrl` at line 3327.

---

## Medium-Severity Findings

### M1. CORS Origin May Not Match www/Non-www

**File:** `vercel.json` (lines 192-211)  
**Impact:** `Access-Control-Allow-Origin: https://yourdeputy.com` does not match `https://www.yourdeputy.com` or `https://dynasty-launcher.vercel.app`. Browser API calls from those origins will fail CORS.

---

### M2. Service Worker Not Registered

**Files:** `sw.js` exists (68 lines) but no `navigator.serviceWorker.register()` call found in any HTML file.  
**Impact:** The caching strategy is inactive for all users.

---

### M3. Waitlist Rate Limiting Not Wired

**File:** `api/waitlist.js` (lines 4-16)  
**Impact:** `isWaitlistRateLimited` is defined but never called in the handler. Spam/DoS risk on the waitlist endpoint.

---

### M4. Empty Catch Blocks

**File:** `app.html` — at least 15 locations  
**Impact:** Errors swallowed silently in: funnel params (1281), admin key (1308), token validation (1334), recordBuild (2220), loadFlags (2193), compactPhase (2240), orchestrate (2248, 2255, 2268, 2282), and others. Makes debugging production issues difficult.

---

### M5. CSS Class Mismatches in `index.html`

**File:** `index.html`  
**Impact:**
- `.sss` defined in CSS (line 102) but `class="sss"` used in markup (275, 304, 306) — **match is correct** but the class may be unused or the CSS rule incomplete.
- `.stat-grid` in media query (line 132) vs `stats-grid` class in markup (line 273) — **CSS rule won't apply** to the intended element.

---

### M6. `inventory` Endpoint Unauthenticated

**File:** `api/provision.js` (lines 2363-2397)  
**Impact:** Exposes which integrations are configured (booleans), automation catalog size, and modules_enabled without auth. Useful for attacker reconnaissance.

---

### M7. Mixed Module Systems

**Files:** `api/ai.js` (line 719), `api/neon.js` (line 38)  
**Impact:** `require("crypto")` inside ESM files. Works in Node.js but is inconsistent and can cause issues with bundlers or future ESM-only runtimes.

---

### M8. Connection Pool Churn

**Files:** `api/waitlist.js` (127-128), `api/memory.js` (10-19)  
**Impact:** New `pg.Pool` created per request, then `pool.end()` in `finally`. High connection churn to the database. Use a module-level singleton pool.

---

### M9. Unreachable Middleware Code

**File:** `middleware.js` (lines 169-206)  
**Impact:** The "No valid access" pricing gate HTML is unreachable — `/app` returns at line 165-166 and `/admin` returns inside 82-103. Dead code.

---

### M10. `validate.js` Unauthenticated with 2MB Limit

**File:** `api/validate.js` (lines 116-120)  
**Impact:** Accepts up to 2MB JSON with 50 files, runs regex validation — no auth. CPU abuse vector.

---

### M11. Acumbamail Token in Query String

**File:** `api/waitlist.js` (line 48)  
**Impact:** `auth_token` passed as URL query parameter — exposed in proxy logs and vendor-side referrer headers.

---

### M12. g8 Re-adds Dependencies Gate Removed

**File:** `app.html`  
**Impact:** Pre-push validation (10324-10358) strips test tooling from `package.json`. g8_tests (11378-11393) re-adds `vitest`, `@playwright/test`, `tsx` and test scripts afterward. No second validation pass after g8, so shipped `package.json` can include removed dependencies.

---

## Low-Severity Findings

### L1. Missing `og:image` / `twitter:image`

**Files:** `index.html`, `app.html`, most deliverable/persona pages  
**Impact:** `twitter:card: summary_large_image` set without an image — social previews will be weak.

---

### L2. Canonical Host Inconsistency

**Impact:** Root pages use `https://yourdeputy.com`; public/ automation pages use `https://www.yourdeputy.com`. Sitemap uses non-www. Middleware redirects non-www to www. Split crawl signals.

---

### L3. Stale Sitemap `lastmod`

**File:** `sitemap.xml`  
**Impact:** Most dates are `2026-04-13`, one is `2026-04-20`. Does not cover marketplace or automation landing pages under `public/`.

---

### L4. Dead Code / Unused Variables

| Item | File | Lines |
|------|------|-------|
| `const FT` / `const FU` (unused hex + URL) | `app.html` | 1531-1533 |
| `scrapeCompetitor` always returns `null` | `api/research.js` | 146-152 |
| `PHASE_TIER_OVERRIDES` never used by `routeModel` | `api/orchestrate.js` | 72-80 |
| `isWaitlistRateLimited` defined, never called | `api/waitlist.js` | 4-16 |
| Unreachable session recovery block | `app.html` | 1372-1459 |
| `claude.js` is a 410 stub | `api/claude.js` | 13-16 |
| Duplicate gradient dividers | `index.html` | 338-340 |

---

### L5. Accessibility Gaps

| Issue | File | Location |
|-------|------|----------|
| FAQ keyboard handler doesn't update `aria-expanded` | `index.html` | line 341 |
| `closeNav()` doesn't reset `aria-expanded` on hamburger | `index.html` | line 347 |
| Strategy preview toggles: no keyboard path, no `aria-expanded` | `app.html` | 15347+ |
| Build history/comparison modals: no focus trap, no Escape | `app.html` | 15475-15517 |
| Agency table missing `<caption>` and `scope` on `th` | `for/agencies.html` | 111-119 |
| `--dim` (#8A8A8A) on dark: possible contrast failure | `index.html` | multiple |

---

### L6. Telemetry Anonymous ID Churn

**File:** `api/telemetry.js` (line 38)  
**Impact:** `anon_${Date.now()}` creates a new identity per event when `distinct_id` is missing, breaking funnel analytics.

---

### L7. `evalGuard` Defaults to `true` on Unrecognized Expressions

**File:** `api/events/_dispatcher.mjs` (lines 127-128)  
**Impact:** Typos in workflow guard expressions will pass instead of fail-safe, running steps that should be skipped.

---

### L8. Health Endpoint Non-Timing-Safe Compare

**File:** `api/health.js` (line 13)  
**Impact:** Admin key comparison uses `!==` instead of `timingSafeEqual`. Low practical risk for a health endpoint.

---

### L9. Documentation Count Mismatches

| Source | States |
|--------|--------|
| `generate-pages.mjs` header | "426" / "353" automations |
| `api/automation-catalog.js` | "347" automations |
| `automations/MASTER_INDEX.md` | "347" automations |
| `automations/MANIFEST.md` | "5 categories" (subset) |
| Deliverable hub | "120+" total deliverables |
| Backend item page CTA | "149 more" deliverables |

---

### L10. `app.html` Monolith Size

**Impact:** ~16,000 lines of inline JS/CSS in a single HTML file. No code splitting, lazy loading, or route-level chunking. Parse/compile cost on first load is significant. Consider extracting to bundled modules for production.

---

## File-by-File Audit Notes

### Root HTML

| File | Lines | Issues |
|------|-------|--------|
| `index.html` | 373 | CSS class mismatch (M5), missing OG image (L1), FAQ a11y (L5), duplicate divider (L4) |
| `app.html` | 16,004 | XSS vectors (H3), dead code (L4/H6), monolith (L10), g8 conflict (M12) |
| `admin.html` | 478 | `noindex` (correct), admin-gated |
| `quiz.html` | 308 | Minor: no `robots` meta, innerHTML from fixed logic |
| `maturity.html` | 138 | Missing `twitter:card`, minimal OG |
| `deliverables.html` | 384 | Missing OG image, no JSON-LD |
| `privacy.html` | 111 | Standard |
| `terms.html` | 134 | Standard |

### API Files (Key Issues Only)

| File | Lines | Key Issues |
|------|-------|------------|
| `provision.js` | 3,715 | Secret push to repos (H5), n8nUrl bug (H8), unauthenticated inventory (M6) |
| `ai.js` | 1,025 | GET models exposes key availability, transcription dead feature |
| `ai-sdk.js` | 224 | **No auth** (C3), empty catch blocks |
| `automation-catalog.js` | 1,274 | CommonJS library, predictable webhook paths |
| `checkout.js` | 295 | Recovery code may return wrong session for multi-checkout emails |
| `auth.js` | 126 | OPTIONS 200 vs 204 inconsistency |
| `waitlist.js` | 146 | Rate limit not wired (M3), token in URL (M11), pool churn (M8) |
| `billing/webhook.js` | 161 | **Missing import** (C1) |
| `storefront/catalog.js` | 577 | **Broken await** (C2), no auth (H1) |
| `tenants/*.js` | ~1,900 | No auth on create/get/provision/upgrade (H1) |
| `events/*.js` | ~1,100 | No auth on ingest/cards (H1), guard defaults true (L7) |

### Configuration

| File | Lines | Issues |
|------|-------|--------|
| `middleware.js` | 207 | Admin key in URL (H2), unreachable code (M9) |
| `vercel.json` | 257 | CORS origin mismatch (M1) |
| `.gitignore` | 2 | Missing `.env` (H7) |
| `sw.js` | 68 | Not registered (M2) |
| `manifest.json` | 21 | Data URL icon — no maskable |
| `sitemap.xml` | 181 | Stale lastmod (L3) |

---

## Recommendations

### Immediate (Security)

1. **Fix C1/C2/C3** — Runtime bugs and unauthenticated LLM proxy
2. **Add auth to tenant/event/storefront endpoints** (H1) — At minimum, require API keys or admin tokens
3. **Move admin keys out of URL query strings** (H2) — Use POST bodies or cookie-based exchange
4. **Apply `escapeHtml()` to all `innerHTML` paths** (H3) — Audit every `innerHTML` assignment in `app.html`
5. **Add `.env` to `.gitignore`** (H7)
6. **Add SRI to CDN script tags** (H4)

### Short-term (Quality)

7. **Fix `n8nUrl` → `n8nBaseUrl`** (H8)
8. **Wire waitlist rate limiter** (M3)
9. **Register service worker** or remove `sw.js` (M2)
10. **Align CORS origin with www/non-www policy** (M1)
11. **Use singleton connection pools** in waitlist/memory (M8)
12. **Remove dead code** (L4) — `FT`/`FU`, `scrapeCompetitor`, `claude.js`, duplicate dividers

### Medium-term (Performance & SEO)

13. **Add `og:image` to key pages** (L1)
14. **Standardize canonical host** across all pages and sitemap (L2)
15. **Update sitemap** with missing URLs and fresh `lastmod` (L3)
16. **Consider extracting `app.html` JS** into bundled modules (L10)
17. **Add second validation pass after g8** to prevent re-added dependencies (M12)

### Long-term (Architecture)

18. **Migrate `app.html` to a framework** (Next.js/Vite) for code splitting, route-level loading, and maintainability
19. **Implement structured logging** with request IDs across all API files
20. **Add automated security scanning** (npm audit, Dependabot, SAST) in CI
21. **Create a `404.html`** branded error page

---

*This audit was generated by automated static analysis. Manual testing, dynamic security scanning (DAST), and load testing are recommended as follow-up steps.*
