# Deploying Your Deputy

Two ways to deploy. Pick one.

---

## Option A — Vercel Dashboard (2 minutes, no code)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository**
3. Select `pinohu/dynasty-launcher`
4. Set team to your Dynasty team
5. Add environment variable:
   ```
   ANTHROPIC_API_KEY = sk-ant-...
   ```
6. Click **Deploy**

Done. Your URL: `dynasty-launcher.vercel.app`

To add a custom domain like `launch.sitbid.com`:
- Vercel dashboard → Project → Settings → Domains → Add `launch.sitbid.com`
- Add CNAME record in DNS: `launch` → `cname.vercel-dns.com`

---

## Option B — Automated via GitHub Actions (one-time setup)

### Step 1: Get your Vercel token
Go to [vercel.com/account/tokens](https://vercel.com/account/tokens) → Create token → Copy it

### Step 2: Add to GitHub Secrets
Go to [github.com/pinohu/dynasty-launcher/settings/secrets/actions](https://github.com/pinohu/dynasty-launcher/settings/secrets/actions)
→ New repository secret → Name: `VERCEL_TOKEN` → Paste token → Save

### Step 3: Create Vercel project
Go to [vercel.com/new](https://vercel.com/new) → Import `pinohu/dynasty-launcher` → Add `ANTHROPIC_API_KEY` env var → Deploy once manually

### Step 4: Add project ID to GitHub secrets
Vercel dashboard → Project → Settings → General → Copy **Project ID**
Add as GitHub secret: `VERCEL_PROJECT_ID`

After this, every push to `main` auto-deploys. Claude Code changes deploy in 60 seconds.

---

## Option C — Give Claude your Vercel token

Tell Claude: "My Vercel token is `vercel_...`"

Claude will create the project, set the API key, and trigger the first deployment via API. No manual steps.

---

## Environment Variables Required

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com/account/keys](https://console.anthropic.com/account/keys) |

The GitHub token used by the launcher is entered in the UI settings panel — not stored in the deployment.
