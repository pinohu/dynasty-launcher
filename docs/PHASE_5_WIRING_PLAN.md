# Phase 5 — Modular-Agent Wiring Plan

Phases 1–4 shipped the prompt/agent layer, planner, event stream, and
safety libraries. Phase 5 closes the last integrator gap and cuts a
routing seam so the legacy `api/provision.js` orchestrator can optionally
delegate `mod_*` work to the modular integrator subagent behind
`USE_MODULAR_AGENTS`.

This document is split into two draft PRs:

- **5a — Integrator tool surface completion** (this PR)
- **5b — `routeMod()` helper + feature-flagged dispatch** (draft PR)

Neither PR merges on its own. The rollout plan is below.

## 5a — What ships here

Four new tools added to `agents/subagents/integrator/tools.json`:

| Tool | Purpose | Verification |
|---|---|---|
| `mod_seo_wire` | WriterZen keywords → 3 blog posts → push `content/blog/` → NeuronWriter optimize | re-fetch pushed file, confirm 200 |
| `mod_analytics_wire` | Create PostHog project → return snippet. Plerdy = manual-setup doc only | fetch project by id |
| `mod_leads_wire` | Register Happierleads / Salespanel site → push `docs/LEAD-INTELLIGENCE.md` | snippet shape check |
| `mod_social_wire` | Create Vista Social profile-group → point at repo `social-media/calendar.csv` | unverified until human import |

`loop.txt` now lists 12 standard tasks (was 8) and includes the four new
modules in the `submit_results` enum. No provisioning logic moves here —
the tools are prompt-layer descriptions for the integrator; the actual
vendor calls still live in the existing `mod_*` functions in
`api/provision.js`.

## 5b — What ships next (separate draft PR)

A tiny `routeMod()` helper at the top of `api/provision.js` that reads
`USE_MODULAR_AGENTS` and dispatches to either:

- **legacy** — the existing inline `mod_*` function call (default), OR
- **modular** — a stub that returns `{ ok: false, service, details: { routed: 'modular', note: 'integrator-subagent wiring pending' } }`, so the legacy path always wins on error until the orchestrator is ready to consume modular results.

The legacy path is fully intact. Flipping the flag off returns zero
behavior change. Flipping it on without the orchestrator wired simply
means each module returns the routing stub — which is the safe "loud
fallback" we want while the integrator subagent is in preview.

## Acceptance signals

- `scripts/smoke-agents.mjs` PASS — all six agents still load, integrator tool count = 15.
- `scripts/smoke-phase5.mjs` PASS — 4 new tools have required shapes + verification language.
- `USE_MODULAR_AGENTS=false` (default) → identical `runModules` behavior to pre-PR.
- `USE_MODULAR_AGENTS=true` → every mod_* call emits a routed=modular record; no vendor API calls leak through the stub.

## Rollout

1. Merge PRs #7 → #8 → #9 → #10 → #11 → #12 → this 5a PR to `main`.
2. Merge 5b (draft) only after 5a is in.
3. Run `npm test` locally; both smoke suites (legacy + Phase 5) should pass.
4. On a Vercel preview deploy, set `USE_MODULAR_AGENTS=true` and run one
   Professional-tier build; expect every `mod_*` result to show
   `{ routed: 'modular', ... }` and the build to gracefully fall back to
   manual MANUAL-ACTIONS.md guidance for each skipped module.
5. Only after the orchestrator actually consumes these tool calls (Phase 6)
   do we consider flipping the flag on production.

## Out of scope

- Running the `003_agent_runs.sql` migration (Phase 3, still gated).
- Flipping `USE_MODULAR_AGENTS` in production.
- Removing or deprecating the legacy `mod_*` functions.
