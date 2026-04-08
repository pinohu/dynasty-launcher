# Dynasty Launcher V3 — Spec Addendum
## Gaps, Missing Sections, and Corrections

---

## GAP 1: WordPress Path Not Specified

The spec is entirely Next.js/Vercel-centric. But many project types — local services, directories, blogs, authority sites — should deploy as WordPress on 20i. The spec needs a decision tree:

```
Project Type → Deployment Path:
  SaaS / Dashboard / AI platform   → Next.js on Vercel
  Directory                         → Brilliant Directories (100 licenses)
  Authority site / Blog / Local biz → WordPress on 20i (Dynasty Developer theme)
  Landing page only                 → Static HTML on Vercel or 20i
  Client portal                     → SuiteDash (136 licenses)
```

**Missing:** WordPress generation pipeline — what plugins to install, how to push content, how to configure the Dynasty Developer theme (6 presets), how to set up WPAutoBlog for ongoing content.

**Action:** Add a `mod_wordpress.js` module that:
1. Creates 20i WordPress package
2. Installs Dynasty Developer theme
3. Activates required plugins (WPAutoBlog, Hide My WP Ghost, Stackable, ElementsKit)
4. Pushes blog posts via WP REST API
5. Configures theme with brand colors

---

## GAP 2: Database Migration Never Runs

The spec generates `Schema.ts` (Drizzle ORM tables) but never actually runs `db:generate` and `db:push` against the Neon database. Tables exist in code but not in the database.

**Fix:** Add a post-deployment step in `mod_billing.js` or a new `mod_database.js`:
1. After Vercel deploy succeeds, call a serverless function on the deployed app that runs migrations
2. OR: use the Neon API directly to execute the CREATE TABLE statements
3. OR: include a `scripts/seed.ts` that runs on first boot

**Preferred approach:** Add an API route `src/app/api/setup/route.ts` to the generated app that:
- Runs `drizzle-kit push` against the DATABASE_URL
- Inserts seed data
- Returns status
- Self-disables after first run (set a flag in DB)

Dynasty calls this endpoint after deployment succeeds.

---

## GAP 3: Webhook Chicken-and-Egg Problem

n8n workflows (Phase 16) need the deployed app's URL for webhook callbacks. But the URL isn't known until after deployment (Phase 8). Stripe webhooks need the same.

**Fix:** Two-pass approach:
1. Phases 1-7c: Generate all code files
2. Phase 8: Deploy to Vercel/20i → get live URL
3. Phases 9-15: Provision all services using the live URL
4. Phase 16: Create n8n workflows with the real webhook URLs
5. **Phase 17 (new): Post-deploy configuration** — PATCH the Vercel env vars with all the provisioned service keys (Stripe webhook secret, phone number, CRM URL, etc.) and trigger one final redeploy

This means the build pipeline is NOT linear — it has a deployment checkpoint in the middle.

---

## GAP 4: License Allocation Tracking

SuiteDash (136), BD (100), CallScaler (9), etc. The spec mentions tracking but doesn't specify WHERE the counter lives.

**Fix:** Add a `licenses` table to the Neon database (leados_gov or a dedicated dynasty_ops DB):
```sql
CREATE TABLE license_allocations (
  id SERIAL PRIMARY KEY,
  tool TEXT NOT NULL,          -- 'suitedash', 'brilliant_directories', 'callscaler'
  project_slug TEXT NOT NULL,  -- 'fb-marketplace-scraper'
  allocated_at TIMESTAMP DEFAULT NOW(),
  released_at TIMESTAMP,      -- NULL if still active
  resource_id TEXT,            -- the external ID (workspace ID, phone number, etc.)
  UNIQUE(tool, project_slug)
);
```

Before allocating, check: `SELECT COUNT(*) FROM license_allocations WHERE tool = $1 AND released_at IS NULL`. If at capacity, return error with instructions to release an unused license.

---

## GAP 5: Rollback / Cleanup on Partial Failure

If a build fails at Phase 12 (SEO), we've already provisioned a phone number (Phase 10), email list (Phase 11), and CRM workspace (Phase 9). These are orphaned resources.

**Fix:** Each module returns a `cleanup` function. If the build fails past a threshold, offer cleanup:
```javascript
const cleanupActions = [];
// After each module succeeds:
cleanupActions.push({ tool: 'callscaler', action: () => releaseNumber(phone_id) });

// On catastrophic failure:
if (shouldCleanup) {
  for (const c of cleanupActions) await c.action();
}
```

**Pragmatic approach:** Don't auto-cleanup (resources have real value). Instead, log all provisioned resources in the build report. Add a "Cleanup" button that the admin can trigger manually if needed.

---

## GAP 6: Clerk Per-Project

The spec says "Real Clerk app needed" but doesn't detail how. Clerk does NOT have a public API for creating new applications programmatically.

**Options:**
1. **Shared Clerk instance** (current) — all projects share one Clerk app. Users show up in the same Clerk dashboard. Works for Dynasty-owned projects but not for selling to external customers.
2. **Clerk organizations** — use Clerk's organization feature to isolate tenants within one app. This is the right approach for multi-tenant SaaS.
3. **Manual Clerk setup** — document in OPERATIONS.md. The customer creates their own Clerk app and updates env vars.

**Recommendation:** Option 2 for Dynasty-owned projects, Option 3 for customer-sold projects. Add to OPERATIONS.md as a clear step.

---

## GAP 7: Build Configuration UI

The spec doesn't define what inputs the user provides beyond a text description. For V3, we need:

**New input fields in the builder UI:**
- Custom domain (optional): `mydomain.com`
- Deployment target: Next.js (Vercel) / WordPress (20i) / Brilliant Directory / Static
- Enable toggles:
  - [ ] Custom domain + email
  - [ ] CRM + client portal
  - [ ] Phone + AI receptionist
  - [ ] Email marketing
  - [ ] SEO content (5 posts)
  - [ ] Explainer video
  - [ ] Lead tracking
  - [ ] Automation workflows
- Pricing info: what to charge customers (for Stripe product creation)
- Location: city/state (for local phone number area code)

**These map directly to which modules run.** If "Phone + AI receptionist" is unchecked, mod_phone.js is skipped entirely.

---

## GAP 8: Post-Deployment Testing

The spec tests the build system but never tests the deployed application.

**Fix:** Add a `mod_verify.js` that runs after all modules complete:
1. `GET /` → expect 200
2. `GET /en` → expect 200 or 307
3. `GET /docs` → expect 200
4. `GET /pricing` → expect 200
5. `GET /api/v1` → expect 200 (health check)
6. `GET /en/sign-in` → expect 200 or 307 (Clerk redirect)
7. Check HTML for project name (not "SaaS Template")
8. Check for zero `[object Object]` in rendered HTML
9. Lighthouse score check via PageSpeed Insights API (target: Performance > 70, SEO > 80)

If any check fails, flag it in the build report with remediation steps.

---

## GAP 9: Ongoing Maintenance Path

After deployment, how does the business owner update their site?

**For Next.js (Vercel):**
- Push to GitHub main branch → auto-deploys
- CLAUDE.md already documents this
- BUT: non-technical owners can't edit code

**For WordPress (20i):**
- WP Admin panel
- Gutenberg editor for content
- Theme customizer for design changes

**Fix:** Add to OPERATIONS.md:
- "How to edit your website" section per deployment type
- For Next.js: recommend Claude Code for changes, or create a simple CMS route
- For WordPress: link to WP Admin and key pages to edit
- For Brilliant Directories: link to BD Admin

---

## GAP 10: DYNASTY_TOOL_CONFIG Complete Schema

The spec references DYNASTY_TOOL_CONFIG but doesn't define the full target schema. Needed so all modules know exactly what key to read.

```json
{
  "ai": {
    "anthropic": "sk-ant-...",
    "groq": "gsk_...",
    "openrouter": "sk-or-..."
  },
  "payments": {
    "stripe_live": "sk_live_...",
    "stripe_publishable": "pk_live_...",
    "stripe_webhook_secret": "whsec_..."
  },
  "infrastructure": {
    "vercel": "sVUgRDQu...",
    "twentyi_general": "c63ba268...",
    "twentyi_oauth": "cb5fbe87...",
    "twentyi_reseller_id": "10455",
    "neon_api": "napi_kaqggq22...",
    "neon_org": "org-small-credit-59990711",
    "neon_store": "store_dlRpluZOBH0L34D3"
  },
  "comms": {
    "acumbamail": "0cdbad07...",
    "callscaler": "120|ZPLZo...",
    "insighto": "in-8sy7g...",
    "thoughtly": "0dy3971e...",
    "smsit": "SMSIT_a1a5c9...",
    "trafft_client_id": "380067799...",
    "novocall": "..."
  },
  "content": {
    "writerzen": "...",
    "neuronwriter": "...",
    "supermachine": "...",
    "pixelied": "...",
    "relaythat": "...",
    "vadoo_ai": "...",
    "fliki": "...",
    "documentero": "R6OL3LQ-...",
    "castmagic": "...",
    "blogify": "..."
  },
  "crm_pm": {
    "suitedash_api": "...",
    "suitedash_url": "https://app.suitedash.com"
  },
  "automation": {
    "n8n_api": "eyJhbGci...",
    "n8n_url": "https://n8n.audreysplace.place",
    "konnectzit": "..."
  },
  "data_research": {
    "plerdy": "...",
    "happierleads": "...",
    "salespanel": "...",
    "posthog": "phc_por7UB..."
  },
  "directories": {
    "brilliant_api": "...",
    "brilliant_licenses": 100,
    "brilliant_licenses_used": 0
  },
  "suitedash": {
    "licenses_total": 136,
    "licenses_used": 0
  },
  "community": {
    "heartbeat": "...",
    "fusebase": "..."
  },
  "modules_enabled": {
    "hosting": true,
    "crm": false,
    "email": true,
    "phone": false,
    "sms": false,
    "seo": false,
    "video": false,
    "design": false,
    "billing": true,
    "analytics": false,
    "leads": false,
    "docs": false,
    "automation": false,
    "directory": false,
    "community": false,
    "wordpress": false
  }
}
```

---

## GAP 11: Google Business Profile

For local businesses, GBP is the #1 source of customers. Not mentioned in the spec.

**Problem:** Google doesn't have a public API for creating new GBP listings. It requires manual verification (postcard, phone call, or video).

**Fix:** Add to OPERATIONS.md as a high-priority manual step:
1. Go to business.google.com
2. Create listing with exact business name, address, phone number (from CallScaler)
3. Select verification method
4. Upload photos (from SUPERMACHINE-generated images)
5. Add business hours, services, description (from generated content)

Dynasty CAN generate the GBP-optimized description, category selection, and photo set. The user just has to paste them in.

---

## GAP 12: Cost Tracking and Budget Guards

The spec says "$2-5 per build" but doesn't break it down or set guardrails.

**Per-build cost estimate:**
| Service | Cost per call | Calls per build | Total |
|---------|-------------|----------------|-------|
| Claude API (generation) | ~$0.50 | 8-10 calls | $4-5 |
| WriterZen | $0 (included in plan) | 1 | $0 |
| NeuronWriter | $0 (included in plan) | 5 | $0 |
| Vadoo AI | $0 (included in plan) | 1 | $0 |
| SUPERMACHINE | $0 (included in plan) | 3-5 | $0 |
| Stripe | $0 (product creation is free) | 3 | $0 |
| CallScaler | ~$2/mo (recurring per number) | 1 | $2/mo |
| 20i hosting | $0 (reseller, included) | 1 | $0 |
| SMS-iT | ~$0.01/SMS | 0 at build time | $0 |
| n8n | $0 (self-hosted) | 5 workflows | $0 |
| **Total per build** | | | **~$5 + $2/mo** |

**Budget guard:** Add a `V2_BUILD_COST` tracker that sums estimated costs in real-time. If projected cost exceeds $10, warn user before proceeding. Store cumulative spend in Neon for monthly tracking.

---

## GAP 13: Rate Limiting Across Builds

If 10 builds run in one day, tools with tight rate limits will fail.

**Known rate limits:**
| Tool | Limit | Risk at 10 builds/day |
|------|-------|----------------------|
| CallScaler | Unknown — likely 10+/min | Low |
| Acumbamail | 100 req/min | Low |
| NeuronWriter | 5 projects/day (est.) | **HIGH** |
| WriterZen | 20 keywords/day (est.) | **MEDIUM** |
| SUPERMACHINE | 100 images/day (est.) | Low |
| Stripe | 100 req/sec | Low |
| 20i | Unknown | Low |
| n8n | Self-hosted, no limit | None |

**Fix:** Add a daily build counter. If NeuronWriter/WriterZen would exceed limits, fall back to Claude-generated content (lower quality but unlimited).

---

## GAP 14: Security — Credential Exposure

DYNASTY_TOOL_CONFIG contains 40+ API keys in a single env var. If this leaks, everything is compromised.

**Mitigations:**
1. Env var is already encrypted on Vercel (type: "encrypted")
2. Never expose keys to the client/browser — all API calls happen server-side in provision.js
3. Never log full keys — log only first 8 chars for debugging
4. Add key rotation schedule to OPERATIONS.md
5. Use Stripe restricted keys (not full secret keys) with only the permissions needed

**Additional:** The build report should NEVER include full API keys. Mask them: `sk_live_51RZ...****`

---

## GAP 15: Accessibility & Performance

No mention of WCAG or Lighthouse targets for generated sites.

**Fix:** Add to the frontend generation prompt:
- "All pages must be WCAG AA compliant: proper heading hierarchy, alt text on images, sufficient color contrast, keyboard navigable"
- Add to mod_verify.js: run Lighthouse audit, flag if Performance < 70 or Accessibility < 80

**Add to validation gate:**
- Check that all `<img>` tags have `alt` attributes
- Check that color contrast meets AA (4.5:1 for text)

---

## GAP 16: Domain Registration

20i provisions hosting for a domain, but who buys the domain? The spec assumes the user already owns one.

**Options:**
1. **User provides domain** — current assumption. Works.
2. **20i domain registration** — 20i's reseller API can register domains. Dynasty could buy the domain automatically.
3. **Recommend registrars** — Namecheap, Cloudflare, etc. in OPERATIONS.md.

**Recommendation:** Option 1 for now, Option 2 as a future enhancement. Domain registration involves real money and legal ownership — too risky to fully automate without explicit user confirmation.

---

## GAP 17: Multi-Project Dashboard

The spec covers launching individual businesses but not managing the portfolio. When there are 50+ deployed businesses, Ike needs:
- Uptime status for all sites
- Revenue per site (Stripe data)
- Email campaign performance (Acumbamail data)
- SEO rankings (NeuronWriter data)
- Phone call volume (CallScaler data)
- CRM activity (SuiteDash data)

**Fix:** This is a separate product — "Dynasty Command Center" — not part of the launcher itself. But the launcher should lay the groundwork by:
1. Storing all provisioned resources in a central database (Gap 4)
2. Including API keys for each provisioned service in the build report
3. Generating a monitoring webhook for each site

This becomes Sprint 6+ work — after the launcher is complete.

---

## REVISED BUILD PIPELINE (Corrected Ordering)

The original spec had a linear pipeline. The corrected version has a **deployment checkpoint**:

```
PHASE 1-7c: Generate all files (code, docs, content)
    ↓
PHASE 8: Push to GitHub + Deploy to Vercel/20i → GET LIVE URL
    ↓ (wait for deployment to succeed)
    ↓
PHASE 9-15: Provision all external services (using live URL)
    ↓
PHASE 16: Create n8n automations (connecting all services)
    ↓
PHASE 17: Post-deploy config (update env vars with all service keys)
    ↓
PHASE 18: Final redeploy (picks up new env vars)
    ↓
PHASE 19: Verification (smoke test all routes + Lighthouse)
    ↓
PHASE 20: Generate build report + OPERATIONS.md
```

This is 20 phases, not 16. The extra phases are necessary to handle the deployment dependency chain correctly.

---

## SUMMARY OF ADDITIONS

| Gap | Impact | Sprint | Effort |
|-----|--------|--------|--------|
| WordPress path | HIGH | Sprint 1 | 15h |
| Database migration | HIGH | Sprint 1 | 4h |
| Webhook ordering | HIGH | Sprint 1 | 6h |
| License tracking | MEDIUM | Sprint 1 | 4h |
| Build config UI | MEDIUM | Sprint 2 | 8h |
| Post-deploy testing | MEDIUM | Sprint 4 | 6h |
| DYNASTY_TOOL_CONFIG schema | LOW | Sprint 1 | 2h |
| Rollback/cleanup | LOW | Sprint 5 | 6h |
| Clerk per-project docs | LOW | Sprint 2 | 2h |
| GBP instructions | LOW | Sprint 3 | 2h |
| Cost tracking | LOW | Sprint 4 | 3h |
| Rate limiting | LOW | Sprint 3 | 3h |
| Security audit | LOW | Sprint 5 | 4h |
| Accessibility | LOW | Sprint 3 | 3h |
| Maintenance docs | LOW | Sprint 5 | 3h |
| Portfolio dashboard | FUTURE | Sprint 6+ | 40h+ |

**Revised total effort:** 130-180 hours across 5-6 sprints.
