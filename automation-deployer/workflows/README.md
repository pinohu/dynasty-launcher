# Workflow artifacts

One artifact per automation that ships code or an n8n workflow JSON. Filename pattern:

- `<id>-<slug>.json` — n8n workflow export (imported via n8n REST API).
- `<id>-<slug>.code.js` — Vercel serverless function source (pushed to tenant repo).
- `<id>-<slug>.n8n.json` — n8n half of a T3 hybrid automation.
- `<id>-<slug>.worker.mjs` — T5 worker source (runs on deployer infra).

## Templating

n8n workflow JSON may contain `{{tenant_slug}}` and `{{$env.*}}` placeholders. The `n8n` driver substitutes `{{tenant_slug}}` at import time; `{{$env.*}}` references map to Vercel env vars set by the `vercel` driver (or to n8n credentials if the workflow runs standalone).

## Shipped exemplars

| File | Topology | Depends on |
|---|---|---|
| `1.01-gbp-monitor.json` | T1 | — |
| `2.01-web-form-to-crm.code.js` | T2 | — |
| `3.01-lead-scorer.code.js` | T2 | 2.01 |
| `8.01-welcome-sequence.code.js` + `.n8n.json` | T3 | 2.01, 15.01 |
| `15.01-invoice-auto-gen.code.js` + `.n8n.json` | T3 | — |
| `20.01-deadline-monitor.json` | T1 | — |

Fill in the remaining ~340 artifacts following the same pattern. Each is a
~100-line JS file or an n8n workflow JSON export.
