# example-acme-plumbing

Fictional example tenant illustrating a Field-Service / Manager hybrid.

Do not deploy this tenant as-is — it references fake GitHub/Vercel/n8n IDs. Use it as a reference for how a real `tenant.yaml` looks with a reasonable `selected_automations` list.

Walkthrough:

```bash
# Run validate against the registry to confirm all selected IDs exist
automation-deployer validate

# Dry-run plan (no side effects)
automation-deployer plan --tenant example-acme-plumbing

# Planner output shows ~3-4 waves, several automations blocked on missing manifests,
# which is expected — only ~10 exemplar manifests ship with this repo.
```

Replace with a real business config (real GH owner, real Vercel team, real n8n base URL) to run a real deploy.
