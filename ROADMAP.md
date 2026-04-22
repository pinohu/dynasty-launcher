# Roadmap — shipped and remaining work

Tracks the improvement program across sessions. "Shipped" means merged to main; "wire-up" means infrastructure is in place but a legacy fallback still runs; "deferred" means not yet attempted and what the blocker is.

## Shipped to main

### Infrastructure (from session 2)
- **Vercel AI SDK + Zod typed output** — `api/ai-sdk.js`, `api/_schemas.js`. Endpoints: `/api/ai-sdk` with `generate_typed`, `stream`, `generate_text` actions. Multi-provider fallback chain (OpenAI, Anthropic, Google, Groq, OpenRouter). Gracefully disabled providers when keys absent.
- **LiteLLM gateway option** — set `LITELLM_BASE_URL` (+ optional `LITELLM_API_KEY`) to route every model-id through a centralized gateway instead of vendor-specific SDKs.
- **Langfuse tracing** — `api/_langfuse.js`. Every typed generation records model, usage, latency, input/output. No-op when `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` are absent.
- **Firecrawl deep content** — added to `api/research.js` as a source for TAM/SAM/SOM + competitive-matrix grounding. Actions: `scrape_url`, `firecrawl_search`.
- **promptfoo regression evals** — `promptfooconfig.yaml` + `.github/workflows/prompt-eval.yml`. Runs `npm run test:prompts`. Skips when no provider keys in CI secrets.
- **Biome** — `biome.json` + `npm run lint`/`lint:fix`/`format`.

### Call-site wire-up (session 3)
- **Scoring** now calls `aiTyped('viability', …)` before the legacy raw path. When typed succeeds, the whole regex-JSON-parse pipeline is skipped. Legacy `aiRaw` remains as fallback.
- **Pivot review Phase 1** calls `aiTyped('pivot', …)` first, then legacy `aiRawWithModel` if typed fails.
- **Cross-framework synthesis** calls `aiTyped('synthesis', …)` first.

### New endpoints (session 3)
- **`/api/pivot-graph`** — LangGraph.js-based server-side pivot review. 4-node graph (propose → cross_review → consensus → devils). SSE streaming progress. Falls back to sequential node execution if `@langchain/langgraph` isn't installed. Client-side `runPivotReview()` is still the default — this endpoint gives a stateful-graph alternative for future migration.
- **`/api/template`** — serves the bundled T3 stack as a file manifest. `GET ?tmpl=t3` → full manifest, `?tmpl=t3&file=<path>` → single file. Builder pulls this during frontend-file generation when `?tmpl=t3` is set.

### Customer-template improvements (session 3)
- **Shadcn components pre-seeded** — every generated app ships `src/components/ui/{button,card,input,label,badge,dialog}.tsx` (verbatim shadcn new-york style) + Radix peer deps. No need to run `shadcn add` before first build.
- **T3 stack overlay when opted in** — `?tmpl=t3` URL param (or `localStorage.dynasty_template_t3 = 'true'`) makes the builder pull the bundled T3 manifest and seed all scaffold files. No external GitHub template repo needed; scaffold is inlined in `api/template.js`.
- **Biome config + scripts in every generated app** — customer builds benefit from Rust-speed linting.

### React-pattern pilot (session 3)
- **`/react-pivot-panel.mjs`** — Preact + htm pivot-review panel rendered at the pipeline screen. Activated by `?ui=react` or `localStorage.dynasty_ui_react = 'true'`.
- **`showPipelineUI`, `updateModelStatus`, `pipeLog`** forward to the Preact component when the flag is on. Hidden DOM stubs catch legacy vanilla `.className` / `.textContent` writes and a MutationObserver bridges them to Preact phase state, so the legacy pivot flow keeps working unchanged.
- **Default path unchanged** — the vanilla DOM renderer stays the production path until the pilot is validated and expanded.

## Wire-up remaining (step 3)

These land incrementally; legacy paths still work:

1. **Pivot Phase 2 (cross-review)** → migrate to `aiTyped('cross_review', …)`.
2. **Pivot Phase 4 devil's critique synthesizer** → `aiTyped('devils_critique', …)`.
3. **Streaming tokens in the live log** — switch from phase-boundary `pipeLog()` to true token streaming via `POST /api/ai-sdk { action: 'stream' }` + SSE consumption.
4. **Expand the Preact pilot** to the scorecard + refinements panels; add one-file-per-surface React migration with the shim pattern proven in the pivot panel.

## Explicitly deferred

### Full React migration of `app.html` (~14k lines of vanilla JS)
- **Why deferred:** the pilot proves the pattern but migrating every surface in one session ships broken UI to production. The shim approach (hidden DOM stubs + MutationObserver bridge) lets us migrate surface-by-surface without a bundler.
- **Recommended path:** add a Vite-based builder-v2 at `/builder` while keeping `/app` stable. When builder-v2 reaches parity, swap the default.

### T3 stack as the default customer template
- **Why deferred:** flipping the default breaks the existing template-override code that targets the SaaS-boilerplate file layout (heroicons map, Sponsors.tsx nullification, [locale] path overlays). Needs a parallel set of T3-targeted overrides.
- **Current state:** T3 is opt-in and fully functional when selected. The SaaS-boilerplate path remains the default.

### Full LangGraph rewrite of the client-side pivot flow
- **Why deferred:** the client-side flow uses rapid progressive UI updates that graph semantics can't drive without a persistent runtime (Durable Objects, Inngest).
- **Current state:** the server-side graph endpoint (`/api/pivot-graph`) exists and can be consumed by the client for batch/background reviews. The interactive pivot stays client-side.

### Full shadcn/ui migration of the builder UI
- **Why deferred:** depends on the React migration. Customer apps already ship with shadcn components pre-seeded — the upstream benefit is delivered.

## Env vars that unlock new capabilities

All optional. Everything works gracefully without them.

```
LANGFUSE_PUBLIC_KEY=pk_...
LANGFUSE_SECRET_KEY=sk_...
LANGFUSE_HOST=https://cloud.langfuse.com

FIRECRAWL_API_KEY=fc-...

LITELLM_BASE_URL=https://litellm.example.com/v1
LITELLM_API_KEY=sk-...

# CI prompt eval — any one enables the eval job
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
```

## Opt-in flags

- **`?tmpl=t3`** (or `localStorage.dynasty_template_t3='true'`) — fork into T3 stack instead of SaaS boilerplate.
- **`?ui=react`** (or `localStorage.dynasty_ui_react='true'`) — Preact renderer for the pivot review panel.
