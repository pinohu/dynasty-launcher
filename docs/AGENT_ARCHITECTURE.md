# Agent Architecture — Dynasty Launcher

## Tiers

1. **Orchestrator** — plans, delegates, assembles. Does not call vendor APIs.
2. **Subagents** — provisioner, code-generator, integrator, deployer,
   auditor. One tool per iteration inside each.
3. **Tools** — declared in each subagent's `tools.json` with policy
   embedded in descriptions (not in a separate policy doc).

## Assembly

`agents/_lib/prompt-loader.mjs` (Node) and `prompt-loader-browser.mjs`
(browser) assemble `{system, tools}` objects from the on-disk files.
Both loaders cache per-process/per-page and share the same source of truth.
Assembly order: policies → role+loop → modules → knowledge → tools.

## The 6-step loop

Every subagent's `loop.txt` opens with:

    <agent_loop>
    1. Analyze Events
    2. Select Tool (ONE per iteration)
    3. Wait for Execution
    4. Iterate
    5. Submit Results
    6. Enter Standby
    </agent_loop>

Parallelism lives at the orchestrator tier only. Inside a subagent, single
action → observation → next. This is what gives us rollback points, clean
logs, and resume-from-crash behavior in Phase 3.

## Feature flag

`USE_MODULAR_AGENTS` (env var) + `use_modular_agents` (DEFAULT_FLAGS
entry, admin UI visible). Default **false**. Flip per-environment via
Vercel env vars or at runtime via `/api/flags`. When off, Launcher runs
the legacy inline prompts unchanged.

## Roadmap

- **Phase 1 (shipped)** — directory structure, orchestrator + provisioner
  fully specified, four other subagents scaffolded with TODO markers,
  loader (node + browser), smoke test, feature flag.
- **Phase 1.1** — flesh out code-generator, integrator, deployer, auditor
  `loop.txt` and `tools.json` per the provisioner template. No core
  architecture changes — just filling in the four scaffolds.
- **Phase 2** — planner split onto Haiku 4.5 (cost cut), unified datasource
  module (fewer tools in the menu), tenant-scoped knowledge bundles
  (multi-tenant / white-label unlock).
- **Phase 3** — event-stream replay, resume-from-crash, time-travel
  debugging, live progress UI. Turns every run into a structured,
  replayable log in Neon.
- **Phase 4** — system-reminder injector, shell-wrapper enforcement,
  adversarial input sanitizer, Thinking-block approval seam. Makes
  Launcher safe to expose to external users.

## Editing rules

- Knowledge changes → commit to `shared/knowledge/`. No code deploy
  needed; next cold start (or `/api/flags` refresh) picks them up.
- Policy changes → commit to `shared/policies/`. Review required;
  these are the rules that protect against runaway behavior.
- Tool schema changes → edit the relevant `tools.json`. The description
  field is where policy lives; treat edits there as policy edits.
- Adding a subagent → copy `subagents/provisioner/` as the template.
  Keep the three-file structure.

## Smoke test

    node scripts/smoke-agents.mjs

Expect 6 PASS lines (orchestrator + 5 subagents).
