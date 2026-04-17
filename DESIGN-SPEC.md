# Your Deputy — Design Specification (Expert Synthesis)

## Diagnosis of Current Problems (applying all 8 frameworks)

### Nielsen Violations:
- H1 (Visibility): No loading states. Empty grids flash before data arrives.
- H2 (Real world): "Atomic automations", "spec/deployable" are internal jargon.
- H4 (Consistency): Card CTAs vary wildly: "Choose Plan", "Learn More", "View Pack", "Activate", "Book Now".
- H5 (Error prevention): The e.includes.suites crash showed zero defensive coding.
- H8 (Minimalism): 7 catalog sections + automations = too much competing for attention.

### Norman Violations:
- "Activate Now (Paid)" is a weak signifier — "(Paid)" creates anxiety, not confidence.
- No conceptual model visible — users don't know the Pick→Activate→Automate journey.
- No feedback states on any interaction.

### Morville Violations:
- IA mixes buyer-intent (pricing/plans) with catalog browsing (353 automations) — different intents.
- No clear taxonomy visible in navigation.
- Findability poor — no persistent navigation between page types.

### Baymard Violations:
- No explanation of what "activate" means or what happens next.
- Price display lacks context (what do you actually get?).
- CTAs don't reduce uncertainty — they increase it.

### CXL Violations:
- Value proposition buried. "Stop losing leads" is generic. No specific outcome stated.
- No clear answer to "Is this for me?" in the first viewport.

### WCAG Violations:
- `display:none` on navbar trust text = mobile users never see trust signals.
- Form labels exist but aren't visually associated with their controls.
- No skip-to-content regions for sections.

### Walter Violations:
- Zero emotional design — no personality, no anxiety reduction.
- Generic guarantee line isn't positioned to reduce purchase anxiety.

### SEO/Solís Violations:
- Title tag is a slogan, not a descriptive title.
- No BreadcrumbList schema on marketplace page.
- Internal linking between sections and sub-pages is weak.

---

## Design Principles (Synthesized)

### 1. Left-align important content (F-pattern)
Users scan top-left first. Headlines, value props, and CTAs go left-aligned, not centered.

### 2. One mental model: Pick → Activate → Automate
Norman's conceptual model. Reinforce on every page, every CTA.

### 3. Answer three questions in 5 seconds
- "What is this?" → Headline
- "Is this for me?" → Audience statement
- "What do I do?" → Single CTA

### 4. Use service-business language (Nielsen H2)
Not "atomic automations" but "ready-to-use workflows."
Not "spec" but "coming soon." Not "deployable" but "available."

### 5. One consistent CTA pattern per card type (Nielsen H4)
- Tiers: "Start with [Name]" → /dashboard
- Editions: "See what's included" → detail page
- Packs: "View this pack" → /automations/packs/X
- Modules: "View module" → /automations/modules/X
- Automations: card itself is the link (no extra button)

### 6. Trust through transparency (Baymard + Walter)
- Show price on every card
- Explain what's included
- "30-day money-back guarantee" near every CTA
- Real company name in footer
- "Works with your tools" always visible

### 7. Progressive disclosure (Norman + Morville)
Show summary first, details on click. Don't dump 353 automations
on the same page as pricing tiers.

### 8. Loading states (Nielsen H1)
Skeleton placeholders while API data loads. Never show empty grids.

### 9. Defensive rendering (Nielsen H5)
Every data access guarded with optional chaining and Array.isArray.
render() never crashes on unexpected data shapes.

### 10. Accessible by default (WCAG POUR)
- Semantic landmarks: header, nav, main, section, footer
- Heading hierarchy: one h1, then h2s for sections
- Color contrast: verified for all text/background combos
- Keyboard: all interactive elements focusable
- Screen reader: aria-labels on icon-only elements
- Focus: visible focus indicators on everything
