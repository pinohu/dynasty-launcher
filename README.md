# Dynasty Business System Launcher

> Permanent deployment of the Dynasty Empire project launcher. Generates complete deployable business systems in 90 seconds.

## What It Does

- 22 project types across 6 categories
- 5 Claude AI generation calls per project
- 23 files generated and pushed to GitHub automatically
- Flint autonomously provisions infrastructure in background
- MANUAL-ACTIONS.md documents everything requiring human hands

## Files Generated Per Project

**Design System**: DESIGN.md, CLAUDE.md, AGENTS.md, DYNASTY-DESIGN.md  
**Business System**: BUSINESS-SYSTEM.md, AGENT-SYSTEM.md, REVENUE-MODEL.md, GTM-PLAYBOOK.md, FAILURE-MODES.md  
**Backend**: backend/main.py (FastAPI), requirements.txt, Dockerfile, docker-compose.yml  
**Product Docs**: SPEC.md, ROADMAP.md, README.md, MANUAL-ACTIONS.md, .env.example  
**Supporting**: DATA-MODEL.md, API-CONTRACTS.md, KB-OUTLINES.md, DESIGN-DECISIONS.md, .gitignore

## Architecture

```
index.html          ← launcher UI (vanilla JS)
api/claude.js       ← Vercel Edge Function — proxies Anthropic API
vercel.json         ← Vercel config
```

## Environment Variables (Vercel)

```
ANTHROPIC_API_KEY=sk-ant-...
```

## Deploy

```bash
npx vercel --prod
```

---

*Dynasty Empire LLC — Built for multi-generational permanence.*
