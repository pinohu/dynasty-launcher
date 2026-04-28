# Design System - Your Deputy

```yaml
design_system:
  name: "Your Deputy Operational SaaS"
  version: "2026-04-28"
  format: "DESIGN.md-inspired contract for AI coding agents"
  purpose: "Make every public page, paid offer page, provisioning flow, and operator surface clear, trustworthy, and aligned with what production actually delivers."
  primary_personas:
    - "Founder buying a build package"
    - "Small business operator provisioning a paid deliverable"
    - "Internal operator using the production factory console"
  references:
    - "Google DESIGN.md pattern: a portable design contract for AI coding agents"
    - "IBM Carbon: dense operational dashboards and enterprise clarity"
    - "GOV.UK and USWDS: plain language, forms, error states, accessibility"
    - "GitHub Primer: developer-facing product surfaces and precise status language"
```

## Product Truth

Your Deputy must look and read like an operational system, not a speculative AI landing page.

Every page must answer, in this order:

1. What can the user buy or do here?
2. What information must they provide?
3. What does the backend create?
4. What URL, file, workflow, or receipt does the user receive?
5. What still depends on customer-owned vendor credentials?

Never sell "autonomous business factory" as a vague outcome. Use it only when the page immediately names the actual delivered surfaces: launch URL, generated files, activated modules, workflow templates, lead capture, credential vault, integration receipts, tests, and deployment scaffolding.

## Visual Direction

The system should feel like a serious SaaS operations console:

- Calm, bright work surface.
- Dark navigation only where it helps orientation.
- Compact but readable cards.
- Strong form labels and helper text.
- Plain status language.
- Few decorative effects.
- No purple/blue gradients, floating glow blobs, oversized hype hero sections, or repeated "icon in circle plus two-line feature" grids.

## Color Tokens

```yaml
colors:
  canvas: "#F6F7F9"
  surface: "#FFFFFF"
  surface_alt: "#F1F4F8"
  ink: "#15171C"
  text: "#20232B"
  muted: "#5F6876"
  faint: "#7B8493"
  border: "#DCE1EA"
  border_strong: "#BFC7D4"
  navy: "#182235"
  blue: "#2454B8"
  blue_hover: "#1C4496"
  amber: "#B88718"
  amber_soft: "#FFF4D7"
  green: "#15803D"
  green_soft: "#EAF8EF"
  red: "#B42318"
  red_soft: "#FEEDEB"
  focus: "#2454B8"
```

Use blue for primary actions, green for completed/running states, amber for customer action required, and red only for real failures. Gold/amber is no longer the dominant brand color.

## Typography

```yaml
type:
  family: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, Liberation Mono, monospace"
  h1:
    size: "clamp(40px, 5.8vw, 72px)"
    line_height: 0.98
    weight: 760
  h2:
    size: "clamp(26px, 3vw, 40px)"
    line_height: 1.08
    weight: 740
  h3:
    size: "18px"
    line_height: 1.25
    weight: 760
  body:
    size: "16px"
    line_height: 1.65
  small:
    size: "13px"
    line_height: 1.45
```

Do not use display serif fonts for product claims. They make the system feel editorial when it needs to feel operational.

## Layout

```yaml
layout:
  page_max_width: "1180px"
  page_padding_desktop: "32px"
  page_padding_mobile: "18px"
  section_gap: "40px"
  card_radius: "8px"
  control_radius: "8px"
  card_padding: "20px"
  form_row_gap: "14px"
  border_width: "1px"
```

Rules:

- One major action per section.
- Cards are for repeated items, forms, receipts, and status panels only.
- Do not nest cards inside cards.
- Avoid full-page dark backgrounds for customer-facing offer pages.
- Keep dashboards dense enough to scan, but leave enough spacing for trust and comprehension.

## Components

### Buttons

Primary buttons are blue with white text. Secondary buttons are white or transparent with a visible border. Destructive actions are red only when data or money can be lost.

Button labels must be explicit:

- Good: "Provision and launch now"
- Good: "Open launched deliverable"
- Bad: "Go", "Submit", "Start", "AI Build"

### Forms

Every input must have:

- Visible label.
- Helper text when the field asks for a credential or vendor-owned value.
- Clear required state.
- Error text next to the failed section.

Never prefill secret fields with fake values. Use placeholders only. Secrets must never appear in URLs, page copy, or public receipts.

### Status Panels

Use status language that maps to backend reality:

- `Created`
- `Launched`
- `Activated`
- `Credential required`
- `Vendor action required`
- `Failed with receipt`

Avoid vague statuses like `AI ready`, `autopilot`, or `magic`.

### Deliverable Cards

Each paid deliverable card must show:

- Customer outcome.
- What gets created.
- Required credentials.
- Live example URL.
- Provisioning endpoint or customer next step.
- Boundary: what is not automatically completed.

## Copy Rules

Write like an operator explaining a handoff.

- Say "created and launched" only when the backend stores a launch record and returns a usable URL.
- Say "generated files" when the output is code or documents.
- Say "integration receipt" when third-party setup was attempted but not completed.
- Say "requires customer credential" when the system cannot act without vendor-owned keys.
- Do not say "fully autonomous" on a page unless the page names the specific autonomous loop and the runtime that executes it.

## Accessibility

Minimum standard:

- WCAG AA color contrast.
- Visible focus state.
- Labels are not placeholders.
- Buttons and links are distinguishable.
- Form errors are announced in an `aria-live` region.
- Responsive layouts must collapse to one column without horizontal scrolling.

## Agent Instructions

Before making UI changes:

1. Read this file.
2. Confirm the page promise matches production behavior.
3. Prefer shared tokens in `design-system.css` and `site-shell.css`.
4. Avoid adding new visual languages without updating this file.
5. Run the HTML/site checks that cover the edited pages.

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-28 | Adopted an operational SaaS design system | The previous dark/gold AI-factory presentation made paid offers harder to understand and overemphasized promise over delivery evidence. |
| 2026-04-28 | Added explicit copy truth rules | The product must never imply more than the backend can provision, activate, store, and expose through a public URL. |
