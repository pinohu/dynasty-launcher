# Product accuracy — what “yes” means in this repo

This document defines **verifiable commitments**: the subset of repository content that is treated as a **binding description of what the product does today**, aligned with the implementation.

## Warranted surfaces (must match code)

When `npm run verify:product` passes on `main`, the following are **accurate relative to the cited source of truth**:

| Surface | Role |
|--------|------|
| `api/provision.js` → `TIER_MODULES` | **Authoritative** integration allowlist per tier |
| `api/checkout.js` → `tiers.*.desc` | Stripe-facing tier descriptions; must stay aligned with `TIER_MODULES` |
| `api/automation-catalog.js` → `ALL_AUTOMATIONS`, `CATEGORIES` | **353** n8n workflow records across **45** category constants |
| `maturity.html` and `public/maturity.html` (byte-identical) | Customer accountability deck for live / partial / planned |
| `README.md` (tier bullets + module table) | High-level map to orchestrator modules |
| `manifest.json` | PWA short description (tier + 353 vs 347 framing) |
| `doc/START-HERE.md` | Novice routing into the same sources of truth |
| `public/**/*.html` plus selected root HTML (`terms.html`, `marketplace.html`, `maturity.html`, `index.html`) | No re-banned absolute automation claims (see verifier) |
| **`public/index.html`** (canonical homepage for production paths / `www`) | Tier and pricing copy on the live site; keep **root `index.html`** aligned when you change offers (hashes may differ briefly — prefer editing **`public/index.html` first**, then port to root if you still ship both) |
| `generate-landing-pages.cjs` | Generated footers must stay aligned with warranted footer language |

The verifier (`scripts/verify-product-alignment.mjs`) encodes these checks so drift breaks CI.

## Not warranted as runtime specs (examples, strategy, inventory)

Content here may use **future voice**, **marketing compression**, or **illustrative** examples. It is **not** covered by `verify:product` unless explicitly promoted into the table above:

- `docs/strategy/**`, `deliverables/**`, `product/**` (except cross-links that duplicate warranted numbers)
- Generated or hand-maintained **deliverable playbooks** under `deliverables/`
- Comments in application code except `TIER_MODULES` and checkout tier blocks
- Third-party or historical docs not listed as warranted

If strategy copy is promoted to the homepage or `/public`, it must be edited to match `TIER_MODULES` and `/maturity`, then the warranted list updated if needed.

## Promise control

`docs/operations/PRODUCT_PROMISE_MATRIX.md` is the release-blocking audit
ledger for public claims that span multiple surfaces. If a public page,
generated page, product JSON file, strategy document, or test disagrees about
whether a promise is live, sellable, self-serve, self-running, refundable, or
validated, treat the promise as **conflicted** until the matrix is resolved and
the relevant verifier enforces the chosen source of truth.

## Canonical facts (current contract)

1. **Foundation** and **Professional** use the **same 11** integration keys in `TIER_MODULES` (order may vary; contents must match).
2. **Enterprise** and **Managed** use **13** keys: the 11 above plus `wordpress` and `verify`.
3. **Custom Volume** uses **19** keys (full vertical + comms + CRM + directory + leads + video, etc., as coded).
4. **353** = length of `ALL_AUTOMATIONS` in `api/automation-catalog.js`. **347** = strategy micro-task layer documented separately (`doc/START-HERE.md` §2b) — not the same array.
5. **No absolute “hands-off forever” claim** on warranted surfaces: provisioning remains **key-, tier-, and vendor-dependent**; see `/maturity`.

## Answering “is everything in the repo true?”

**Strict answer:** No — the repo contains non-warranted material by design.

**Operational answer:** **Yes, for warranted surfaces**, when `npm run verify:product` passes and you treat `/maturity` + `TIER_MODULES` as the runtime contract for buyer expectations.
