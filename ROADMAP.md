# Roadmap — deferred / multi-session work

Tracks high-value integrations that landed partially or were explicitly deferred from the current session so a future session (or reviewer) can pick them up without re-deriving the plan.

## Shipped this session (infrastructure in place, ready to wire into call sites)

- **Vercel AI SDK + Zod typed structured output** — `api/ai-sdk.js`, `api/_schemas.js`. New endpoint alongside the legacy `api/ai.js`. Schemas exist for: viability scorecard, pivot proposal, cross-review ballot, framework synthesis, Vercel build diagnostic, devil's critique.
- **Langfuse tracing** — `api/_langfuse.js`. Wired into `generateTyped()` in `api/ai-sdk.js`. No-op when `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` are absent.
- **Firecrawl deep content** — added to `api/research.js` as a new source alongside Exa, plus two on-demand actions (`scrape_url`, `firecrawl_search`). Gracefully falls back when `FIRECRAWL_API_KEY` is absent.
- **promptfoo regression evals** — `promptfooconfig.yaml` + `.github/workflows/prompt-eval.yml`. Covers viability scoring and pivot-proposal prompts with a golden set. Skips in CI when no provider keys are configured.
- **Biome** — `biome.json` at repo root. Scripts: `npm run lint`, `npm run lint:fix`, `npm run format`. Also injected into the generated customer template.
- **shadcn/ui bootstrap in generated apps** — template generator now writes `components.json`, `src/lib/utils.ts`, and peer dependencies (`class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`) so `npx shadcn add <component>` works immediately in customer repos.
- **T3 stack opt-in** — set `?tmpl=t3` in the URL (or `localStorage.setItem('dynasty_template_t3', 'true')`) to fork `dynasty-t3-template` instead of the SaaS boilerplate. Falls back to the existing template if the T3 mirror isn't reachable.
- **Vercel AI Chatbot scaffolding in `mod_chatbot`** — `src/app/api/chat/route.ts` now ships dormant alongside the static FAQ widget. Activates when the customer sets `GOOGLE_API_KEY` or `OPENAI_API_KEY` in their Vercel env. Uses the Vercel AI SDK `streamText` pattern with the generated FAQ as system-prompt grounding.

## Wire-up work remaining (step 2)

These changes add the infrastructure but the existing callers in `app.html` still use the legacy `aiRawWithModel` + regex-JSON-parse path. Migrating call sites is deliberately separate so the legacy path remains a fallback until the new one proves out:

1. **Scoring pipeline** (`scoreIdea()` in `app.html` around line 3660) → migrate to `POST /api/ai-sdk { action: 'generate_typed', schemaName: 'viability', ... }`.
2. **Pivot review** (`runPivotReview()` in `app.html` around line 4228) → migrate Phase 1 to `generate_typed { schemaName: 'pivot' }`, Phase 2 to `generate_typed { schemaName: 'cross_review' }`, Phase 4 devil's-critique synthesizer to `generate_typed { schemaName: 'devils_critique' }`.
3. **Cross-framework synthesis** (`runCrossFrameworkSynthesis()` in `app.html` around line 3427) → migrate to `generate_typed { schemaName: 'synthesis' }`.
4. **Live pivot-review log** → switch per-model preview writes from the current phase-boundary `pipeLog()` to true token streaming via `POST /api/ai-sdk { action: 'stream', ... }` + SSE consumption. EventSource client code lives under 30 lines.

## Deferred — multi-session projects

These were explicitly not attempted in this session because each is a multi-day refactor with blast-radius across the builder. Plan before tackling.

### Full React migration of `app.html` (~14k lines)
- **Why**: Replace DOM concatenation + 15+ global vars with TanStack Query (server state) + Zustand (client state) + shadcn/ui components.
- **Risk**: Touches every UI surface; rollback cost high if partially done.
- **Prereqs**: Bundler (Vite) and build step for the builder itself. Currently `app.html` is a static file served as-is.
- **Scope-cut first**: Migrate just the pivot-review panel to React, run alongside the legacy UI, prove the pattern, then extend phase by phase.

### T3 stack as the default customer template
- **Why**: Eliminate template-branding-leak failures at the source. The current SaaS boilerplate ships with `Ixartz`, `SaaS Template`, etc. baked in — the 200+ lines of string-replacement in `app.html` exist to strip those.
- **Blockers**: The 10 template component overrides (`src/components/DemoBadge.tsx` → null, `Sponsors.tsx` → null, etc.) and the heroicons → lucide icon map (21 mappings) all assume the boilerplate's file layout. T3's layout is different.
- **Work**: Build a `dynasty-t3-template` GitHub template repo, then rewrite the template-overrides block (`app.html` lines ~10076-10673) to target the T3 layout. Keep the T3 path behind the opt-in flag until proven.

### LangGraph / AutoGen rewrite of the pivot review
- **Why**: Current pivot review is imperative promises with no state persistence, no retry-on-single-model-fail, and no checkpointing. A graph-based state machine gives you all three.
- **Prereqs**: LangGraph.js package and a server-side runtime for it (Vercel functions have 300s cap — long debates may need Cloudflare Workers Durable Objects or Inngest).
- **Scope-cut first**: Keep the imperative client-side flow but add Langfuse span boundaries (already wired in `api/ai-sdk.js`) so you get the observability without the framework migration.

### Full shadcn/ui migration of the builder UI
- **Why**: Replace hand-rolled HTML strings in `app.html` with composable React components.
- **Dependency**: Full React migration above. Can't use shadcn/ui in the vanilla-DOM builder directly.
- **Customer apps already benefit** — `components.json` + peer deps now ship in every generated app, so customers can `npx shadcn add <component>` on day one.

### LiteLLM gateway
- **Why**: Centralize provider routing + cost tracking + rate-limit awareness across the 10+ providers currently coded into `api/ai.js`.
- **Deployment**: Python service on Fly.io / Railway / Docker, not in this Vercel repo.
- **When to revisit**: If provider-specific quirks multiply beyond what `resolveProvider()` in `api/ai-sdk.js` cleanly handles.

## Env vars added by this session

Optional — everything works if absent, but functionality unlocks when set:

```
LANGFUSE_PUBLIC_KEY=pk_...
LANGFUSE_SECRET_KEY=sk_...
LANGFUSE_HOST=https://cloud.langfuse.com

FIRECRAWL_API_KEY=fc-...

# Promptfoo CI eval (any one is enough; multiple = more model coverage)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
```

All existing env vars continue to work unchanged.
