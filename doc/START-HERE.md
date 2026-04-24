# Start here — Your Deputy / Dynasty Launcher (novice path)

Use this page so you never guess what the product promises versus what the code enforces.

**Enforced accuracy:** [`docs/PRODUCT_ACCURACY_SCOPE.md`](../docs/PRODUCT_ACCURACY_SCOPE.md) defines which files are **warranted** as buyer-true. Run `npm run verify:product` in CI or locally; it must pass before you claim repo-wide product truth.

## 1. Read the accountability page first

Open **`/maturity`** (`maturity.html` in this repo). It lists what is live, partial, codegen-only, or planned, and explains the **credential boundary** (your vendor accounts own day‑2 operation).

## 2. Understand integration tiers (source of truth: `api/provision.js`)

Inside `provision_modules`, **`TIER_MODULES`** is the contract:

| Paid build tier   | Slots | What is different in code |
|-------------------|-------|---------------------------|
| Foundation        | **11** | Same allowlist as Professional |
| Professional      | **11** | Same allowlist as Foundation (higher **price / positioning** only) |
| Enterprise        | **13** | Adds **WordPress** + **post-deploy verification** |
| Custom Volume     | **19** | Voice, SMS, CRM, directory, leads, video, etc. |

Nothing here guarantees every vendor API succeeds. Your build receipt is **`BUILD-MANIFEST.json`** plus **`OPERATIONS.md`** / **`MANUAL-ACTIONS.md`** in the shipped repo.

### 2b. Two automation numbers (not a bug)

Both are real; they measure different things:

| Number | What it refers to | Where it shows up |
|--------|-------------------|-------------------|
| **347** | Strategy catalog of **micro-tasks / automatable jobs** in `docs/SERVICE_BUSINESS_AUTOMATION_CATALOG.md` (and UX bible parts) | Planning, personas, positioning |
| **353** | **n8n workflow JSON** export count in `api/automation-catalog.js` / `mod_automation` | Builder + marketplace copy + repo export |

The launcher can ship **strategy depth (347)** and a **workflow library export (353)** in parallel; do not collapse them into one headline without this footnote.

## 3. Match marketing to engineering

- **Vercel env names ↔ code:** [`docs/ENV_TOOLS_AND_NAME_ALIGNMENT.md`](../docs/ENV_TOOLS_AND_NAME_ALIGNMENT.md) — canonical `process.env` strings, `DYNASTY_TOOL_CONFIG`, and which vendor tools the launcher calls.
- **Stripe checkout copy** is defined in `api/checkout.js` (`tiers.*.desc`) and must stay aligned with `TIER_MODULES`.
- **Landing + FAQ:** production paths use **`public/index.html`** (canonical). Root `index.html` should follow the same pricing and tier facts when you change offers — run `npm run verify:product` after edits.
- **Legal terms** live in `terms.html` and `public/terms.html`.

## 4. After you pay

1. Finish the builder flow until you have a **GitHub repo** and **Vercel URL**.  
2. Open **`BUILD-MANIFEST.json`** in the repo — it records skips, defers, and successes.  
3. Follow **`MANUAL-ACTIONS.md`** for anything that needs your sign-in on a vendor dashboard.  
4. If something looks wrong, compare your tier string from checkout to the **`TIER_MODULES`** row above.

## 5. Where the deep specs live

- Operator + AI context: **`CLAUDE.md`**  
- Full V3 build spec: **`DYNASTY_LAUNCHER_V3_FINAL.md`**  
- Product / marketplace model: **`docs/architecture/`** and **`product/`**

When in doubt, trust **`api/provision.js`** and **`/maturity`** over informal shorthand in older slides or tweets.
