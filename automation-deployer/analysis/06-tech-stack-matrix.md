# 06 — Tech Stack Matrix

Which vendor APIs / tools are needed to run which automations, what they cost, and what their failure modes are.

## Vendor catalog (excerpt — full in `registry/stacks.json`)

### Core orchestration

| Tool | Role | Cost tier | OSS? | Used by automations |
|---|---|---|---|---|
| n8n | Workflow engine | Self-host free or n8n.cloud ($20+) | Yes | ~270 / 353 |
| Vercel | Serverless + hosting | Free tier → $20+ | No | ~120 |
| GitHub | Code + CI | Free tier | No | All (source of truth) |
| Neon | Postgres | Free tier → $19+ | OSS core | ~47 |

### CRM / portal

| Tool | Role | Cost | Used by |
|---|---|---|---|
| SuiteDash | CRM + portal | $19–$99 | ~110 |
| HubSpot | CRM (alt) | Free–$800+ | alt for ~30 |
| ServiceTitan | Field-service (alt) | $200+ | alt for ~18 |
| Brilliant Directories | Directory | $75+ | specialized (2–5) |

### Communications

| Tool | Role | Cost | Used by |
|---|---|---|---|
| Emailit | Transactional | $10+ | ~85 |
| Acumbamail | Marketing email | $15+ | ~38 |
| SMS-iT | SMS | $29+ | ~22 |
| Twilio | SMS/voice (alt) | Pay-per-use | alt for ~22 |
| CallScaler | Call tracking | $49+ | ~12 |
| Insighto | Voice AI | $29+ | ~14 |
| Thoughtly | Voice AI (alt) | $99+ | alt for ~14 |
| Chatbase | Website chat | $19+ | ~8 |

### Money

| Tool | Role | Cost | Used by |
|---|---|---|---|
| Stripe | Payments | % | ~40 (hard dep) |
| Documentero | PDF docs | $15+ | ~15 |
| SparkReceipt | Expense OCR | $9+ | ~4 |
| QuickBooks Online | Books | $30+ | ~18 |
| Xero | Books (alt) | $15+ | alt for ~18 |

### Marketing

| Tool | Role | Cost | Used by |
|---|---|---|---|
| WriterZen | SEO research | $39+ | ~7 |
| NeuronWriter | SEO writing | $19+ | ~6 |
| Vadoo AI | Video from text | $29+ | ~3 |
| Fliki | Video (alt) | $28+ | alt for ~3 |
| Vista Social | Social scheduling | $39+ | ~4 |
| Plerdy | Analytics/heatmap | $23+ | ~5 |
| PostHog | Product analytics | Free tier–$450 | ~8 |

### Data / LLMs

| Tool | Role | Cost | Used by |
|---|---|---|---|
| Groq | Fast open-weights LLM | Free tier / pay | ~42 |
| OpenAI | LLM | Pay-per-token | ~35 |
| Anthropic | LLM | Pay-per-token | ~28 |
| Google AI Studio | Gemma / Gemini | Free tier | ~25 |
| Hunter.io | Email finder | $49+ | ~8 |
| Outscraper | Maps scraper | $39+ | ~6 |
| BuiltWith | Tech detector | $295+ | ~3 |

### Field & industry-specific

| Tool | Role | Used by |
|---|---|---|
| Trafft | Booking | ~8 |
| Lob | Direct mail | ~4 |
| PropStream | Real estate data | ~2 |
| PACER | Court records | ~2 |
| PA DOS | Secretary of State | ~5 (PA-specific) |

## Tenant "stack readiness" scoring

When a tenant fills out `infra:` in `tenant.yaml`, the deployer computes a **stack-readiness score** per automation:

```
stack_readiness(tenant, automation) =
  (count of automation.stack tools that tenant owns or is willing to adopt) /
  (total tools in automation.stack)
```

Automations with readiness < 0.5 are filtered from the selection by default. The operator can override.

## Tool adoption classes

| Class | Tools | Adoption cost |
|---|---|---|
| **Assumed present** | n8n, Vercel, GitHub | Free–$40/mo (expected to exist) |
| **Core add-ons** | SuiteDash, Emailit, Stripe | $40–$150/mo combined |
| **Marketing pack** | Acumbamail, WriterZen, Vista Social, PostHog | $60–$120/mo |
| **Voice pack** | CallScaler + Insighto OR Thoughtly | $78–$148/mo |
| **Data pack** | Neon, Outscraper, Hunter.io | $100–$150/mo |
| **Industry** | Trafft (booking), ServiceTitan (HVAC/plumbing), Lob (mail) | Varies |

The interview surfaces the relevant classes as opt-in groups based on which categories the persona prefers.

## Credential failure modes

| Vendor | Typical failure | Deployer behavior |
|---|---|---|
| Stripe | Webhook signature mismatch | Abort deploy; surface exact expected signature; suggest rotation |
| OpenAI/Anthropic | Rate limit | Backoff + note in plan; optionally fall back to Groq/Cerebras |
| n8n | Auth token expired | Abort deploy; prompt for new JWT; keep workflow JSON in pending state |
| Google APIs | Scope missing | Surface the OAuth scope needed; abort deploy with clear error |
| Twilio | A2P registration gap | Mark SMS automations as "pending registration"; deploy non-SMS parts |

Each failure mode is a stable class with a known remediation — the deployer points the operator at a runbook in `deployer/runbooks/<vendor>.md` (not all authored yet but structure exists).

## Cost transparency

`deployer plan` outputs an estimated monthly cost for the selected automations, computed from:

- Fixed vendor subscriptions required (SuiteDash, Stripe, etc.).
- Metered costs (LLM tokens × frequency, SMS × expected volume, etc.).
- A 25% safety margin.

Tenants see the cost line item per automation before committing.

## Consolidation opportunities

Several tools in the catalog are redundant — two do the same job. The deployer exposes these as `replaces:` relationships:

- CallScaler/Insighto/Thoughtly — pick one voice stack.
- Vadoo/Fliki — pick one video AI.
- QBO/Xero — pick one accounting.
- Emailit/Mailgun/Postmark — pick one transactional email.
- Acumbamail/Mailchimp/Beehiiv — pick one marketing email.

The selector enforces single-pick per category.
