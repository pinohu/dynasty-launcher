# Category 1 — Lead Generation & Prospecting

20 automations. Largest category. Dominated by T5 (out-of-band worker) topology because most sources are public sites with IP/rate concerns.

## Automations

| ID | Title | Trigger | Topology | Notes |
|---|---|---|---|---|
| 1.01 | Google Business Profile Monitor | cron daily | T1 | API-based; n8n can own it |
| 1.02 | Competitor New Review Alert | cron 6h | T5 | Scraper; worker required |
| 1.03 | New Business Filing Alert | cron daily | T5 | State SOS API or scrape |
| 1.04 | Expired License/Permit Prospector | cron weekly | T5 | Public license DBs |
| 1.05 | Social Media Keyword Listener | realtime | T5 | Polling-based worker |
| 1.06 | Google Maps Scraper by Category + Location | on-demand | T5 | SerpAPI/Outscraper |
| 1.07 | Yelp Category Scraper | on-demand | T5 | Yelp API |
| 1.08 | Craigslist Service Post Monitor | cron 4h | T5 | RSS / scrape |
| 1.09 | Indeed/LinkedIn Job Posting Prospector | cron daily | T5 | Indeed MCP |
| 1.10 | Website Technology Detector | on-demand | T2 | BuiltWith API |
| 1.11 | Domain Expiry Prospector | cron weekly | T1 | WHOIS |
| 1.12 | Facebook Ad Library Scanner | cron daily | T5 | FB Ad Lib API |
| 1.13 | B2B Email Finder from Domain | on-demand | T2 | Hunter/Apollo |
| 1.14 | Cold Outreach Sequence Launcher | on-trigger | T3 | Acumbamail + n8n |
| 1.15 | Direct Mail Trigger | CRM event | T4 | Lob API |
| 1.16 | Networking Event Finder | cron weekly | T5 | Eventbrite/Meetup scrape |
| 1.17 | Permit Application Monitor | cron daily | T5 | Municipal open data |
| 1.18 | Property Sale Trigger | cron daily | T5 | County recorder / PropStream |
| 1.19 | Bankruptcy/Lien Filing Monitor | cron weekly | T5 | PACER |
| 1.20 | Referral Source Activity Tracker | cron weekly | T1 | CRM analysis |

## Deployment considerations

### Jurisdictional scope
- 1.03 (SOS filings), 1.04 (licenses), 1.17 (permits), 1.18 (property sales), 1.19 (court filings) are **per-state** or **per-county**. The deployer exposes these via `deployer/lib/adapters/jurisdictions/<state>.mjs`. PA is implemented; other states are stubs.
- Tenant must supply `target_jurisdictions:` in their `tenant.yaml` (e.g., `["PA", "NJ"]`).

### Rate-limit etiquette
- T5 workers namespace requests per source and throttle globally (not per-tenant) to respect source rate limits. Fair-share scheduling means a single tenant can't monopolize Craigslist scraping.
- Each source has a cooldown config in `registry/sources.json`.

### Data freshness vs cost
- Daily crons are the default. Tenants who want hourly for 1.01/1.02 can override in manifest config but pay per additional run.

### Source TOS
- 1.07 (Yelp) — Yelp Fusion API is preferred; scraping violates TOS.
- 1.08 (Craigslist) — RSS feed only; no HTML scraping.
- 1.09 (LinkedIn) — LinkedIn prohibits scraping; use LinkedIn's own Talent APIs or licensed Indeed data.

The deployer refuses to deploy automations whose source TOS makes the access pattern non-compliant unless the tenant provides evidence of alternative access (e.g., "we have LinkedIn Recruiter API access").

### Deliverability of outputs
- All Cat-1 automations push results into the tenant's CRM (SuiteDash/HubSpot) with a `source: "cat-1-<id>"` tag.
- Duplication is handled by 4.02 (dedup). Operators who select Cat-1 automations are prompted to auto-include 4.02.

## Recommended bundles

- **Prospecting-Starter (3):** 1.01 + 1.13 + 1.14 — monitor your own GBP, find emails for target domains, launch cold outreach.
- **Local Prospecting (5):** 1.01 + 1.02 + 1.06 + 1.17 + 1.18 — specifically for local-service businesses (plumbers, cleaners).
- **Compliance-led Prospecting (4):** 1.03 + 1.04 + 1.11 + 1.19 — signal-driven lead sources for compliance, accounting, legal services.

## Anti-patterns

- Deploying more than 5 Cat-1 automations at once floods the CRM and overwhelms sales follow-up. Selector warns when Cat-1 count > 5.
- Deploying 1.06 + 1.07 simultaneously often duplicates leads. `conflicts_with` edge between 1.06 and 1.07 encoded in registry.

## Reference metrics (from PA CROP inventory)

- 1.01 equivalent runs daily; avg 3 events/month.
- 1.14 (cold outreach) delivers typical agency reply rates of 3-5%.
- 1.15 (direct mail) costs $0.80-$1.20 per send (Lob).

## What to check in the tenant's data before deploying

- Does the tenant already have a CRM? If not, deploy SuiteDash or HubSpot first (covered by category 4).
- Does the tenant have an outreach email address warmed up? If not, warn that 1.14 has low success for cold domains.
- Does the tenant have Hunter/Apollo/Snov.io credits? Pre-flight check for 1.13.
