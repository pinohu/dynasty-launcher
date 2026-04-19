# Admin Access — Your Deputy

Runbook for unlocking unfettered admin access to yourdeputy.com (builder + admin dashboard).

## What admin unlocks

A valid admin key grants a session with:

- `tier: enterprise`
- `all_modules: true` — every `mod_*` function in `api/provision.js`
- `unlimited_builds: true` — no build quota
- `skip_payment: true` — bypass the Stripe gate on `/app`
- `all_tiers_accessible: true` — test any tier's flow

Token is HMAC-SHA256 signed with the server-side key, TTL 30 days (primary) or 6 months (test), stored in `localStorage.dynasty_admin_token`. Key is never exposed in client code.

Source: `api/auth.js:63-99` (`verify_admin`), `api/auth.js:102-123` (`validate_admin`).

## One-time setup

1. Generate a strong key locally:

   ```bash
   openssl rand -base64 48
   # or
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Vercel → `dynasty-launcher` project → **Settings → Environment Variables**:

   - Name: `ADMIN_KEY`
   - Value: paste the generated string
   - Environments: Production, Preview, Development

3. (Optional) Add `TEST_ADMIN_KEY` as a separate value for long-lived test sessions (6-month TTL vs. 30-day).

4. Redeploy (Vercel redeploys automatically on env var change, or trigger from the Deployments tab).

## Accessing admin

### Admin dashboard — `/admin`

Visit `https://www.yourdeputy.com/admin`. Middleware serves a password prompt (`middleware.js:90-103`); paste the key and hit **Authenticate**. On success, token is stored and the page redirects to `/admin?auth=token` showing:

- System Overview — env var status, DYNASTY_TOOL_CONFIG categories
- Service Health — live checks across all integrated vendors
- Builds / Customers / Payments / Licenses — if Neon is wired (see [Troubleshooting](#troubleshooting))
- Vercel Projects — redeploy or delete any project in the team
- Module Testing — dry-run any of the 17 `mod_*` integrations

### Builder with full privileges — `/app`

Two ways:

1. **Direct URL**: `https://www.yourdeputy.com/app?k=<ADMIN_KEY>` (URL-encode if the key has special chars).
2. **Helper page**: `https://www.yourdeputy.com/app/test-login` (`middleware.js:41-78`) — paste the raw key into a password field, click continue. No manual URL-encoding.

On success, localStorage gets:

```
dynasty_admin_token  = <HMAC token>
dynasty_tier         = enterprise
dynasty_paid_session = admin
dynasty_paid_at      = <ISO timestamp>
```

## Rotation

Rotate the key whenever it leaks or on a regular schedule (90 days recommended):

1. Generate a new value and update `ADMIN_KEY` on Vercel.
2. Redeploy.
3. All existing admin tokens invalidate immediately — HMAC verify fails against the new secret (`api/auth.js:116-117`).
4. Log in again at `/admin` with the new key.

## Rate limiting

`verify_admin` is rate-limited per IP: **8 attempts / 15 minutes** (`api/auth.js:4-6`). Exceed it and you get `429` with `Retry-After: 900`. Validation (`validate_admin`) is not rate-limited — existing tokens re-validate freely.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `503 Admin auth unavailable: no admin keys configured` | `ADMIN_KEY` env var not set or blank. Add it on Vercel and redeploy. |
| `Invalid admin key` on correct paste | Check for trailing whitespace; verify you're on the Production deployment; confirm the env var is enabled for Production. |
| `429 Too many attempts` | You hit the rate limit. Wait 15 min or switch IP. |
| Admin dashboard shows `neon_url: MISSING` | Neon DB is optional for admin auth itself but required for Builds / Payments / Licenses tables. Add `NEON_DATABASE_URL` in Vercel env vars if you want those pages populated. |
| Token works for a while then fails | Token expired (30-day TTL for `ADMIN_KEY`, 6 months for `TEST_ADMIN_KEY`). Log in again. |
| `/app?k=…` flashes and drops you back to the gate | Key mismatch — the browser cleared the token after `validate_admin` returned invalid. Re-check env var value on Vercel. |

## Security notes

- Never commit `ADMIN_KEY` or `TEST_ADMIN_KEY` to git. `.env.example` contains placeholders only.
- The token is a URL-safe HMAC (`prefix:expiry:hash`). It contains no key material; leaking a token exposes one session until expiry, not the master key.
- `/admin` and `/app` are both gated at the edge (`middleware.js`) and verified again server-side (`api/auth.js`). Client-side checks are convenience only.
- Admin tokens grant access to `api/admin` (user create/delete, tier change, project delete, redeploy). Treat a live token like a root password.
