# Phase 3 — Event-Stream Reliability

## What changes

Every agent run becomes a structured, replayable log in Neon. Instead of linear conversation history stuffed back into the prompt each turn, the loader pulls a *pruned* view of the event stream: the plan, the last observation per subagent, any unresolved halts, nothing else. This keeps token usage flat even on long runs, enables resume-from-crash, and turns any past run into a replayable artifact.

## New schema (migration 003)

Two tables added:

- `agent_runs` — one row per orchestrator invocation. Tracks status (`in_progress`, `complete`, `halted`, `errored`, `abandoned`), plan, tenant, operating LLC, halt reason + context.
- `agent_events` — append-only log. One row per event: `user_prompt`, `plan_emitted`, `tool_call`, `observation`, `submit_results`, `halt`, `escalation`, `resume`, `thinking_block`. Indexed by `run_id + event_id` for fast replay.

Apply with:

```
psql "$DATABASE_URL" -f scripts/migrations/003_agent_runs.sql
```

Idempotent (`create table if not exists` throughout).

## Library: agents/_lib/event-stream.mjs

Exports:

- `startRun({ run_id, tenant_id, user_prompt, tier })` — register a new run.
- `appendEvent(...)` — fire-and-forget write, matches existing events_log behavior.
- `completeRun({ run_id, status, halt_reason, halt_context })` — terminal marker.
- `replay({ run_id, since_event_id?, limit? })` — all events in order. Time-travel debugging.
- `context({ run_id })` — pruned view: plan + last observation per subagent + unresolved halts. This is what gets injected into the next iteration's context.
- `runs({ tenant_id?, status?, since?, limit? })` — dashboard list.
- `resumePacket({ run_id })` — everything a crashed/halted run needs to pick up: verified plan items, remaining plan items, last observation per subagent, unresolved halts.

pg is imported lazily so the module loads cleanly in environments without postgres installed.

## HTTP endpoints

- `GET /api/agents/runs` — list runs (`?tenant_id=&status=&since=&limit=`).
- `GET /api/agents/runs?run_id=X` — context packet for one run.
- `GET /api/agents/replay?run_id=X` — full event stream.
- `POST /api/agents/resume { run_id }` — resume packet + emits a `resume` event so the stream records the pickup.

All flag-gated by `USE_MODULAR_AGENTS`; all require an admin token header.

## Commercial unlocks

1. **Resume-from-crash.** A run that dies mid-provision (Vercel timeout, network blip, planner miscall) restarts at the last verified plan item. The difference between a demo and production infrastructure.

2. **Time-travel debugging.** `GET /api/agents/replay?run_id=X` returns every event. Customer support goes from "can you describe what happened" to "send me the run_id." The same replay stream powers regression tests: replay a known-good run against a new prompt version and diff the event stream for behavioral drift.

3. **Partial rollback.** Because events are append-only and tagged by subagent, you can undo the last N events of a specific subagent without touching the rest. Kill the bad Vercel project, keep the good GitHub repo.

4. **Live progress UI.** The `runs()` + `context()` pair is the backend for a real-time dashboard. Replaces the current "deploy spinner" with observable state (which plan item is in-progress, which subagent is running, which halts are pending).

5. **Replay marketplace.** Canned templates — "spin up a PA CROP clone," "launch a Dynasty directory for niche X" — sold as one-click products that replay a stored event log with parameter swaps. Very high margin because the work is prebuilt.

## Smoke test

```
$ node scripts/smoke-phase3.mjs
PASS event-stream.mjs exports full surface
PASS 003_agent_runs.sql has expected shape
PASS api/agents/runs.js exports handler
PASS api/agents/replay.js exports handler
PASS api/agents/resume.js exports handler

All Phase 3 checks passed.
```

## Rollout

1. Merge PRs #7 + #8 + #9 + this phase's PR in order.
2. Run the migration on the Neon prod database: `psql $DATABASE_URL -f scripts/migrations/003_agent_runs.sql`.
3. Set `USE_MODULAR_AGENTS=true` on a preview deploy.
4. Orchestrator + subagent code paths start writing events automatically (Phase 1's `loadOrchestratorPrompt` / `loadSubagentPrompt` hooks call `startRun` / `appendEvent` when the flag is on — a follow-up PR wires the callers if they aren't already).
5. Hit `/api/agents/runs` to confirm events are flowing.
