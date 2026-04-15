# Category 45 — AI Agent & Workflow Orchestration

10 automations. Meta-automations. They orchestrate, observe, and extend the other 343 automations.

## Automations

| ID | Title | Trigger | Topology | Notes |
|---|---|---|---|---|
| 45.01 | AI Orchestrator Agent | on-demand | T2 | Takes natural-language instructions → composes existing automations |
| 45.02 | Multi-Agent Task Decomposition | on-demand | T2 | Breaks a goal into subtasks; assigns to agents |
| 45.03 | Automation Suggester | cron weekly | T1 | Proposes new automations based on tenant's data |
| 45.04 | Error Recovery Agent | webhook | T3 | Catches failures; retries with modified approach |
| 45.05 | Feedback Loop Analyzer | cron weekly | T1 | Reads outcomes; suggests manifest tweaks |
| 45.06 | Cost Guardian | cron daily | T1 | Monitors LLM/SMS/email spend; throttles |
| 45.07 | Observability Agent | cron hourly | T1 | Aggregates health metrics |
| 45.08 | Natural Language Query → Report | on-demand | T2 | Ask: "How many leads from LinkedIn last week?" → CRM query |
| 45.09 | Tenant Onboarding Copilot | interactive | T2 | Guides the tenant through their own setup |
| 45.10 | Automation Composer | on-demand | T2 | Designs new automations from templates |

## Why Cat-45 is a category, not a framework

These automations could arguably *be* the deployer. But they're in the catalog because they're **tenant-facing** — running inside the tenant's infra, acting on the tenant's data, under the tenant's control. The deployer provisions them; they don't provision the deployer.

This separation matters:

- **Deployer's orchestration logic** (interview, plan, provision) lives in `deployer/lib/`. It runs on the operator's machine.
- **Cat-45 agents** run on the tenant's Vercel/n8n, with the tenant's keys, observing the tenant's business.

## Safety model

Cat-45 automations introduce **systemic risk** — one misbehaving orchestrator can fire 20 other automations. Guardrails:

1. **Hard token caps** per run (default 50K tokens) and per day (default 500K tokens).
2. **Action whitelist** — 45.01 can only invoke automations in the tenant's `deployed-automations.yaml`; cannot introduce new ones without operator approval.
3. **Audit log** — every 45.* action is logged to `tenants/<slug>/history/agent-<id>/` with input, output, and side-effects list.
4. **Pause switch** — `deployer agent-pause --tenant X` halts all Cat-45 automations while preserving other automations.
5. **Human-in-the-loop** — 45.02's subtasks that touch `customer_pii` or `financial` data require operator approval before execution.

## LLM requirements

All Cat-45 automations require an LLM. The tenant's choice:

- **OpenAI GPT-4/5** — highest quality, highest cost.
- **Anthropic Claude** — good for complex reasoning, mid cost.
- **Groq llama-3.3/Gemma** — fastest, lowest cost, quality trade-off.
- **Self-hosted Ollama** — zero cost, requires tenant infra.

The manifest lets tenants pin a model per automation (e.g., 45.01 on Claude, 45.07 on Groq for cost). Default model per automation is set in `registry/llm-defaults.json`.

## 45.01 — the star automation

The AI Orchestrator Agent is the primary Cat-45 value prop. Its behavior:

1. Receives a natural-language instruction (e.g., "When a lead hits score 80, have the closest tech call them within 30 minutes").
2. Decomposes into existing automations: `3.01 (score) → 38.01 (dispatch by location) → 14.02 (voice call)`.
3. Produces a chain manifest.
4. Surfaces the chain to the operator for approval.
5. Deploys it as a new "chain automation" tied to 45.01.

Outputs are tracked in `tenants/<slug>/chains/<chain-id>.yaml`.

## Cost Guardian (45.06) is non-negotiable

Every tenant that deploys any other Cat-45 automation **must** also deploy 45.06 (cost guardian). The manifest has a hard `depends_on: ['45.06']` enforced by the planner.

45.06 monitors spend per LLM/SMS/email vendor, alerts at thresholds, and auto-throttles or pauses the offending automation.

## Observability (45.07)

Emits structured events to `tenant.observability_endpoint` (default: none, events stay in n8n). Optionally publishes to the deployer's opt-in heartbeat for aggregated operator dashboards.

## Recommended bundle

Tenants who want Cat-45:

- 45.06 Cost Guardian (required)
- 45.07 Observability (strongly recommended)
- 45.01 Orchestrator (the value)
- 45.09 Onboarding Copilot (for Startup Sam personas — lowers self-serve barrier)
- Optionally 45.03 Suggester for growth-stage tenants

~5 automations. Needs LLM budget of ~$50–$300/mo depending on scale.

## Anti-patterns

- Deploying 45.01 without 45.06 → runaway spend. Planner refuses.
- Giving 45.01 carte blanche over `customer_pii` automations → human approval required.
- Running 45.02 on a large goal with deeply nested subtasks → token explosion. Hard cap enforced.
- Using 45.05 (feedback analyzer) as a replacement for deployer `plan` revisions → audit trail loss. Analyzer only suggests; operator decides.

## Related categories

- Every other category — Cat-45 can invoke any of them.
- Cat-23 (Reporting) — 45.07 extends 23.01.
- Cat-45 is the reason 45.06 and 45.07 exist; they are self-referential.
