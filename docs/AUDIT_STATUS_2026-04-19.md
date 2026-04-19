# Audit status — 2026-04-19

Snapshot of the modular-agents PR stack (Phases 1–5), smoke results across
all feature branches, and the recommended merge sequence.

## 1. Open PRs

All six modular-agents PRs opened by pinohu are currently open against
`main` (or, for 5b, against 5a). None merged.

| PR | Title | Head | Base | Smoke | Notes |
|---|---|---|---|---|---|
| [#7](https://github.com/pinohu/dynasty-launcher/pull/7) | Phase 1: Modular agent architecture (prompt surgery) | `feat/modular-agents-phase-1` | `main` | ✅ | Behind `USE_MODULAR_AGENTS` (default off). |
| [#8](https://github.com/pinohu/dynasty-launcher/pull/8) | Phase 1.1: Fill in the four scaffolded subagents | `feat/agents-phase-1.1` | `main` | ✅ | Depends on #7. |
| [#9](https://github.com/pinohu/dynasty-launcher/pull/9) | Phase 2: Planner + Datasource + Tenant-scoped knowledge | `feat/agents-phase-2` | `main` | ✅ | Depends on #7, #8. |
| [#10](https://github.com/pinohu/dynasty-launcher/pull/10) | Phase 3: Event-stream reliability (replay, resume, time-travel) | `feat/agents-phase-3` | `main` | ✅ | Depends on #7, #8, #9. `003_agent_runs.sql` not run. |
| [#11](https://github.com/pinohu/dynasty-launcher/pull/11) | Phase 4: Policy hardening (sanitizer, shell-wrapper, reminders, approval seam) | `feat/agents-phase-4` | `main` | ✅ | Depends on #7–#10. |
| [#12](https://github.com/pinohu/dynasty-launcher/pull/12) | Security: HMAC verification on all `/api/agents/*` endpoints | `feat/agents-auth-hardening-v2` | `main` | ✅ | Depends on #7–#11. |
| [#13](https://github.com/pinohu/dynasty-launcher/pull/13) | **DRAFT** Phase 5a: complete integrator tool surface | `feat/agents-phase-5a` | `main` | ✅ | New. Stacks on #12. |
| [#14](https://github.com/pinohu/dynasty-launcher/pull/14) | **DRAFT** Phase 5b: `routeMod()` seam behind `USE_MODULAR_AGENTS` | `feat/agents-phase-5b` | `feat/agents-phase-5a` | ✅ | New. Stacks on #13. |

## 2. Smoke-test matrix

Every `scripts/smoke-*.mjs` on every branch, after `npm install` (the repo
declares `pg ^8.13.0` as a dependency; several smokes require it).
All rows run `rc=0` with zero failures.

| Branch | smoke-agents | smoke-activation | smoke-auth | smoke-billing | smoke-catalog | smoke-events | smoke-phase2 | smoke-phase3 | smoke-phase4 | smoke-phase5 | smoke-phase5b | smoke-tenants | smoke-workflows |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `feat/modular-agents-phase-1` | 6/6 | 13/13 | — | 12/12 | 18/18 | 12/12 | — | — | — | — | — | 10/10 | 8/8 |
| `feat/agents-phase-1.1` | 6/6 | 13/13 | — | 12/12 | 18/18 | 12/12 | — | — | — | — | — | 10/10 | 8/8 |
| `feat/agents-phase-2` | 6/6 | 13/13 | — | 12/12 | 18/18 | 12/12 | 6/6 | — | — | — | — | 10/10 | 8/8 |
| `feat/agents-phase-3` | 6/6 | 13/13 | — | 12/12 | 18/18 | 12/12 | 6/6 | 5/5 | — | — | — | 10/10 | 8/8 |
| `feat/agents-phase-4` | 6/6 | 13/13 | — | 12/12 | 18/18 | 12/12 | 6/6 | 5/5 | 8/8 | — | — | 10/10 | 8/8 |
| `feat/agents-auth-hardening-v2` | 6/6 | 13/13 | 8/8 | 12/12 | 18/18 | 12/12 | 6/6 | 5/5 | 8/8 | — | — | 10/10 | 8/8 |
| `feat/agents-phase-5a` (new) | 6/6 (15 tools) | 13/13 | 8/8 | 12/12 | 18/18 | 12/12 | 6/6 | 5/5 | 8/8 | 24/24 | — | 10/10 | 8/8 |
| `feat/agents-phase-5b` (new) | 6/6 | 13/13 | 8/8 | 12/12 | 18/18 | 12/12 | 6/6 | 5/5 | 8/8 | 24/24 | 15/15 | 10/10 | 8/8 |

`—` means the smoke file does not exist on that branch yet (not a failure).

Integrator tool count across branches: `feat/modular-agents-phase-1` scaffolds with 2 tools; `feat/agents-phase-1.1` fills it to 11; `feat/agents-phase-5a` extends to 15 (adds `mod_seo_wire`, `mod_analytics_wire`, `mod_leads_wire`, `mod_social_wire`). `smoke-agents.mjs` verifies this at each tip.

## 3. Phase 5 draft PRs (new)

### #13 — Phase 5a (DRAFT)
Completes the integrator tool surface in `agents/subagents/integrator/tools.json`. Adds the four missing wire tools (SEO / analytics / leads / social) plus `scripts/smoke-phase5.mjs` (24 checks) and `docs/PHASE_5_WIRING_PLAN.md`. Touches **only** the agents prompt layer and the new smoke/doc; `api/provision.js` is untouched.

### #14 — Phase 5b (DRAFT)
Adds `routeMod(name, fn, config, project, liveUrl)` at the top of `api/provision.js` (exported for testability) and swaps the single `fn(...)` call in `runModules()`'s module loop to go through it. Behavior with `USE_MODULAR_AGENTS` unset is byte-identical to pre-PR. With the flag `"true"`, the helper returns a loud `{ ok: false, routed: 'modular', fallback: '...' }` stub — no vendor APIs fire until the orchestrator is ready to consume integrator submits. `scripts/smoke-phase5b.mjs` (15 checks) exercises both flag states with dynamic imports.

## 4. Recommended merge sequence

Strict order; every step blocks the next:

1. **#7** → `main` — modular prompts scaffold + loader + flag (off by default). Smoke: `npm test` + `node scripts/smoke-agents.mjs`.
2. **#8** → `main` — fills the four scaffolded subagents (integrator reports 11 tools). Smoke: `smoke-agents.mjs`.
3. **#9** → `main` — planner + datasource + tenant overrides. Smoke: `smoke-phase2.mjs`. *Do not run the `002_tenants.sql` migration from this PR until after #12 merges; Phase 4 sanitizer and Phase auth-hardening gate admin endpoints.*
4. **#10** → `main` — event-stream replay/resume/context. Smoke: `smoke-phase3.mjs`. *`scripts/migrations/003_agent_runs.sql` is still a manual step; do not run on production until at least #11 + #12 are also in.*
5. **#11** → `main` — sanitizer + shell-wrapper + reminders + approval seam. Smoke: `smoke-phase4.mjs`.
6. **#12** → `main` — HMAC auth on `/api/agents/*`. Smoke: `smoke-auth.mjs` (8 checks — placeholder-auth regression guard). **After this lands, flip no flags yet.**
7. **#13 (Phase 5a)** → `main` — integrator tool surface complete. Zero runtime impact; prompt-layer only. Smoke: `smoke-phase5.mjs` + `smoke-agents.mjs` (tools=15).
8. **#14 (Phase 5b)** → `main` — `routeMod` dispatch seam in `provision.js`, flag still default-off. Smoke: `smoke-phase5b.mjs` + full `npm test`. Production deploy should show zero behavior change.
9. **After #14 is in**: on a Vercel preview, set `USE_MODULAR_AGENTS=true`, run one Professional-tier build, confirm every `mod_*` slot reports `{ routed: 'modular', ... }` and the pipeline degrades to MANUAL-ACTIONS.md cleanly. Do **not** flip the flag on production.
10. Only after a follow-up PR actually wires the orchestrator → integrator-subagent consumption path (that PR is **not** in this stack) should the flag be flipped on production.

Migrations:
- `002_tenants.sql` (from #9) — run after #9 merges, before any tenant-scoped smoke runs in CI.
- `003_agent_runs.sql` (from #10) — run **after** #10 merges, and only after you're ready to start emitting event-stream records. Explicit in PR body of #10.

## 5. Issues found

### 5.1 — Audit-hardening patch missing (blocker)
The task description referenced `/mnt/user-data/outputs/audit-hardening.patch` containing Phase 1.5 work (sanitizer fix + adversarial tests + Phase 5 plan) to become PR #13. **The file is not on disk anywhere.** Searched `/mnt`, `/tmp`, `/home`, `/root`, plus `find / -name '*.patch' -o -name '*audit*'` — no matches. The patch was not re-materialized from memory or fabricated; PR #13 was therefore re-used for Phase 5a instead. Once the real patch is available, it should open as the next available PR number (currently #15) titled *"Audit hardening: sanitizer fix + adversarial tests + Phase 5 plan"*, targeting `main` and stacking under Phase 5a/5b as appropriate.

### 5.2 — `pg` not in CI smoke runner
Without `npm install`, five smokes (`smoke-activation`, `smoke-billing`, `smoke-events`, `smoke-tenants`, `smoke-workflows`) fail with `ERR_MODULE_NOT_FOUND: pg`. `package.json` declares `pg ^8.13.0` as a dependency, so this is an env/CI issue, not a branch issue. Phase 2's `smoke-phase2.mjs` already handles this with `SKIP` — the others do not. Recommend either adding the same `SKIP` pattern to the remaining five, or ensuring the CI runner always `npm install`s before invoking `npm test`. Not urgent; does not block the merge sequence.

### 5.3 — Docs `PHASE_5_WIRING_PLAN.md` was a forward reference
The task description pointed at `docs/PHASE_5_WIRING_PLAN.md` as the basis for the Phase 5a draft. That file did not exist on any branch. Phase 5a creates it; Phase 5b cross-references it. If the missing audit-hardening patch also contains a version of this doc, resolve by merging Ike's version on top of the Phase 5a copy (or rebase Phase 5a on Ike's patch).

### 5.4 — `smoke-phase5.mjs` / `smoke-phase5b.mjs` not yet in `npm test`
`package.json`'s `test` script chains the legacy seven smokes. After #13 and #14 merge, add `test:phase5` and `test:phase5b` entries and include them in the composite `test` chain. A one-line PR; not necessary to merge alongside 5a/5b but should follow.

### 5.5 — `api/provision.js` is large (≈3,570 lines)
The `routeMod()` helper sits at the very top (lines 7–35 now) for discoverability, but it's the only export in a file otherwise composed of inline `mod_*` and helpers. Future modular work will want to break `provision.js` into `api/provision/` with one file per mod. Not a blocker, but if the next PR touches the file, consider starting that split.

## 6. What did NOT run / was NOT done

Per task scope:

- No merges. All eight PRs (6 existing + 2 new drafts) remain open.
- No force-pushes anywhere.
- No migrations run (`002_tenants.sql`, `003_agent_runs.sql` both still manual).
- `USE_MODULAR_AGENTS` not flipped.
- Nothing touched outside `agents/`, `api/provision.js`, `scripts/`, `docs/`.
- Original audit-hardening PR (#13 in the task plan) deferred until patch materializes — see 5.1.

---

**Prepared by:** polycarpohu@gmail.com on branch `claude/dynasty-audit-hardening-kuGYz`
**Git HEAD at time of report:** see commit adding this file.
