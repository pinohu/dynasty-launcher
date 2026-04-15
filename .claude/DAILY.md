# DAILY Surface — dynasty-launcher

Curated shortlist produced by `/agent-sort` + `/workspace-surface-audit`. These are the ECC + gstack skills, agents, rules, commands, and hooks that load by default for this repo. Everything off-stack lives in `.claude/skills/skill-library/SKILL.md`.

Rule: **every DAILY entry cites concrete evidence.** Don't promote off-stack skills without a repo-level reason.

## Stack evidence

- JavaScript ESM only (22 .js files, Node 20)
- 178 HTML files (vanilla monoliths — `index.html`, `app.html` ~27k lines, 160+ deliverables pages)
- Vercel serverless (18 endpoints under `api/`)
- Postgres via Neon (`pg` dep)
- Stripe (live), Clerk, Anthropic + multi-provider AI router
- 19 `mod_*` provisioning functions across 17 vendor services
- GTM assets: `maturity.html`, JTBD doc, PAIN_POINT_MASTER_MAP, V4_INVESTOR_FEEDBACK

## DAILY agents (11)

`typescript-reviewer`, `security-reviewer`, `code-reviewer`, `planner`, `architect`, `refactor-cleaner`, `doc-updater`, `e2e-runner`, `performance-optimizer`, `healthcare-reviewer`, `build-error-resolver`

## DAILY skills (55)

**Runtime + architecture**
`claude-api`, `backend-patterns`, `api-design`, `mcp-server-patterns`, `postgres-patterns`, `frontend-patterns`, `frontend-design`, `deployment-patterns`

**Testing + verification**
`e2e-testing`, `tdd-workflow`, `verification-loop`, `ai-regression-testing`, `eval-harness`

**Security + compliance**
`security-review`, `security-scan`

**AI pipeline discipline**
`cost-aware-llm-pipeline`, `prompt-optimizer`, `agent-harness-construction`

**Provisioning + integrations**
`api-connector-builder` (direct fit for remaining `mod_*` modules)

**Research + docs**
`deep-research`, `exa-search`, `research-ops`, `documentation-lookup` (via context7)

**Content + GTM**
`content-engine`, `brand-voice`, `article-writing`, `crosspost`, `investor-materials`, `investor-outreach`, `lead-intelligence`, `market-research`, `seo`

**Billing + ops**
`finance-billing-ops`, `customer-billing-ops`, `email-ops`, `messages-ops`, `github-ops`, `terminal-ops`

**Multi-agent orchestration**
`claude-devfleet`, `dmux-workflows`, `autonomous-loops`, `team-builder`, `council`, `santa-loop`

**Skill + session management**
`continuous-learning`, `continuous-learning-v2`, `workspace-surface-audit`, `skill-stocktake`, `skill-create`, `hookify`, `strategic-compact`

**PRP workflow**
`prp-prd`, `prp-plan`, `prp-implement`, `prp-pr`, `prp-commit`

**gstack (role-based sprint skills)**
`/office-hours`, `/autoplan`, `/plan-ceo-review`, `/plan-design-review`, `/plan-devex-review`, `/plan-eng-review`, `/design-consultation`, `/design-review`, `/review`, `/qa`, `/canary`, `/freeze`, `/unfreeze`, `/land-and-deploy`, `/ship`, `/retro`, `/learn`, `/investigate`, `/browse` (Playwright headless browser built by `./setup`)

## DAILY rules (3 dirs)

- `rules/common/*` — universal baselines
- `rules/web/*` — CSP, XSS, anti-template design, performance
- `rules/typescript/*` — JS parity (no `rules/javascript/` exists; TS rules cover it)

## DAILY commands (20)

`/plan`, `/checkpoint`, `/aside`, `/resume-session`, `/save-session`, `/code-review`, `/review-pr`, `/test-coverage`, `/update-docs`, `/update-codemaps`, `/refactor-clean`, `/build-fix`, `/quality-gate`, `/feature-dev`, `/e2e`, `/tdd`, `/verify`, `/hookify`, `/harness-audit`, `/projects`

## DAILY hooks (active via `.claude/settings.json` → `ECC_HOOK_TIER=standard`)

**PreToolUse**
- `pre:bash:block-no-verify` — protect pre-commit/commit-msg/pre-push hooks
- `pre:bash:commit-quality` — staged lint + commit message format + secret scan
- `pre:bash:git-push-reminder` — review diff before push
- `pre:write:doc-file-warning` — warn on non-standard doc files
- `pre:edit-write:suggest-compact` — suggest compaction at logical intervals
- `pre:edit-write:gateguard-fact-force` — block first Edit per file, demand investigation
- `pre:config-protection` — block linter/formatter config weakening
- `pre:mcp-health-check` — block calls to unhealthy MCP servers

**PostToolUse**
- `post:edit:design-quality-check` — warn on template-looking UI drift (178 HTML files)
- `post:edit:console-warn` — CLAUDE.md forbids `console.log` in commits
- `post:governance-capture` — Stripe/Clerk/auth edit tracking (enabled via `ECC_GOVERNANCE_CAPTURE=1`)
- `post:session-activity-tracker` — metrics
- `post:observe:continuous-learning` — instinct capture

**Stop**
- `stop:format-typecheck` — batch format+typecheck at session end (no per-edit churn)
- `stop:check-console-log` — final console.log sweep
- `stop:session-end`, `stop:evaluate-session`, `stop:cost-tracker`, `stop:desktop-notify`

## Not DAILY — see `.claude/skills/skill-library/SKILL.md`

All language-specific skills for Rust/Go/Python/Java/Kotlin/Swift/C++/C#/PHP/Dart/Perl and unrelated domain skills (crypto, logistics, manufacturing, video generation) are kept searchable through the library router.

## Re-audit triggers

Re-run `/agent-sort` if any of these change:
- Repo adopts TypeScript, React, Next.js, or any framework
- Any of the 15 currently-empty `mod_*` vendor keys get filled (new integrations may need new skills)
- Healthcare archetype becomes a priority (promote `healthcare-reviewer`, `healthcare-phi-compliance`, `hipaa-compliance`)
- New `api/*.js` endpoint introduces a service surface not already listed
