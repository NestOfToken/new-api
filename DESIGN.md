---
name: Linfei Technology homepage
description: Chrome-inspired product clarity with Google Sans and locally scoped homepage colors
colors:
  blue: "#1a73e8"
  blue-text: "#1967d2"
  blue-hover: "#185abc"
  paper: "#fff"
  ink: "#202124"
  muted: "#5f6368"
  soft: "#e8f0fe"
  green: "#e6f4ea"
  line: "#dadce0"
  surface: "#f8fafd"
  paper-dark: "#101418"
  ink-dark: "#e8eaed"
  muted-dark: "#b7bec7"
  blue-dark: "#8ab4f8"
  blue-text-dark: "#a8c7fa"
  soft-dark: "#1c2c48"
  green-dark: "#19372c"
  line-dark: "#3c454f"
  surface-dark: "#18212b"
typography:
  display:
    fontFamily: "var(--font-google-sans)"
    fontSize: "clamp(3rem, 5.6vw, 4.5rem)"
    fontWeight: 700
    lineHeight: 1.16
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "var(--font-google-sans)"
    fontSize: "clamp(2.4rem, 4.7vw, 3.75rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "var(--font-google-sans)"
    fontSize: "clamp(1.8rem, 2.8vw, 2.5rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "var(--font-google-sans)"
    fontSize: "16px"
    lineHeight: 1.5
  lead:
    fontFamily: "var(--font-google-sans)"
    fontSize: "18px"
    lineHeight: 1.6
  label:
    fontFamily: "var(--font-google-sans)"
    fontSize: "14px"
    fontWeight: 500
  code:
    fontFamily: "var(--font-mono)"
    fontSize: "13px"
    lineHeight: 1.65
rounded:
  pill: "999px"
  console: "14px"
  window: "24px"
  panel: "28px"
spacing:
  compact: "14px"
  small: "18px"
  medium: "24px"
  panel-gap: "28px"
  panel-inset: "36px"
  section-mobile: "48px"
  section: "72px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "14px 26px"
  button-primary-hover:
    backgroundColor: "{colors.blue-hover}"
  button-light:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.blue-hover}"
    rounded: "{rounded.pill}"
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
    rounded: "{rounded.window}"
  model-panel:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel-inset}"
  management-panel:
    backgroundColor: "{colors.green}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel-inset}"
  console-preview:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.console}"
---

# Design System: Linfei Technology homepage

## Overview

**Creative North Star: "Chrome-inspired product clarity"**

The user selected the official Google Chrome website as the visual reference: a white canvas, near-black Google Sans headings, blue pill actions, and generous pale blue and green product panels. Linfei Technology retains its own name, product mark, gateway content, and single optical-ribbon image. This refresh records the implemented direction; it supersedes the former serif and deep-blue homepage language.

Homepage colors and composition apply only to the default public homepage in `web/src/features/home/components/landing-page.tsx` and `web/src/styles/lftech-home.css`. Google Sans is also the global default UI font through `--font-ui-sans` and `--font-body`; explicit user font preferences remain available. Console and administration palettes, authentication layouts, and custom homepage HTML, Markdown, and URL branches retain their existing systems.

**Key Characteristics:**

- Centered product storytelling, large balanced headings, and blue phrase emphasis.
- One subdued ribbon background behind the hero at every breakpoint.
- A wide protocol window followed by task exploration and an illustrative usage console.
- Shared components, translated copy, keyboard access, dark surfaces, and reduced motion.

## Colors

White and near-black keep the page clear; action blue and pale product surfaces distinguish the interactive story. Frontmatter values are canonical and correspond to the homepage stylesheet.

### Primary

- **Action Blue** (`blue`): primary buttons, active protocol-tab underline, and request-path dots.
- **Readable Blue** (`blue-text`): emphasized headings, text actions, focus outlines, and the closing panel.
- **Pressed Blue** (`blue-hover`): primary hover fill and text on the inverse action.
- **Pale Blue** (`soft`): phrase highlights, the model panel, and onboarding step markers.

### Secondary

- **Pale Green** (`green`): the management panel and the second highlighted phrase. Green is a supporting product field, not a second primary action color.

### Neutral

- **White Canvas** (`paper`): page, header, protocol window, and illustrative console.
- **Near-black Ink** (`ink`): primary text.
- **Quiet Gray** (`muted`): supporting copy, navigation, and compact operational labels.
- **Fine Gray** (`line`): window, code-column, and table separators.
- **Cool Surface** (`surface`): window chrome and response-code background.

The nine `*-dark` entries record the actual local dark-mode overrides. Dark mode changes the hero wash and artwork opacity along with the page fields; the hero does not stay light. Primary actions use Readable Blue's dark value with dark text, and the closing panel has a dedicated dark blue fill. Protocol syntax colors stay owned by the existing demo.

**The Local Palette Rule.** Keep homepage colors inside `.lf-home`; the console's shared theme remains its own source of truth.

## Typography

**Display and Body Font:** `--font-google-sans`, defined as `'Google Sans', Arial, sans-serif`. The self-hosted variable font is loaded by `web/public/fonts/google-sans/font-face.css` with weights 400–700 and `font-display: swap`, and preloaded from `web/index.html`. Its license is retained beside the asset. The file has no CJK glyphs: Chinese, Japanese, and other missing glyphs depend on the Arial/system sans fallback, not invented Google Sans coverage.

**Code Font:** the existing `--font-mono` remains responsible for request and response examples.

Google Sans provides the shared default UI face without removing the existing explicit theme-font choices. The homepage directly uses the Google Sans token for its reference-led treatment; the wider application continues to resolve its body face through the configurable font axis.

### Hierarchy

- **Display:** the fluid display role peaks at 72px; its second line is upright blue. The supporting paragraph is capped at 660px. At 800px and below, the heading uses `clamp(38px, 6.2vw, 52px)`; below 500px it is 38px, and at 380px and below it becomes 34px.
- **Headline:** the fluid section role peaks at 60px. Below 800px it uses `clamp(32px, 5.5vw, 44px)`. Phrase highlights have rounded tonal backgrounds and remain real text.
- **Title:** product-panel headings peak at 40px and become 32px below 800px. The console's recent-request heading is a subordinate 12px `h4`.
- **Body and lead:** panel descriptions use 16px at line-height 1.6; hero lead text uses the frontmatter lead role, reducing to 16px on smaller screens.
- **Label:** navigation is 15px; protocol tabs and actions use the label role. The compact illustrative console uses smaller 10–14px operational text, with tabular figures at 17–24px.
- **Code:** split protocol examples use the code role, reducing to 11.5px below 500px. Preserve syntax highlighting and existing wrapping/scroll behavior.

**The Font Preference Rule.** Keep Google Sans as the shared default while preserving explicit user font choices and the monospace code face.

## Layout

Content uses a centered `min(88%, 1160px)` container. The fixed header is 72px high on desktop and 64px at 800px and below; scrolling changes only its shadow. Anchors reserve 96px. The hero has a 720px desktop minimum and a 620px mobile minimum; its height can grow with content. The ribbon stays absolutely positioned behind the copy at every breakpoint, with a contrast-preserving light or dark wash.

The default homepage progresses through the centered hero and actions, API example and onboarding, paired model/management panels, and a compact closing action panel. Keep the compact content sequence; do not append the previously removed tail chapters. This composition belongs to the homepage rather than the global application shell.

The product-panel grid uses `1fr 1.08fr` with a 28px gap, stacking below 900px. At 1100px, panel padding drops from 36px to 28px; below 500px it becomes 26px by 22px. At 800px the protocol request/response columns stack. Narrow-phone actions and onboarding steps form vertical groups. Model tabs wrap as complete controls, with translated labels allowed to wrap inside each control. The first model-heading clause stays together when space permits.

Desktop API spacing is 48px above and 78px below; the capabilities and closing panel finish with 72px spacing, reducing to 48px on smaller screens. The hero mark is 64px square on desktop and 48px on smaller screens. At 500px and below the redundant header-toolbar CTA is hidden so the brand and shared menu fit; an equivalent shared Button action appears inside the mobile menu, while hero and closing actions remain available.

## Elevation & Depth

The page is mostly flat, using tonal product fields, fine separators, and generous corners. A light shadow signals the scrolled header and primary-button hover. The API window gains depth through native scroll-linked perspective, settling to an upright readable surface as it enters view. The ribbon moves at a separate depth during hero exit.

### Shadow Vocabulary

- **Scrolled header:** `0 3px 12px #20212412`.
- **Primary hover:** `0 3px 8px #174ea622`.

The API window starts at an 8-degree X tilt, -2-degree roll, 0.9 scale, and 28px downward offset, reaching its resting state over `entry 0% cover 45%`. At 800px and below, tilt and roll are zero and starting scale is 0.96. Keyboard focus within the window removes its transform. The hero artwork travels up to 80px and scales to 1.06 over hero exit. These animations run only where native timeline support and motion preferences permit; unsupported browsers retain static readable content. Task-tab content enters over 0.24s with a 6px offset. The protocol demo remains manually selected (`autoPlay={false}`).

**The Motion Access Rule.** Reduced motion disables homepage animations and smooth scrolling, and makes header/button transitions effectively immediate; content and controls stay usable without movement.

## Shapes

Primary actions, model tabs, and phrase highlights use pill silhouettes. Product panels and the closing action panel use the panel radius; the API window uses the window radius, and the console uses the smaller console radius. Below 500px product panels use the window radius. Fine straight separators structure the window and console without turning every item into a card. The fixed header stays a straight full-width bar in both scroll states.

## Components

### Buttons

Reuse the shared `Button`. Primary and inverse actions use the frontmatter's pill shape and padding with a 52px minimum height, reducing to 48px below 800px. Header actions use a 40px minimum, reducing to 36px. Text actions underline on hover. Preserve the shared pressed, disabled, and focus behavior plus the homepage's 2px visible outline with 4px offset. A missing sales destination remains visibly unavailable with honest copy; never invent a contact route.

### Navigation

Reuse `PublicLayout` and `PublicHeader` for the product brand, language/theme controls, authentication state, and mobile menu. The homepage supplies its section links and primary action through existing composition slots. Keep the header geometry stable while its scroll shadow appears. At 500px and below, move the toolbar registration/dashboard action into the shared mobile menu through the existing navigation composition slot. Customer-facing branding is 麟飞科技 (Linfei Technology); preserve New API / QuantumNous / One API attribution and legal notices in the existing footer and attribution surfaces.

### Protocol Window

The broad window contains modest browser chrome, the application/platform/model path, and the reused `HeroTerminalDemo` with shared `Tabs`. Selected protocol tabs have a blue bottom stroke. Keep real request/response content, manual selection, and an explicit illustrative-status note. Do not substitute a static raster or build a second demo implementation.

### Model Tabs

`LandingModelExplorer` composes the shared `Tabs` and link button. Pale blue surrounds the task selector; the selected pill has a white fill on the light theme. Each category changes useful descriptive content and links to the real model/pricing catalog. Availability follows the current catalog rather than fixed homepage claims. Controls wrap without clipping on phones or in longer translations.

### Cards / Containers

The model and management panels use pale blue and pale green respectively. The management panel contains `LandingConsolePreview`: three account/usage figures and a small request-history table on a white surface. Keep the illustrative-preview label and the explicit statement that records are examples. Reuse shared number/currency formatters and normalize language through `toIntlLocale`. The preview does not restyle the actual customer console.

### Imagery

Keep the single generated ribbon raster at `web/public/images/lftech/api-ribbon.webp`, with its existing provenance. It remains decorative (`alt=''`), has intrinsic dimensions, and receives high fetch priority. The separate product mark uses the configured logo. Page copy, controls, and console records remain semantic HTML.

## Do's and Don'ts

### Do:

- **Do** follow the user's pinned Chrome reference and Google Sans preference for the default public homepage.
- **Do** keep homepage colors local while retaining explicit application font preferences.
- **Do** reuse the shared header, footer, buttons, tabs, and original interactive protocol demo.
- **Do** retain keyboard access, translated copy, visible focus, dark surfaces, and reduced-motion behavior.
- **Do** display the Linfei Technology brand and preserve New API / QuantumNous / One API attribution and legal notices.
- **Do** keep the single ribbon raster behind hero copy on every breakpoint, with its provenance intact.

### Don't:

- **Don't** add generated imagery beyond the approved ribbon asset or rasterize interactive content.
- **Don't** restore the superseded serif/deep-blue homepage direction or removed tail chapters.
- **Don't** present illustrative records, protocol metrics, or catalog availability as measured customer evidence.
- **Don't** apply this homepage palette or composition to console themes, custom homepage branches, or authentication layouts.
- **Don't** claim that the bundled Google Sans file covers CJK glyphs or remove system fallback behavior.
