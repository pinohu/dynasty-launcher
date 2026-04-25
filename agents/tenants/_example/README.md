# Example tenant — agents/tenants/_example

This directory demonstrates the tenant-scoped knowledge/policy override
pattern. Real tenants get a directory named by their tenant_id (e.g.
`agents/tenants/acme-digital/`).

## Override model

The prompt-loader reads files from `agents/` by default. When invoked with
a `tenantId`, it first looks under `agents/tenants/<tenantId>/` and
falls back to the shared default when the tenant doesn't override the file.

Override per-file, not all-or-nothing. A tenant that wants to change only
the blue-ocean framework commits only
`tenants/<id>/knowledge/blue-ocean-framework.md` and inherits every other
shared file unchanged.

## Directory shape

```
agents/tenants/<tenant_id>/
  knowledge/        # override agents/shared/knowledge/*
  policies/         # override agents/shared/policies/*
  subagents/        # override agents/subagents/<name>/{loop,modules,tools}
```

Files omitted from the tenant directory resolve to the shared default.

## Creating a new tenant

1. `mkdir -p agents/tenants/<tenant_id>/knowledge agents/tenants/<tenant_id>/policies`
2. Copy the files you want to override from `agents/shared/` and edit.
3. Pass `tenantId: '<tenant_id>'` to `loadAgent()`.

No code changes required — the loader resolves tenant directories by
convention.

## This example

`knowledge/dynasty-principles.md` below demonstrates an override that
narrows Principle 1 (deploy-live-first) to a single allowed target
platform. A real agency tenant might use this to constrain their
version of Launcher to, say, WordPress-only deploys.
