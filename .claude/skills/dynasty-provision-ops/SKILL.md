---
name: dynasty-provision-ops
description: Operator workflow for dynasty-launcher's 19 mod_* provisioning modules in api/provision.js. Use when the user wants to inventory which vendor keys are present, dry-run a tier (foundation/professional/enterprise/custom_volume), retry failed modules, audit archetype gating, or plan which of the 15 currently-empty vendor keys to unblock next. Reuses the api-connector-builder skill's template when adding a new mod_*.
---

# dynasty-provision-ops

Dynasty-launcher's provisioning engine is 19 `mod_*` functions wrapped by `api/provision.js`. This skill codifies the operator lifecycle: **inventory → gate → dry-run → run → verify → retry**. Every check is grounded in the real HTTP surface (`/api/provision`) and the real `TIER_MODULES` map at `api/provision.js:3250`.

## When to trigger

- "Which vendor keys are still missing?"
- "Dry-run a Professional tier build"
- "What modules actually run for Foundation vs Professional vs Enterprise?"
- "Why did mod_X skip for archetype Y?"
- "Retry the failed modules from the last build"
- "Add a new `mod_*` for vendor Z" → hand off to `api-connector-builder`
- "Which key unblocks the most modules?"

## Non-negotiables

- **Never print secret values.** Module inventory returns key-names and booleans only.
- **Never bypass tier gating client-side.** `TIER_MODULES` is enforced server-side in `api/provision.js`; client-side `dry_run` only previews.
- **Foundation tier has zero modules.** `TIER_MODULES.foundation: []` — don't promise module output for Foundation.
- **Archetype gating runs after tier gating.** `applyArchetypeModuleGating(enabled, buildProfile.archetype)` can further skip/defer modules.
- **`custom_volume` is the only tier that runs all 19.** Enterprise stops at 13 by design.
- **Errors in one module never block another.** Each returns `{ok, service, details?, error?, fallback?}`; orchestrator continues and reports a consolidated manifest.

## The 19 modules

Source: `api/provision.js` function definitions (line numbers in parens).

| # | Function | Line | Services | Output |
|---|---|---|---|---|
| 1 | `mod_hosting` | 288 | 20i | Domain, DNS, email, SSL, SPF/DKIM/DMARC |
| 2 | `mod_billing` | 397 | Stripe | Product + 3 prices + webhooks + dunning + portal |
| 3 | `mod_email` | 500 | Acumbamail | List, 5-email welcome sequence, automation |
| 4 | `mod_phone` | 615 | CallScaler, Insighto, Trafft | Number, AI voice agent, booking page |
| 5 | `mod_sms` | 706 | SMS-iT | Contact group, 3 templates |
| 6 | `mod_chatbot` | 757 | Chatbase | Trained on FAQ, widget |
| 7 | `mod_seo` | 869 | WriterZen, NeuronWriter | Keyword research, 5 blog posts |
| 8 | `mod_video` | 979 | Vadoo AI, Fliki | 60–90s explainer, 3 social clips |
| 9 | `mod_design` | 1022 | SUPERMACHINE, Pixelied, RelayThat | Hero, OG image, 40+ graphics |
| 10 | `mod_analytics` | 1138 | Plerdy, PostHog | Heatmaps, funnels, session recording |
| 11 | `mod_leads` | 1188 | Happierleads, Salespanel | Visitor ID, lead scoring |
| 12 | `mod_docs` | 1247 | Documentero, SparkReceipt | Legal PDFs, expense tracking |
| 13 | `mod_automation` | 1319 | n8n | 7 workflows |
| 14 | `mod_crm` | 1416 | SuiteDash | Workspace, pipeline, portal, invoicing |
| 15 | `mod_directory` | 1467 | Brilliant Directories | Directory provisioning |
| 16 | `mod_wordpress` | 1525 | 20i | WP package, theme, plugins |
| 17 | `mod_social` | 1585 | Vista Social | 260-post calendar import |
| 18 | `mod_verify` | 1618 | (synthetic) | Post-provision verification pass |
| 19 | `mod_vertical_tool` | 1834 | archetype-driven | Vertical-specific tool |

## Tier map (authoritative)

```
free, blueprint, scoring_pro, strategy_pack, foundation, starter → []
professional  → [hosting, billing, email, chatbot, seo, design, analytics, automation, docs, social, vertical_tool]         (11)
enterprise    → [+phone? NO] hosting, billing, email, chatbot, seo, design, analytics, automation, docs, wordpress, social, verify, vertical_tool   (13)
managed       → same as enterprise
custom_volume → [hosting, billing, email, phone, sms, chatbot, seo, video, design, analytics, leads, automation, docs, crm, directory, wordpress, social, verify, vertical_tool]  (19)
```

Foundation claims "strategy docs + deployment only" — do not promise modules in customer-facing copy for Foundation. Index.html and provision.js agree: `TIER_MODULES.foundation: []`.

## Key inventory — what's wired vs empty

Keys are read from `DYNASTY_TOOL_CONFIG` (encrypted Vercel env var) with individual env-var overrides at `api/provision.js:2135–2165`.

**Confirmed wired** (per CLAUDE.md "Credentials Available" — verify current state with `/api/provision?action=inventory`):
- `infrastructure.twentyi_general`, `infrastructure.twentyi_reseller_id` (10455)
- `payments.stripe_live`
- `comms.acumbamail`, `comms.callscaler`, `comms.insighto`, `comms.smsit`, `comms.trafft_client_id`
- `content.documentero`
- `automation.n8n_api`
- `data_research.posthog`

**Still empty** (15 keys — unblocking these activates modules in the table above):
- `content.writerzen` → `mod_seo`
- `content.neuronwriter` → `mod_seo`
- `content.supermachine` → `mod_design`
- `content.pixelied` → `mod_design`
- `content.relaythat` → `mod_design`
- `content.vadoo_ai` → `mod_video`
- `content.fliki` → `mod_video`
- `content.chatbase` → `mod_chatbot`
- `content.sparkreceipt` → `mod_docs`
- `content.vista_social` → `mod_social`
- `data_research.plerdy` → `mod_analytics`
- `data_research.happierleads` → `mod_leads`
- `data_research.salespanel` → `mod_leads`
- `community.heartbeat` → (future)
- `knowledge.fusebase` → (future)

**Unlocking order for revenue (highest to lowest impact):**
1. `chatbase` — Chatbot is a Professional-tier module. Single key, single vendor. Low-hanging fruit.
2. `vista_social` — 260-post social calendar is a flagship Enterprise promise. Single vendor.
3. `vadoo_ai` + `fliki` — Video module gates Professional-tier video output.
4. `writerzen` + `neuronwriter` — SEO module; both keys needed for blog post generation.
5. `supermachine` + `pixelied` + `relaythat` — Design module; fallback chain of three vendors, so any one activates partial output.
6. `plerdy` + `happierleads` + `salespanel` — Analytics + leads; PostHog already covers the analytics baseline.

## Operator commands

### 1. Inventory (read-only)

```bash
# Local Vercel env inspection
curl -s https://dynasty-launcher.vercel.app/api/provision?action=inventory | jq
```

Expected shape:
```json
{
  "ok": true,
  "config_loaded": true,
  "modules": {
    "hosting":   {"keys_present": true,  "vendor": "20i"},
    "billing":   {"keys_present": true,  "vendor": "stripe"},
    "chatbot":   {"keys_present": false, "vendor": "chatbase"},
    ...
  },
  "tier_readiness": {
    "foundation":   {"runnable": true,  "reason": "no modules"},
    "professional": {"runnable": false, "missing": ["chatbot", "seo.*", "design.*", "social"]},
    "enterprise":   {"runnable": false, "missing": [...]},
    "custom_volume":{"runnable": false, "missing": [...]}
  }
}
```

### 2. Dry-run a tier

```bash
curl -s -X POST https://dynasty-launcher.vercel.app/api/provision \
  -H "Content-Type: application/json" \
  -d '{"dry_run":true,"tier":"professional","project":{"slug":"test-drill","name":"Drill Test"}}' | jq
```

Response includes `would_provision: [...]` — the tier × archetype-gated module list that WOULD fire.

### 3. Identify blockers

Parse inventory → for each module with `keys_present: false`, look up the vendor → check `docs/CLAUDE_CODE_TOOLS.md` or upstream vendor doc for signup URL.

### 4. Adding a new `mod_*`

Hand off to `api-connector-builder` skill with these constraints:
- Function signature: `async function mod_foo(config, project, liveUrl?) → {ok, service, details?, error?, fallback?}`
- Register in `TIER_MODULES` at `api/provision.js:3250` for the tier that should include it
- Add key-presence check at `api/provision.js:2135–2165` (or equivalent DYNASTY_TOOL_CONFIG path)
- Update `/api/provision?action=inventory` response shape
- Add row to `README.md` module table
- Add row to `CLAUDE.md` "✅ IMPLEMENTED" section
- Add tier entry if the module is Enterprise-or-above only

### 5. Retry failed modules from a build

Build manifests include `results.failed: [{module, error, fallback}]`. To retry:

```bash
curl -s -X POST https://dynasty-launcher.vercel.app/api/provision \
  -H "Content-Type: application/json" \
  -d '{"action":"retry","build_id":"<ID>","modules":["chatbot","seo"]}' | jq
```

(Confirm this endpoint exists; if not, it's a gap in the orchestrator — file an issue.)

### 6. Archetype deferral audit

Each archetype (healthcare, directory, ecommerce, wordpress, saas, etc.) can skip or defer modules via `applyArchetypeModuleGating`. The dry-run response includes `archetype.skipped` and `archetype.deferred` — use these to explain to customers why a given module didn't run.

## Hand-offs

- **New integration** → `api-connector-builder`
- **Failed module debugging** → `build-error-resolver` agent + `/investigate` (gstack)
- **Stripe-specific billing ops** → `finance-billing-ops`, `customer-billing-ops` skills
- **Tier pricing / Foundation-vs-Professional decision** → `/council` command
- **Post-provision QA across a live build** → gstack `/browse` + `/qa` + `e2e-testing`
- **Secret hygiene audit** → `security-review`, `security-scan`
- **Prompt caching on the 20-phase builder pipeline** → `claude-api`, `cost-aware-llm-pipeline`

## Files to know

| Path | Purpose |
|---|---|
| `api/provision.js:288–1834` | 19 `mod_*` function bodies |
| `api/provision.js:2135–2165` | DYNASTY_TOOL_CONFIG + env-var key loading |
| `api/provision.js:3250` | `TIER_MODULES` authoritative map |
| `api/provision.js` (search `action === 'inventory'`) | Inventory endpoint |
| `app.html` `V3_TIERS` object | Client-side tier display (must match server) |
| `index.html` pricing section | Customer-facing tier copy (must match server) |
| `maturity.html` | "What ships today" truth deck — update when module status changes |
| `CLAUDE.md` "Keys still needed" | Mirror of the 15-empty-keys list |
| `README.md` module table | Public-facing module promises |
| `DYNASTY_LAUNCHER_V3_FINAL.md` | 720-line V3 spec incl. mod_* contracts |

## Invariant checklist (run before any tier-change deploy)

- [ ] `api/provision.js` `TIER_MODULES.foundation` is `[]`
- [ ] `app.html` `V3_TIERS.foundation.modules` is `[]`
- [ ] `index.html` does not promise modules for Foundation
- [ ] `maturity.html` "live vs partial vs spec" reflects current `keys_present`
- [ ] `CLAUDE.md` "Keys still needed" list matches `/api/provision?action=inventory`
- [ ] `README.md` module table matches the 19 functions above
- [ ] Every `mod_*` returns the full `{ok, service, details?, error?, fallback?}` envelope
