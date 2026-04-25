# Dynasty Launcher — Modular Agent Architecture (Phase 1)

Formalizes the prompt layer that runs Launcher's orchestrator and its subagents.
Replaces ad-hoc system prompts embedded in `app.html` / `api/orchestrate.js`
with versioned, file-backed prompt modules that both the browser client and
serverless functions load from the same source.

## Why

The previous prompt layer was monolithic and implicit. The same system prompt
text lived inline in multiple places (client + server), which made versioning,
A/B testing, and regression debugging hard. This structure — modeled after how
Manus ships prompts (`Agent loop.txt`, `Modules.txt`, `tools.json`) — splits
the prompt into three concerns that can be edited, versioned, and tested
independently.

## Layout

```
agents/
  _lib/
    prompt-loader.mjs           # Node/Vercel: assemble system prompt from files
    prompt-loader-browser.mjs   # Browser: fetch-based equivalent
  shared/
    knowledge/                  # Static reference injected every cycle
    policies/                   # Non-negotiable rules (escalation, halt, shell)
  orchestrator/
    loop.txt                    # 6-step agent loop + role
    modules.txt                 # Planner, Knowledge, Datasource references
    tools.json                  # Tool schemas (delegate-to-subagent tools)
  subagents/
    provisioner/                # Vercel, GitHub, Neon, 20i provisioning
    code-generator/             # Backend + frontend code generation
    integrator/                 # Wires up mod_* modules (SuiteDash, Stripe)
    deployer/                   # Final deploy + smoke tests
    auditor/                    # Post-deploy WCAG + functional verification
```

Each subagent directory contains the same three files: `loop.txt`,
`modules.txt`, `tools.json`. The loader concatenates them (plus shared
knowledge and policies) into a single system prompt string.

## Assembly order

When a subagent is invoked, the loader produces a system prompt in this order:

1. `shared/policies/*` — non-negotiable rules (highest priority, listed first)
2. `<subagent>/loop.txt` — role definition and the 6-step agent loop
3. `<subagent>/modules.txt` — planner, knowledge, datasource hooks
4. `shared/knowledge/*` — Dynasty framework reference
5. `<subagent>/tools.json` — tool catalog with policy-embedded descriptions

## The 6-step loop

Every subagent's `loop.txt` opens with a literal `<agent_loop>` block:

```
<agent_loop>
1. Analyze Events: understand current state from the event stream.
2. Select Tool: choose exactly ONE tool call for this iteration.
3. Wait for Execution: the sandbox executes the call and emits an observation.
4. Iterate: step 1 on the new observation; one tool call per iteration.
5. Submit Results: emit the structured output matching this subagent's contract.
6. Enter Standby: wait for the orchestrator's next instruction.
</agent_loop>
```

One tool call per iteration is enforced **inside** a subagent. Parallelism
lives at the orchestrator tier — the orchestrator fans out to multiple
subagents concurrently, but each subagent runs a disciplined single-action
loop so observations, rollback points, and logs stay clean.

## Feature flag

Wired behind `USE_MODULAR_AGENTS` (default `false`). When off, Launcher runs
the legacy inline prompts unchanged. When on, the loader assembles prompts
from this directory. Flip per-environment via Vercel env vars; flip at
runtime via `/api/flags`.

## Editing rules

- **Knowledge changes** → commit to `shared/knowledge/`. No code deploy
  needed — the next cold start (or `/api/flags` refresh) picks them up.
- **Policy changes** → commit to `shared/policies/`. Review required;
  these are the rules that protect against runaway behavior.
- **Tool schema changes** → edit the relevant `tools.json`. The description
  field is where policy lives; treat edits there as policy edits.
- **Adding a subagent** → copy `subagents/provisioner/` as the template.
  Keep the three-file structure.

## Phase 2+ (not yet implemented)

- Planner module split onto Haiku 4.5 for cost reduction on long runs
- Datasource module as a unified query interface over Neon + SuiteDash + GitHub
- Event-stream replay for resume-from-crash and time-travel debugging

See `docs/AGENT_ARCHITECTURE.md` for the full roadmap.
