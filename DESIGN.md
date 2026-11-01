---
name: Linfei Technology homepage
description: Blue optical imagery and coordinated sans-serif typography for the default New API public homepage
colors:
  blue: "#1559df"
  blue-hover: "#1049b8"
  paper: "#f4f8ff"
  ink: "#10284b"
  muted: "#405c7c"
  soft: "#dceaff"
  deep: "#103780"
  line: "#b8cde7"
  white: "#ffffff"
  focus: "#ff9d54"
  paper-dark: "#0c1d36"
  ink-dark: "#edf4ff"
  muted-dark: "#b4c8e4"
  soft-dark: "#162f53"
  deep-dark: "#102b60"
  line-dark: "#3b567a"
typography:
  display:
    fontFamily: "var(--font-ui-sans)"
    fontSize: "clamp(2.6rem, 4.6vw, 4.15rem)"
    fontWeight: 600
    lineHeight: 1.28
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "var(--font-ui-sans)"
    fontSize: "clamp(2.25rem, 4vw, 3.5rem)"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  title:
    fontFamily: "var(--font-ui-sans)"
    fontSize: "36px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.025em"
  body:
    fontFamily: "var(--font-body)"
    fontSize: "16px"
    lineHeight: 1.9
  lead:
    fontFamily: "var(--font-body)"
    fontSize: "18px"
    lineHeight: 1.8
  label:
    fontFamily: "var(--font-body)"
    fontSize: "12px"
  code:
    fontFamily: "var(--font-mono)"
    fontSize: "12.5px"
    lineHeight: 1.55
rounded:
  action: "6px"
  panel: "14px"
spacing:
  small: "16px"
  inset: "20px"
  medium: "24px"
  console-inset: "25px"
  row: "28px"
  panel: "36px"
  section: "72px"
  section-wide: "80px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.white}"
    rounded: "{rounded.action}"
    padding: "0 22px"
    height: "46px"
  button-primary-hover:
    backgroundColor: "{colors.blue-hover}"
  button-light:
    backgroundColor: "{colors.white}"
    textColor: "#1246a0"
    rounded: "{rounded.action}"
    padding: "0 22px"
    height: "46px"
  button-link:
    textColor: "{colors.ink}"
    padding: "0"
  navigation-link:
    textColor: "{colors.ink}"
    padding: "8px 10px"
  api-panel:
    backgroundColor: "{colors.deep}"
    textColor: "{colors.white}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel}"
  console-preview:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
---

# Design System: Linfei Technology homepage

## Overview

**Creative North Star: "The Blue Optical Gateway"**

This system applies only to the default public homepage implemented in `web/src/features/home/components/landing-page.tsx` and `web/src/styles/lftech-home.css`. Vivid blue, pale blue and deep blue fields frame a single optical-ribbon hero image. Editorial serif headings give the enterprise-facing page a composed voice; the existing UI typography keeps examples and actions practical.

Homepage tokens remain scoped to `.lf-home`. This document does not redefine the customer console, administration screens, custom homepage content, or the shared theme system. Preserve the New API identity, QuantumNous attribution, and existing legal notices. The console shown on this page is an illustrative preview of usage and balance, rather than evidence of customer activity.

**Key Characteristics:**

- One optical-ribbon image, with typography and tonal fields doing the remaining visual work.
- Serif display text paired with the existing configurable UI font and code face.
- A compact progression from introduction to API example, model discovery, and customer console preview.
- Shared components, keyboard operation, dark theme, and a complete reduced-motion fallback.

## Colors

The palette moves between a clear action blue, cool paper surfaces, and deep blue sections. The frontmatter records the canonical values extracted from the homepage stylesheet.

### Primary

- **Gateway Blue** (`blue`): primary actions and hero emphasis; `blue-hover` supplies the primary action's hover state.
- **Deep Gateway** (`deep`): the API example's surrounding panel and the final usage section.
- **Pale Blue Field** (`soft`): model discovery's full-width background.

### Neutral

- **Cool Paper** (`paper`): page, header, terminal, console preview, and footer surfaces.
- **Blue Ink** (`ink`): primary text on light surfaces.
- **Slate Blue** (`muted`): supporting copy, navigation utilities, and preview labels.
- **Cloud Line** (`line`): preview tables and terminal divisions.
- **White** (`white`): text on deep sections and the inverse primary action.
- **Warm Focus** (`focus`): the homepage's visible outline accent, supplementing inherited shared-component focus rings.

The `*-dark` entries are the six actual dark-mode overrides of local homepage properties. Gateway Blue remains unchanged. The hero deliberately keeps its light artwork, dark headline, and blue emphasis in both themes; other homepage surfaces follow the dark palette. Shared protocol syntax colors remain owned by `HeroTerminalDemo`.

**The Local Palette Rule.** Keep homepage color properties inside `.lf-home`; do not promote them into console theme defaults.

## Typography

**Display Font:** the existing `--font-serif` stack: Lora Variable / Lora, followed by Source Serif, explicit CJK serif fallbacks, Georgia, and system serif faces. Keep the complete stack in `web/src/styles/theme.css`; CJK rendering must not depend on Latin glyph coverage.

**Body Font:** the inherited `--font-body`, governed by the existing font selection. Public Sans is the existing UI sans option. The homepage does not force a new body font or download a separate family.

**Label/Mono Font:** the shared UI face for labels and existing `--font-mono` for protocol examples.

### Hierarchy

- **Display:** the frontmatter's fluid display role, balanced over the approved hero line break; its emphasized line is upright blue. At the homepage's tablet breakpoint, the size becomes 42px.
- **Headline:** fluid section headings; the API panel uses a compact 36px heading.
- **Title:** the model introduction uses the serif title role, reducing to 30px on narrow phones. Model list titles instead use the inherited UI face at 24px and weight 600.
- **Body:** section explanatory text uses the body role. Hero supporting text is 18px with line-height 1.9 and a 470px maximum width; model discovery's lead uses the lead role and a 700px maximum width.
- **Label:** compact preview labels and tab captions; console figures use weight 700 with tabular numerals and fluid size from 19px to 27px.
- **Code:** preserve the original terminal's code role and protocol highlighting; endpoint strings wrap or truncate through existing demo behavior.

**The Two Voices Rule.** Use the serif face for the homepage's major narrative headings and keep operational text, model rows, navigation, and controls in the existing UI face.

## Layout

The content container is 88% wide and capped at 1300px. The header has a separate 1500px cap and 6% side padding. Anchor targets reserve 100px for the fixed header. Desktop hero copy sits over artwork; below 800px, the artwork becomes a separate 280px-high image following the copy, with the image focused at 65% horizontally.

Keep the approved compact sequence: hero with registration and sales actions; one deep API panel containing the reused protocol demo, request path, and onboarding row; pale model discovery; one deep usage section combining the console illustration and calls to action. Do not append the three previously removed tail chapters as new stacked sections. This sequence is homepage-specific, not a global application layout rule.

The API panel uses two columns in a 0.85:1.4 ratio, model discovery uses equal columns, and the usage section uses 0.9:1.15 columns. These collapse at 800px. Model introduction is sticky at 100px on desktop and static below that breakpoint. The terminal's request/response split stacks below 500px. Section spacing primarily uses the section tokens, reducing to 48px or 55px on smaller screens. Preserve wrapping actions, translated labels, and existing mobile navigation rather than imposing fixed text widths.

## Elevation & Depth

Large tonal fields establish depth. Shadows are reserved for the terminal, illustrative console, and the header's compact scroll state; model rows remain flat with separators. The hero's optical depth comes from the image and a directional translucent wash, not from extra floating cards.

### Shadow Vocabulary

- **Compact header:** `0 8px 24px #07102015`.
- **Protocol terminal:** `0 16px 36px #07102035`.
- **Console illustration:** `0 18px 36px #07102030`.

The sidecar records motion and shadow values that the frontmatter schema cannot express. Hero artwork settles from scale 1.045 over 1.1s; the request-path highlight travels only while its section is visible; model rows shift 10px when visible; the console arrives from 24px below over 0.7s. The reused protocol demo is manually selected on this homepage (`autoPlay={false}`). With reduced motion enabled, all homepage animations and transitions are disabled, automatic scrolling behavior is removed, and model-row translation is reset.

## Shapes

Actions have gently curved corners through the action radius. The deep API panel and console illustration use the panel radius. Model discovery is an open editorial list with rules, rather than a repeated card grid. The terminal keeps its existing shared rounded container and uses square tab-strip edges. The homepage header is a straight bar at rest and in its compact state.

## Components

### Buttons

Confident primary actions and restrained text links use the existing shared `Button`. The primary and inverse variants use the frontmatter's dimensions. Header primary actions compact to 38px high, then 34px below 800px. Preserve the shared disabled state, pointer behavior, focus rings, and pressed feedback. Text links underline on hover. The optional sales action remains visibly unavailable until a real destination is configured; do not invent a contact route.

### Navigation

Reuse `PublicLayout` and `PublicHeader`, including their existing theme/language controls, authentication state, mobile menu, and keyboard behavior. The homepage supplies composition slots for its company wordmark, section links, and primary action. The fixed bar changes from 80px to 66px tall on scroll with a 0.35s transition. Keep the original project brand and legal attribution intact alongside the customer-facing Linfei name.

### Protocol Demo

Reuse `HeroTerminalDemo` and shared `Tabs`; do not create a parallel code-demo implementation. The homepage uses its split layout with manual selection. Keep request and response visible together on wider screens and stacked on phones. The surrounding story identifies the application-platform-model path and the example's illustrative status. Existing protocol accent colors are syntax cues, not additional homepage brand colors.

### Cards / Containers

The API panel uses the deep field, white text, panel corner radius, and panel inset. The console illustration uses the paper surface, line separators, and 25px horizontal interior padding, reducing to 18px below 500px. The console preview shows balance, monthly requests, monthly usage, and a small recent-request table. Retain its illustrative-data label and localized number/currency formatting. It is a homepage component, not a replacement for the actual console.

### Imagery

Use only `web/public/images/lftech/api-ribbon.webp` as the generated hero image. It is decorative (`alt=''`), has explicit intrinsic dimensions, and is given high fetch priority. Preserve its prompt provenance alongside the asset. Do not turn page copy, controls, or the console preview into an image.

## Do's and Don'ts

### Do:

- **Do** scope homepage tokens locally and preserve the console's existing design system.
- **Do** keep one optical-ribbon hero image and the approved compact homepage sequence.
- **Do** reuse the shared header, footer, buttons, tabs, and original interactive protocol demo.
- **Do** retain keyboard access, translated copy, visible focus, dark surfaces, and reduced-motion behavior.
- **Do** display the Linfei Technology product brand and retain New API / QuantumNous attribution and legal notices.

### Don't:

- **Don't** add generated images beyond the approved hero asset.
- **Don't** restore removed tail chapters as separate stacked homepage sections.
- **Don't** present illustrative console records or protocol metrics as customer evidence or measured performance.
- **Don't** create a new console theme or duplicate shared navigation and demo behavior to match the homepage.

## Product brand

Customer-facing default branding is 麟飞科技 (Linfei Technology), using `/images/lftech/brand-mark.svg`. Public Sans is self-hosted and shared with explicit Chinese sans-serif fallbacks; the wordmark uses weight 650. Homepage display headings use weight 600. The default app action, focus-ring, and sidebar accent use the same #1559df blue as the homepage. Code retains its monospace face. Explicit user font preferences remain available in the console. New API, QuantumNous, and One API authorship and license notices remain in attribution surfaces. Legacy default names and local logo paths are normalized before rendering, including cached settings.

The hero artwork stays absolutely positioned behind the hero copy on mobile as well as desktop. Use the mobile light overlay to preserve text contrast; never turn the artwork into a separate stacked image row. The hero height grows with content, with a 620px mobile minimum.
