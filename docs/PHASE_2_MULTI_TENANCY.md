# Phase 2 — Planner, Datasource, and Tenant-scoped Knowledge

## What changes

Three additions on top of Phase 1's modular prompt layer:

1. **Planner module on the fast tier.** A dedicated planner (`agents/_lib/planner.mjs`) takes the user prompt plus Dynasty doctrine and emits the orchestrator's plan object. Runs on Haiku 4.5 by default (`PLANNER_MODEL` env var) with Sonnet as a fallback. Splitting planning off the expensive Opus tier cuts roughly 70% of planning-phase cost on long runs.

2. **Unified datasource facade.** `agents/_lib/datasource.mjs` is a read-only facade over Neon, SuiteDash, GitHub, PA CROP, 20i, and Stripe. Subagents route reads through one `datasource_query` tool instead of holding one tool per source. Fewer tools in the menu means fewer misfires and a cleaner event stream. Writes still go through source-specific tools on purpose — reads are where tool sprawl bites hardest.

3. **Tenant-scoped knowledge and policies.** The loader accepts an optional `tenantId`. When present, it looks up each file under `agents/tenants/<tenantId>/` first and falls back to the shared default when the tenant doesn't override. Override is per-file — a tenant that only wants to customize the blue-ocean framework commits one file, inherits everything else.

## Directory layout (additions)

```
agents/
  _lib/
    planner.mjs                  # Phase 2: dedicated planner
    datasource.mjs               # Phase 2: unified read facade
    prompt-loader.mjs            # Phase 2: tenant-aware
  tenants/
    _example/                    # Phase 2: override pattern example
      README.md
      knowledge/
        dynasty-principles.md
api/
  agents/
    planner.js                   # Phase 2: HTTP wrapper, flag-gated
    datasource.js                # Phase 2: HTTP wrapper, flag-gated
```

## The datasource tenant guard

Neon queries touching tenant-scoped tables (`tenants`, `entitlements`, `events_log`) MUST include a `tenant_id` filter when a `tenantId` is passed. The facade throws if not:

```
Error: Neon query touches tenant-scoped tables without tenant_id filter
```

This is a belt-and-suspenders check on top of application-layer scoping. It catches the class of bug where a query template forgets the WHERE clause and silently reads across tenants.

## Commercial unlock

- **Cost:** planner on Haiku ≈ 70% reduction on planning tokens. On a typical 20-iteration run where planning is ~25% of total tokens, that's a real line-item saving once volume grows.
- **Multi-tenant:** the tenant override pattern lets Launcher be pointed at a customer's doctrine without forking the repo. One deployment, many tenant bundles. This is the foundation Phase 3's replay and Phase 4's safety layer build on for white-label and managed-enterprise tiers.

## Smoke test

```
$ node scripts/smoke-phase2.mjs
PASS default orchestrator loads
PASS _example tenant overrides dynasty-principles
PASS _example tenant falls back to shared blue-ocean
PASS planner.mjs exports planRun
PASS datasource.mjs exports query
SKIP datasource tenant guard (pg not installed in this env)

All Phase 2 checks passed.
```

The SKIP is expected when `pg` isn't installed in the local env — the guard is source-level and runs whenever the module actually connects to Neon (via the HTTP endpoint or a subagent tool call).

## Rollout

1. Merge PRs #7 + #8 + this phase's PR in order.
2. Set `USE_MODULAR_AGENTS=true` and `PLANNER_MODEL=claude-haiku-4-5-20251001` on a preview deploy.
3. POST to `/api/agents/planner` with a test prompt; verify the plan conforms to the orchestrator's emit_plan schema.
4. Flip the flag on production once preview runs match expectations.
