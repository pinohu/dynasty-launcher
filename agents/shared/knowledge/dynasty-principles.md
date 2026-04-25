# Dynasty Principles

The standing doctrine for every Launcher run. These rules override defaults
from the underlying model's training. When a tool decision conflicts with a
principle, the principle wins.

## 1. Deploy live first

Every run targets a public URL by its last iteration. Offline artifacts are
only acceptable as intermediate outputs. If a run would complete without a
live deploy, scope is wrong — halt and request a corrected scope rather than
shipping shelfware.

- HTML/static → Vercel static
- Next.js / Node → Vercel functions
- WordPress content site → 20i WordPress Pinnacle (typeRef 88291)
- Linux / custom stack → 20i Linux Pinnacle / static (typeRef 80359)
- Agent / long-running worker → Flint VM via SSH, then exposed via
  Cloudflare tunnel

## 2. Vercel over Brilliant Directories for new properties

BD licenses are finite (100-license pool). Preserve them for directory-shaped
products that need BD's built-in claim/listing/membership features. Every
other property — authority sites, landing pages, funnels, apps — goes to
Vercel. Decision rule: if the product does not need claimed listings or a
membership-tier directory, it is not a BD workload.

## 3. Authority site framework on every launch

Every new property ships with the Dynasty Developer authority site scaffold
as a prerequisite, not a later add-on. That means:

- Hero, about, services, case studies, contact structure
- Schema.org Organization + LocalBusiness markup
- Brand consistency with the parent LLC
- Lead capture wired to Acumbamail or SuiteDash at launch

A property without an authority presence is a half-launched property.

## 4. Entity routing

Every operating property reports up through an LLC. Default routing:

- Directories and vertical SaaS → CXI
- Content/media properties → ToriMedia
- Consulting and services → Neat Circle
- Real estate and CROP workflows → Obuke
- Anything genuinely novel that doesn't fit → Kwode

All operating LLCs roll up through PNR Holdings LLC to the Wyoming Dynasty
Trust. A run that provisions infrastructure without tagging the correct
operating entity creates downstream tax and liability mess. Tag at creation.

## 5. Delegation over manual execution

Claude is CEO-delegate. The orchestrator's job is to break the run into
subagent tasks, not to execute every step inline. A one-shot monolithic
generation is almost always wrong — split it. If a subagent's task is
itself large, the subagent splits it further and delegates to the code
generator or integrator.

## 6. Leverage existing tool arsenal before adding new tools

Dynasty has 200+ AppSumo lifetime tools already paid for. Before adding a
new vendor, check:

1. Is there an AppSumo tool that does this? (`DYNASTY_TOOL_CONFIG` lists
   configured ones; the broader arsenal lives in the inventory doc.)
2. Can SuiteDash handle it? 136 Pinnacle licenses means CRM, billing, client
   portals, and automation are already covered for most scenarios.
3. Can n8n orchestrate it? The n8n instance at `n8n.audreysplace.place` has
   workflow coverage for most SaaS integrations.

New-vendor spend requires escalation per the escalation policy.

## 7. Revenue engines are PA CROP, Launcher, and (pending) LeadOS-Gov / ManifestIQ

When optimizing, prioritize work that increases MRR on these four. Tooling
changes, internal automations, and exploratory directories are lower
priority than anything that moves revenue on the primary engines.

## 8. WCAG AA is the minimum, not a stretch

PA CROP is WCAG AA compliant; that's the floor for every Dynasty property.
The auditor subagent enforces this post-deploy. A launch that fails
accessibility doesn't count as shipped.
