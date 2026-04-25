# Known Generation Failures

This file is the permanent regression contract for the `AI Collision Deploy`
failure class. Every listed pattern must be detected before push, repaired
constructively, and verified again before a build can be marked complete.

## AI Collision Deploy Findings

- Duplicate app trees: root `src/app`, root `app`, and `frontend/app` were all generated.
- Wrong domain: the generated console used Ventures/Agents template language instead of RevOS tenants, VPC deployments, integrations, XAI actions, revenue goals, and audit logs.
- Backend drift: FastAPI exposed generic users/models/deployments routes, not `/api/v1` RevOS routes.
- Schema drift: inline backend models, `backend/models.py`, and Alembic migrations disagreed.
- Build masking: generated Next config allowed `ignoreBuildErrors` and `ignoreDuringBuilds`.
- Security placeholders: fallback secrets and demo credentials were emitted.
- Env drift: BYOC, CRM, billing, Terraform, Kubernetes, AWS, JWT/API key, and allowed-origin variables were missing.
- BYOC gap: Terraform and Kubernetes scaffolds were missing even though the product spec made them P0.
- Template residue: temporary files, nested ignored workflows, root auth stubs, generic Tailwind configs, and stale deployment configs survived.
- Deployment verification gap: Vercel readiness, route checks, live content checks, and quality checks were treated as separate warning text instead of a single self-healing completion contract.

## Required Remediation Behavior

- Repair before push whenever the generated file bundle violates the planning contract.
- Repair after deployment failure using the failure class, then re-run verification.
- Prefer patching or regenerating files from the contract; delete only non-canonical duplicate trees, temporary files, and stale template residue.
- Continue with a verified scaffold when vendor credentials are unavailable, but record the degraded module in `BUILD-REPORT.json`.
- Never mark a build complete unless GitHub push, dependency/build, Vercel ready, live content, required routes, and quality contract all pass.

## Regression Coverage

The `npm run test:generated-repair` script loads the local AI Collision fixture
when available and falls back to a representative broken fixture in CI. It must
prove the detector catches this failure class, the remediator fixes it, and the
final verifier passes.
