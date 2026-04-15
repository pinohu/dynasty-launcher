# Registry

Machine-readable source of truth for every automation, category, persona, stack, and bundle the deployer knows about.

## Files

| File | Generated? | Description |
|---|---|---|
| `automations.json` | yes | All 353 automations. Regenerate via `node scripts/parse-catalog.mjs`. |
| `categories.json` | yes | 45 categories + their automation IDs. |
| `personas.json` | no | 10 Group-1 personas with budget/goal/pain metadata. Expand to cover Groups 2–5 as needed. |
| `stacks.json` | no | Vendor / tool definitions. |
| `bundles.json` | no | Preset bundles for sale. |
| `relationships.json` | no | `depends_on`, `replaces`, `conflicts_with`, `enhances`, `chains_with` edges. |
| `selection-rules.json` | no | Persona + pain → automation rules for the interview selector. |

## Editing

- `automations.json` and `categories.json` are **generated**. Do not edit by hand; edit the catalog MD and re-parse.
- Everything else is hand-maintained. `npm run validate` (in repo root) checks cross-refs (e.g., `bundles[].automation_ids` all exist in `automations.json`).

## Schema

All files conform to `schemas/*.schema.json`. CI validates via `scripts/validate.mjs`.
