# Product Promise Matrix

**Purpose:** control which public promises Your Deputy is allowed to make,
sell, and automate. This is the pre-implementation audit ledger for the whole
product surface, not only the builder.

**Status:** release-blocking audit control.

**Last audited:** 2026-04-27.

**Primary rule:** a public claim may not exceed the lowest proven state across
copy, product registry, runtime implementation, billing, security, support, and
operational evidence.

---

## Why this exists

Your Deputy currently contains more than one product surface:

- autonomous business-unit launcher
- service-business automation marketplace
- tenant control plane and module activation system
- generated automation landing pages
- demo/product catalog assets
- admin, observability, checkout, billing, and recovery flows
- legal, privacy, refund, and support promises
- agent/AI/MCP operating-system claims

Those surfaces are valuable, but they make it easy for one file to promise more
than another part of the system can safely deliver. This document turns those
promises into a reviewable matrix before implementation continues.

---

## Readiness Vocabulary

Use these labels for customer-facing promises, regardless of the status names in
individual JSON files.

| Promise state | Customer-facing meaning | Public use |
|---|---|---|
| `idea` | Narrative, strategy, or backlog only. | Internal docs only. |
| `specified` | Product contract exists, but runtime is incomplete. | May appear in roadmap or "coming soon" copy. |
| `implemented` | Runtime path exists, but validation is incomplete. | Internal demos only. |
| `validated` | Tests/preflight/postflight pass in controlled environments. | Beta or private preview copy only. |
| `deployable` | Activation works end-to-end on staging without staff intervention. | Paid beta with clear limits. |
| `live` | Running for paying tenants with support, billing, monitoring, rollback, and evidence. | Marketplace, SEO, paid plans. |
| `blocked` | Security, billing, legal, or operational issue prevents the claim. | Must be removed, softened, or gated. |
| `conflicted` | Repo sources disagree about whether the claim is true. | Must resolve before launch. |

For marketplace modules, this vocabulary defers to
`docs/architecture/AUTOMATION_DEPLOYABILITY_STANDARD.md`: only `deployable` and
`live` can be marketplace-visible, and only `live` is broadly sellable.

---

## Release-Blocking Conflicts

| ID | Conflict | Evidence | Required decision |
|---|---|---|---|
| PM-001 | Public homepage/marketplace position Your Deputy as an autonomous business-unit launcher, while strategy copy positions it as the automation layer for service businesses. | `index.html`, `public/index.html`, `marketplace.html`, `docs/strategy/HOMEPAGE_COPY.md` | Choose a two-lane product story or make one narrative canonical. |
| PM-002 | `product/modules/**` marks 21 modules `live`, but operations docs say 20 modules are `spec`, 0 sellable, and 0 packs launch-ready. | `product/modules/**`, `docs/operations/MODULE_RELEASE_SCOREBOARD.md`, `docs/operations/PRODUCTION_PROGRAM_BOARD.md` | Either demote product registry statuses or attach live evidence for every module. |
| PM-003 | Marketplace readiness tests currently enforce the "everything live" model, while deployability docs enforce the "earn live status" model. | `scripts/check-marketplace-readiness.mjs`, `docs/architecture/AUTOMATION_DEPLOYABILITY_STANDARD.md` | Update tests to enforce the chosen readiness source of truth. |
| PM-004 | Generated automation pages make validated/no-code/refund promises at large scale. | `public/automations/**`, `generate-landing-pages.cjs` | Add generator-level promise guards and copy QA. |
| PM-005 | Refund promises are broad, but refund abuse controls and fulfillment workflow are not established in this matrix. | `terms.html`, `public/terms.html`, generated pages | Define refund workflow, owner, Stripe reconciliation, and abuse limits. |
| PM-006 | Self-running/self-serve positioning needs autonomy gates before agent orchestration expands. | Product strategy, admin/API surfaces, security audit findings | Define approval gates, spend limits, rollback, audit logs, and human escalation rules. |

None of the conflicts above should be hidden by copy edits alone. Resolve the
source of truth, then make generated/public surfaces match it.

---

## Matrix

| Promise area | Current public/internal claim | Current evidence | State | Required gate before stronger claim |
|---|---|---|---|---|
| Autonomous business-unit launcher | Launch a self-hostable autonomous business unit with website, funnel, CRM, RevOps, payments, AI/MCP tools, analytics, repair, and validation gates. | Root and public homepage/marketplace copy; builder/provisioning docs; maturity page. | `conflicted` | Split launcher promises from service-automation promises; map each launch artifact to tests and maturity evidence. |
| Service-business automation layer | Adds automation alongside Jobber, Housecall Pro, ServiceTitan, Google Calendar, Stripe, QuickBooks, and reviews tools. | `docs/strategy/HOMEPAGE_COPY.md`; product model; limited public alignment. | `specified` | Promote strategy copy to homepage/pricing/marketplace only after integration capabilities are represented honestly. |
| 353 n8n workflow library | 353 workflow records across 45 categories. | `api/automation-catalog.js`; `scripts/verify-product-alignment.mjs`. | `validated` | Keep verifier count checks; avoid implying all 353 are deployable modules. |
| 347 strategy micro-tasks | Separate strategy/task layer from the 353 workflow catalog. | `docs/PRODUCT_ACCURACY_SCOPE.md`, `doc/START-HERE.md`. | `specified` | Keep language separate from the runtime automation count. |
| Marketplace modules | 21 modules are live, active, marketplace-ready, and ready for use. | Product JSON and marketplace readiness test say yes; operations docs say no. | `conflicted` | Resolve product registry vs operations scoreboard; require evidence for build, UI, preflight, postflight, rollback, observability, billing, and tests. |
| Outcome packs | Five packs are priced and sellable. | `product/bundles/**` and public copy; ops pack map says 0/5 launch-ready. | `conflicted` | A pack launches only when every required module is `deployable` or `live`, billing resolves, templates exist, dependencies resolve, and support notes exist. |
| Editions and suites | Core, Solo, Small Team, Field Service, and Enterprise are ready/marketable. | `product/pricing/tiers.json`; strategy pricing copy; ops docs mark editions not launch-ready. | `conflicted` | Tie each edition to pack/module readiness and subscription fulfillment. |
| "No code required" activation | Customers can activate workflows without code or staff. | Generated page copy; deployability standard demands this; runtime/security audit shows activation paths need hardening. | `blocked` | Secure entitlements, tenant auth, webhooks, billing, preflight, postflight, and rollback before broad claim. |
| "Self-running" operations | Agents/systems can operate without routine human intervention. | Strategic goal; not yet a bounded runtime contract. | `specified` | Add autonomy levels, approval gates, budget/spend caps, audit ledger, incident rules, and kill switches. |
| 30-day money-back guarantee | Full refund within 30 days, often "no questions asked." | Terms pages and hundreds of generated pages. | `specified` | Define Stripe refund workflow, evidence retention, abuse policy, support owner, and accounting reconciliation. |
| Self-hostable core | Default architecture is self-hostable; integrations are adapters. | Public homepage/marketplace copy; builder artifact claims. | `specified` | Keep claim tied to generated architecture evidence; do not imply third-party integrations work without keys/vendor setup. |
| AI/MCP/agent tools | Tool registry, agent permissions, MCP surface, model routing, Hermes/OpenClaw notes. | Public homepage/marketplace copy; strategy intent; API security findings around AI endpoints. | `blocked` | Add auth, spend controls, provider-key protection, trace boundaries, and role-based agent permissions. |
| Standards coverage | OWASP/NIST/ISO/OpenTelemetry/GitHub protection and semantic validation gates. | Homepage and maturity copy; partial verification scripts. | `specified` | Maintain as "standards-aligned evidence" unless independent controls/tests prove compliance. |
| Compatibility with service software | Works alongside Jobber, Housecall Pro, ServiceTitan, Google Calendar, Microsoft 365, Stripe, QuickBooks, Google Business Profile, Facebook Reviews. | Strategy copy; generated pages do not consistently expose this; capability bindings are incomplete. | `specified` | Mark each vendor as native, adapter, import/export, customer-key-required, or planned. |
| HIPAA/regulated workflows | HIPAA add-on for BAA-covered processing and extended audit retention. | Strategy copy; capability/compliance flags; privacy/terms. | `specified` | Add BAA/subprocessor flow, PHI gates, data retention evidence, audit retention, and legal review. |
| Billing and entitlements | Paid modules/packs can be purchased, activated, paused, deactivated, and recovered. | Checkout/storefront/billing code exists; security audit found entitlement and webhook fail-open risks. | `blocked` | Fix auth, payment confirmation, Stripe webhook verification, entitlement ownership, and checkout recovery before selling modules. |
| Admin/ops console | Admin can monitor, manage, and repair platform operations. | `admin.html`, admin APIs, health/build surfaces. | `blocked` | Remove XSS-sensitive rendering, stop storing admin token in localStorage, standardize admin auth, and audit admin actions. |
| Public generated SEO pages | Hundreds of automation pages are customer-facing acquisition assets. | `public/automations/**`; generator. | `conflicted` | Add generated-copy guardrails: max description length, no unsupported live/validated/no-code claims, canonical compatibility language, root/public parity. |
| Legal/privacy disclosures | Terms, privacy, AI disclosure, refunds, third-party dependency limits. | `terms.html`, `privacy.html`, public mirrors. | `specified` | Keep aligned with actual data flows, AI provider usage, retention, subprocessors, and refund workflow. |

---

## Minimum Gates For The Next Implementation Sprint

Before broadening autonomy or adding more orchestration, complete these in
order:

1. Fix P0/P1 security issues around storefront activation, Stripe webhooks,
   AI endpoints, tenant auth, automation webhooks, admin rendering, GitHub
   proxy, and raw admin keys.
2. Resolve PM-002 and PM-003 by choosing the authoritative readiness model and
   making tests enforce it.
3. Update generated page logic so unsupported promises cannot be stamped across
   hundreds of files.
4. Add a product-readiness ledger that records evidence for each promotion:
   implementation, test run, staging activation, billing proof, monitoring,
   rollback, support runbook, and tenant evidence.
5. Add an autonomy ledger before "self-running" becomes public copy: every
   agent action should have actor, tenant, scope, tool, budget, approval state,
   result, rollback handle, and audit trail.

---

## Copy Rules Until Conflicts Are Resolved

- Say "specified" or "planned" for anything not proven live.
- Say "works alongside" only when the vendor relationship is clear:
  native integration, adapter, import/export, customer-key-required, or planned.
- Do not say "validated operating module" unless the module has validation
  evidence under the deployability standard.
- Do not say "no code required" for a workflow that still requires staff,
  manual credential stitching, custom configuration, or engineering help.
- Do not say "self-running" without "approval gates" or "without routine human
  intervention" nearby.
- Keep "self-hostable" tied to generated architecture, not to automatic live
  connectivity with third-party vendors.
- Keep refund copy synchronized between public pages, terms, checkout, and
  support operations.

---

## Recommended Canonical Product Story

Use a two-lane story:

1. **Your Deputy Launcher** creates validated, deployed, monetized,
   self-running micro-business systems with explicit approval gates.
2. **Your Deputy Core/Marketplace** runs service-business automation alongside
   the tools the customer already uses.

The lanes can share infrastructure, billing, agents, and admin, but their public
promises should be measured separately.

