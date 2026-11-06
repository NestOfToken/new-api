---
name: nerioncloud homepage
description: Enterprise model access with Google Sans, nerioncloud blue, and an approved glass-ribbon material
colors:
  blue: "#1a73e8"
  blue-text: "#1967d2"
  blue-hover: "#185abc"
  paper: "#fff"
  ink: "#202124"
  muted: "#5f6368"
  soft: "#e8f0fe"
  line: "#dadce0"
  surface: "#f8fafd"
  card-dark: "#10315a"
  card-light: "#eef5ff"
  card-muted: "#c9ddf5"
  paper-dark: "#101418"
  ink-dark: "#e8eaed"
  muted-dark: "#b7bec7"
  blue-dark: "#8ab4f8"
  blue-text-dark: "#a8c7fa"
  soft-dark: "#1c2c48"
  line-dark: "#3c454f"
  surface-dark: "#18212b"
  card-dark-dark: "#0b2444"
  card-light-dark: "#182b45"
typography:
  display:
    fontFamily: "var(--font-google-sans)"
    fontSize: "clamp(44px, 4.6vw, 68px)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "var(--font-google-sans)"
    fontSize: "clamp(32px, 3.5vw, 46px)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  api-headline:
    fontFamily: "var(--font-google-sans)"
    fontSize: "clamp(32px, 3.3vw, 44px)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "var(--font-google-sans)"
    fontSize: "clamp(25px, 2.4vw, 30px)"
    fontWeight: 700
    lineHeight: 1.28
    letterSpacing: "-0.02em"
  body:
    fontFamily: "var(--font-google-sans)"
    fontSize: "16px"
    lineHeight: 1.7
  lead:
    fontFamily: "var(--font-google-sans)"
    fontSize: "18px"
    lineHeight: 1.7
  label:
    fontFamily: "var(--font-google-sans)"
    fontSize: "14px"
    fontWeight: 500
  code:
    fontFamily: "var(--font-mono)"
    fontSize: "13px"
    lineHeight: 1.65
rounded:
  action: "12px"
  panel: "16px"
  console: "12px"
  pill: "999px"
spacing:
  small: "16px"
  mobile-gap: "18px"
  medium: "24px"
  panel-mobile: "26px"
  panel-inset: "32px"
  section-mobile: "48px"
  section: "76px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.paper}"
    rounded: "{rounded.action}"
    padding: "14px 26px"
  button-primary-hover:
    backgroundColor: "{colors.blue-hover}"
  button-light:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.blue-hover}"
    rounded: "{rounded.action}"
    padding: "14px 26px"
  button-link:
    textColor: "{colors.blue-text}"
    padding: "0"
  navigation-link:
    textColor: "{colors.muted}"
    padding: "24px 16px"
  api-window:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
  access-card:
    backgroundColor: "{colors.card-dark}"
    textColor: "{colors.paper}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel-inset}"
  model-panel:
    backgroundColor: "{colors.card-light}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel-inset}"
  balance-card:
    backgroundColor: "{colors.card-light}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel-inset}"
  management-panel:
    backgroundColor: "{colors.card-dark}"
    textColor: "{colors.paper}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel-inset}"
  console-preview:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.console}"
---

# Design System: nerioncloud homepage

## Overview

**Creative North Star: "Enterprise clarity in nerioncloud blue"**

nerioncloud pairs a clear Google Sans hierarchy with blue actions, alternating cool product fields, and one approved glass-ribbon image. The material gives the public homepage a recognizable focal point; semantic text and native controls carry the product explanation. The approved production composition follows the user's SiliconFlow reference. Chrome remains the earlier typography reference, rather than the current page-composition authority.

This records the default public homepage implemented in `web/src/features/home/components/landing-page.tsx` and its two local stylesheets. Its enterprise story connects model access, model choice, balance, and usage to registration. Google Sans also remains the shared default UI font, with explicit application font preferences preserved. Console and administration palettes, authentication layouts, and custom homepage HTML, Markdown, and URL branches retain their existing systems.

**Key Characteristics:**

- Left-aligned, full-width hero with a right-biased glass ribbon and soft page-ground fades.
- Alternating dark and light product cards with native model selectors and an illustrative console.
- A working request/response demo, practical onboarding, and a compact dark closing band.
- Two subtle heading-centered CSS curves, translated copy, keyboard access, dark surfaces, and reduced motion.

## Colors

nerioncloud blue anchors actions and emphasis; dark navy and pale blue organize the homepage's product story. Frontmatter values are canonical and reflect the production stylesheet's effective declarations.

### Primary

- **Action Blue** (`blue`): primary actions, protocol-tab underline, and request-path dots.
- **Readable Blue** (`blue-text`): upright hero emphasis, API-heading emphasis, text actions, and visible focus.
- **Pressed Blue** (`blue-hover`): primary hover fill and inverse-action text.
- **Pale Blue** (`soft`): onboarding markers and supporting control states.
- **Deep Product Blue** (`card-dark`): API-access and usage cards, plus the closing band.
- **Light Product Blue** (`card-light`): model and balance cards, plus the hero ground.
- **Soft Blue Copy** (`card-muted`): supporting text on dark product surfaces.

### Neutral

- **White Canvas** (`paper`): page, header, API window, and compact console.
- **Near-black Ink** (`ink`): primary text.
- **Quiet Gray** (`muted`): supporting copy, navigation, and operational labels.
- **Fine Gray** (`line`): API-window, code-column, and console separators.
- **Cool Surface** (`surface`): window chrome and response-code background.

The `*-dark` entries record the corresponding local dark-theme fields. The dark theme changes the hero wash, artwork opacity, product surfaces, text, and controls together. Its primary action uses `blue-text-dark` with dark text. The approved product cards use blue fields in both themes; the preceding green management-panel treatment is superseded. Protocol syntax colors stay owned by the existing demo.

**The Local Palette Rule.** Keep homepage colors inside `.lf-home`; the console's shared theme remains its own source of truth.

## Typography

**Display and Body Font:** `--font-google-sans`, defined as `'Google Sans', Arial, sans-serif`. The unchanged self-hosted variable font loads weights 400–700 with `font-display: swap` and an existing preload. Its license remains beside the asset. The bundled file has no CJK glyphs; Chinese, Japanese, and other missing glyphs use Arial/system sans fallback.

**Code Font:** the existing `--font-mono` owns request and response examples.

Google Sans remains the global default through `--font-ui-sans` and `--font-body`; explicit user font preferences remain available. The homepage uses its direct Google Sans token.

### Hierarchy

- **Display:** use the frontmatter display role for the left-aligned hero, with an upright blue second line. At 800px and below it becomes `clamp(36px, 6.2vw, 48px)`; at 500px and below it is 36px. Supporting text is capped at 700px and reduces to 16px on mobile.
- **Headline:** the product-intro role and the slightly smaller API role remain separate. At 800px and below section-heading line-height becomes 1.22. The product intro is centered; the API heading is left aligned on desktop and centered on mobile.
- **Title:** the frontmatter title role applies consistently across the four product cards.
- **Body and lead:** descriptions use the body role; the hero uses the lead role. API and card text retain comfortable reading widths rather than filling each panel.
- **Label:** navigation is 15px on desktop; protocol labels use the label role. The compact console uses 10–14px operational text and 21px tabular figures, reducing to 20px below 800px.
- **Code:** split examples use the code role, reducing to 11.5px below 500px. Preserve syntax highlighting and existing wrapping/scroll behavior.

**The Font Preference Rule.** Keep Google Sans as the shared default while preserving explicit user font choices, CJK fallback, and the monospace code face.

## Layout

The homepage content container is centered at `min(92%, 1280px)`. The shared fixed header retains its native layout at 72px high on desktop and 64px at 800px and below; scrolling adds only a shadow. Anchor targets reserve 96px. At 500px and below, the toolbar registration/dashboard action moves into the shared mobile menu; hero and closing actions remain available.

The approved homepage sequence is a full-width hero, centered product introduction and alternating 2×2 API/model/balance/usage cards, API demonstration with onboarding, dark closing band, and attributed footer. This sequence describes this homepage, not a mandatory layout for other surfaces. The hero minimum height is 760px on desktop and 690px below 800px, growing with content. Its artwork remains behind left-aligned copy. A top page-ground overlay stays solid through 84px and fades over 240px on desktop; below 800px those values become 76px and 220px. The image mask and ground wash soften the bottom edge into the page.

Cards use two equal columns with a 24px gap, 32px padding, and a 350px minimum for the API-access/model cards. At 800px and below they stack with an 18px gap, 26px padding, and 320px minimum height. Model selectors wrap as complete controls, with translated labels allowed to wrap inside each control.

The desktop API section places its heading and vertical onboarding at left and the demonstration at right in a `0.85fr / 1.5fr` grid, with a 48px column gap. It becomes one column at 1050px; request and response columns stack below 800px. The API section has 32px top and 80px bottom padding on desktop, reducing to 12px and 48px on mobile. The capabilities section uses the frontmatter section spacing, reducing to its mobile value. The closing band spans the viewport, aligns copy and actions horizontally on desktop, and stacks at 1050px.

## Elevation & Depth

Depth comes primarily from tonal fields, glass artwork, masks, and fine separators. Product cards stay flat without shadows. The API window is upright and static in the approved production composition; the preceding perspective-settle and hero-exit transforms are superseded.

### Shadow Vocabulary

- **Scrolled header:** `0 3px 12px #20212412`, keeping the header geometry stable.
- **Primary hover:** `0 3px 8px #174ea622`, providing restrained action feedback.

The hero copy enters once over 0.6s with a 14px upward settle. Manually selected model content enters over 0.24s with a 6px settle. The protocol demonstration remains manually selected (`autoPlay={false}`).

Two full-viewport CSS optical curves sit behind the model-intro and API headings, each anchored to its heading's vertical center. Fixed CSS shapes translate through a repeating tile over 50s and 56s respectively. Observers track layout and visibility; document visibility and motion preference gate playback. Offscreen or background lanes stop and hide; reduced motion and unsupported CSS shape rendering omit the decoration. JavaScript does not draw frames, run a frame loop, or use canvas. No quantified resource-performance claim follows from this implementation.

**The Motion Access Rule.** Reduced motion disables homepage animations and smooth scrolling, and makes header/button transitions effectively immediate; content and controls stay usable without movement.

## Shapes

Main actions use softly squared action corners; product cards and the API window share the panel radius, with a smaller compact console radius. Model selectors retain pill corners; this does not make pill-shaped primary actions part of the current system. Circular onboarding markers and small request-path dots remain functional details. The header and full-width closing band retain straight outer edges.

## Components

### Buttons

Reuse the shared `Button` and routing links. Primary and inverse actions use the frontmatter action radius and padding with a 52px minimum height, reducing to 48px with 12px by 23px padding below 800px. Header actions use a 40px minimum, reducing to 36px. Text actions underline on hover. Preserve shared pressed and disabled states, plus the homepage's 2px focus outline with a 4px offset. `VITE_LFTECH_SALES_URL` accepts the configured HTTP(S) or mail destination; an absent or invalid destination leaves sales visibly unavailable with honest copy.

### Navigation

Reuse `PublicLayout` and `PublicHeader` for brand, language/theme controls, authentication state, and mobile menu. Homepage section links and registration/dashboard actions enter through existing composition slots. Preserve the native mobile-menu behavior and stable header geometry. Use 睿元云 (nerioncloud) as the customer-facing brand and retain New API / QuantumNous / One API copyright, license, and author attribution.

### Cards / Containers

The four cards alternate dark API access, light model selection, light balance, and dark usage. `LandingAccessCard` and `LandingBalanceCard` compose shared link buttons; `LandingRequestPath` supplies the same application/platform/model presentation in the access card and API window. The balance-card mark and currency symbol are decorative rather than a price claim.

`LandingModelExplorer` uses the shared `Tabs` and links to the real model/pricing catalog. A white selected pill distinguishes the active category on the light theme; dark-theme selectors use their existing tonal overrides. Categories change useful descriptive content. Model availability follows the current catalog.

The dark usage card contains `LandingConsolePreview` on a compact page-colored surface. Its three account/usage figures and explicit example-data note remain visible; request-history rows are hidden in this compact homepage placement. Use shared number/currency formatters and normalize language through `toIntlLocale`. This illustration does not restyle the actual customer console.

### Protocol Window

The panel-radius frame contains modest window chrome, the reused request path, and the existing `HeroTerminalDemo` with shared `Tabs`. Selected protocol tabs have a blue bottom stroke. Preserve real example text, manual selection, responsive request/response columns, and the illustrative-status note. Do not substitute a raster for the working demonstration.

### Imagery and Optical Curves

Keep the single approved generated ribbon at `web/public/images/lftech/api-ribbon.webp`, including its provenance. It remains decorative (`alt=''`) with intrinsic dimensions and high fetch priority. The separate configured product mark remains available; the balance illustration uses the existing brand mark. Page text, controls, and console data remain semantic HTML.

`LandingOpticalRibbon` provides exactly two decorative heading-relative curves on this homepage. The existing shared `AnimateInView` covers entrance/reveal, while this component supplies the required heading anchor, repeating CSS movement, playback gates, and cleanup. Keep observers and event listeners paired with cleanup; do not replace this behavior with JavaScript frame animation.

## Do's and Don'ts

### Do:

- **Do** preserve the approved SiliconFlow-led homepage composition, nerioncloud blue identity, and Google Sans preference.
- **Do** keep homepage colors local while retaining explicit application font preferences and CJK fallback.
- **Do** reuse the shared header, footer, buttons, tabs, request path, and original interactive protocol demo.
- **Do** retain seven-language copy, keyboard access, visible focus, dark surfaces, and reduced-motion behavior.
- **Do** display the nerioncloud brand and preserve New API / QuantumNous / One API attribution and legal notices.
- **Do** retain the approved hero raster and fades, plus the two heading-centered CSS curves with playback gates and cleanup.

### Don't:

- **Don't** add generated imagery beyond the approved ribbon asset or rasterize interactive content.
- **Don't** present illustrative records, protocol metrics, catalog availability, or decorative currency as measured customer evidence.
- **Don't** invent a sales destination or enable an unconfigured sales action.
- **Don't** apply this homepage palette or composition to console themes, custom homepage branches, or authentication layouts.
- **Don't** claim CJK coverage from the bundled Google Sans file or quantified runtime savings without measurement.
