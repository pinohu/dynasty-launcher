# 07 — Dependency Graph

How automations depend on each other, and how the planner resolves deployment order.

## Edge types

Defined formally in `analysis/02-automation-taxonomy.md` §R1–R5. Summary:

| Edge | Semantics | Planner behavior |
|---|---|---|
| `depends_on` | B cannot run without A | Topologically deploy A before B |
| `enhances` | B is more useful when A is present | Surface suggestion in interview |
| `replaces` | A and B are alternatives | Refuse both; force pick |
| `chains_with` | A's output commonly feeds B | Pair in UX, no hard rule |
| `conflicts_with` | A and B both deployed causes double-fire | Refuse both; force pick |

## Depended-upon hubs (high-degree nodes)

The following automations are depended on by many others. They are essentially "prerequisites for the rest of the catalog":

| Automation | Depended-upon count | Why |
|---|---|---|
| 2.01 Web form → CRM | ~40 | Creates the CRM record every downstream automation uses |
| 4.01 CRM sync | ~35 | Normalizes the CRM graph |
| 15.01 Invoice gen on Stripe webhook | ~25 | Starts the money lifecycle |
| 41.01 MFA / auth hardening | ~20 | Security prerequisite for PII-touching automations |
| 40.01 Contact enrichment | ~18 | Fills gaps in CRM records |
| 22.01 Ticketing / help-desk base | ~15 | Needed before 22.04 triage, 22.07 escalation |
| 23.01 Weekly ops digest (scaffolding) | ~12 | Many dashboards extend this |
| 45.01 AI orchestrator agent | ~10 | Meta-automation that calls others |

The deployer treats these as "foundations" and will refuse to deploy downstream automations if the foundation isn't also selected, offering to auto-add it.

## Typical depth

A deployment plan is rarely deeper than 4 levels. E.g.:

```
Level 0: 2.01 Web form → CRM
Level 1: 3.01 Lead scorer (depends on 2.01)
Level 1: 8.01 Welcome sequence (depends on 2.01)
Level 2: 5.01 Pipeline auto-advance (depends on 3.01)
Level 2: 8.02 Portal access (depends on 8.01)
Level 3: 5.04 Stalled-deal follow-up (depends on 5.01)
```

Large plans (Growth-10, Full-Stack-40+) max out around 5 levels.

## Cycles

The catalog has no legitimate cycles. If the parser finds one, it's a data bug. `scripts/validate.mjs` fails CI on cycles.

## Co-deploy clusters

Some automations are almost never deployed alone. The selector suggests them as clusters:

### C1 — Intake cluster
2.01 + 2.03 + 3.01 + 4.01 + 8.01

### C2 — Money cluster
15.01 + 16.01 + 16.04 (dunning) + 17.01 (books sync)

### C3 — Retention cluster
31.01 + 31.03 + 32.01 + 29.01 + 30.01

### C4 — Content cluster
24.01 + 24.03 + 25.01 + 26.01 + 28.01

### C5 — Field-ops cluster (for Field Service Fred)
9.01 + 9.03 + 11.01 + 11.04 + 14.06 + 38.01 + 38.03

### C6 — Compliance cluster (for Compliance Carol)
20.01 + 20.03 + 20.05 + 35.01 + 37.01 + 43.01

### C7 — Agency delivery cluster
5.01 + 6.01 + 7.01 + 8.01 + 10.01 + 23.03 + 39.01

Clusters live in `registry/clusters.json`.

## Deploy order algorithm

```
1. Input: selected-automations.yaml (set S)
2. For each a in S, load a.depends_on; add to S transitively (auto-complete). Ask operator to confirm any auto-added.
3. Build DAG G = (S, edges from depends_on)
4. Kahn's algorithm topological sort → ordered list L
5. Group L by "deploy wave" = longest path from any root (parallelizable waves)
6. For each wave, deploy all automations in parallel (with max concurrency from tenant.yaml, default 4)
7. If any in a wave fails, wait for in-flight to complete, then halt (do not start next wave)
```

The wave grouping lets the deployer parallelize safely while respecting dependencies. A Growth-10 plan typically resolves to 3–4 waves of 2–4 automations each.

## Incremental deploys

When a tenant adds a new automation later:

```
1. Compute the new automation's transitive deps
2. Diff against already-deployed automations
3. Plan only the delta
4. Preserve all existing credentials and configurations
5. Deploy the delta
```

This means an existing tenant can grow from Starter-3 to Growth-10 to Full-Stack-40 without re-deploying anything already running.

## Removal / uninstall

```bash
npx automation-deployer uninstall --tenant acme --automation 1.01
```

Uninstall rules:
1. Refuse if another deployed automation depends on it (show the dependents).
2. Run the automation's `rollback:` steps.
3. Update `deployed-automations.yaml`.
4. Keep the artifacts in `tenants/<slug>/history/uninstalled/` for 30 days for recovery.
