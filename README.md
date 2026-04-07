# Dynasty Business System Launcher

> Permanent deployment of the Dynasty Empire project launcher. Generates complete deployable business systems in 90 seconds.

## What It Does

* 22 project types across 6 categories
* 5+ Claude AI generation calls per project
* 23 files generated and pushed to GitHub automatically
* Flint autonomously provisions infrastructure in background
* MANUAL-ACTIONS.md documents everything requiring human hands

## Claude Code Architecture Patterns (v2)

Inspired by patterns exposed in the Claude Code source leak (March 31, 2026), the launcher now implements 8 production-grade agentic patterns:

### 1. Parallel Subagent Execution
Independent build phases run concurrently using a Fork/Teammate model. Cuts build time from ~90s to ~30-45s.

### 2. Smart Model Routing
Each phase routes to the optimal model by complexity tier:
- **Architect** (Opus): Blueprint, design system, business strategy
- **Standard** (Sonnet): Spec docs, backend code, frontend scaffold
- **Fast** (Haiku): Boilerplate files (.env, Dockerfile, .gitignore)

Reduces API cost 40-60% while maintaining quality where it matters.

### 3. Context Compaction
After each phase, outputs are compressed into a compact context object (colors, fonts, entity names, key decisions). This feeds forward to ensure cross-file coherence without burning full token context.

### 4. Tool Registry Pattern
API is modular: `api/ai.js` (multi-provider router), `api/orchestrate.js` (compaction + routing + preflight), `api/memory.js` (project history), `api/flags.js` (feature flags), `api/provision.js` (infrastructure).

### 5. Feature Flags
Inspired by Claude Code's compile-time flags (KAIROS, BUDDY, etc.). Enables gated rollouts, A/B testing prompt strategies, and safe iteration without breaking production.

### 6. Project Memory
Tracks build history in Neon: what was built, what failed, which models worked best, cost per build. Over time, the launcher learns patterns and avoids repeating mistakes.

### 7. CLAUDE.md Read-Back
Reads existing CLAUDE.md from previously generated repos for iterative updates instead of fresh builds.

### 8. Preflight Review
Shows a confirmation modal before GitHub push and infrastructure provisioning with full build plan.

## Architecture

```
index.html              <- launcher UI (vanilla JS + build orchestrator)
api/ai.js               <- multi-provider AI router (7 providers, 25+ models)
api/orchestrate.js      <- compaction engine, smart routing, preflight, CLAUDE.md read-back
api/memory.js           <- project history (Neon Postgres)
api/flags.js            <- feature flag system
api/provision.js        <- infrastructure provisioning (GitHub, Vercel, Neon, 20i, Stripe)
api/health.js           <- credential health checks
api/validate.js         <- output quality validation
vercel.json             <- Vercel config
```

## Deploy

```
npx vercel --prod
```

---

*Dynasty Empire LLC — Built for multi-generational permanence.*
