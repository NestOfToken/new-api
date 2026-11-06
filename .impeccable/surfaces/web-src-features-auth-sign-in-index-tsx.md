---
version: 1
slug: "web-src-features-auth-sign-in-index-tsx"
primary_target: "web/src/features/auth/sign-in/index.tsx"
related_targets: ["web/src/features/home/components/landing-page.tsx"]
---

## Direction contract

Visitor mode: Operate. The existing authentication task and controls lead; the approved ribbon supplies continuity and a bounded brand moment.

THESIS: Adopt the user's approved “丝带归位” draft: the homepage's public branding and headline reorganize into a split login surface while a live ribbon folds into its left artwork field. The right form unfolds rather than fading in as a replacement screen.

OWN-WORLD: Inherit Linfei blue, pale blue and white, the existing Google Sans default and dark equivalents. Homepage raster opacity, optical-lane opacity, typography and product content remain unchanged. No new raster assets.

STORY: Existing enterprise API customers enter the same guarded sign-in route and use its existing password, Passkey, OAuth, legal-consent, CAPTCHA and MFA paths. A familiar homepage visual becomes the left-hand companion to the working form.

FIRST VIEWPORT: Desktop has a 58/42 left artwork/right form split, stable upper-left brand, lower-left product headline, upper-right home/language/theme controls and a 420px maximum form. Mobile stacks a compact artwork band above the form. The heading receives focus without opening a keyboard. Art pauses on demand and when offscreen/hidden; reduced motion uses a static frame. Route history restores the homepage position.

FORM: Code-led implementation of the user-selected interactive draft at C:/Users/exlau/.codex/visualizations/2026/11/05/01a1ac8e-545c-7b62-8aca-1142153ea934/lftech-login-drafts.html, variant 丝带归位. User-pinned direction; no randomized selection. seed: none (user-pinned).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Documentation authority

This is an ordinary surface extension in the established visual world, explicitly authorized by the owner after selecting the working “丝带归位” draft. The homepage-scoped DESIGN.md and .impeccable/design.json remain unchanged: their authentication exclusions describe the boundary of that earlier homepage work. For `/sign-in` alone, this owner-approved brief now records the additional layout, bounded canvas, shared public-element transitions, playback controls, and mobile behavior. It does not authorize palette or layout changes to the console, other authentication routes, or custom homepages. The existing homepage color and font tokens remain the visual authority. Under reduced motion, the ribbon is static and the playback control is hidden.

## Reuse and security scope

Reuse UserAuthForm, PasswordInput, OAuthProviders, LegalConsent, Turnstile, TermsFooter, SystemBrand, Button, LanguageSwitcher and ThemeSwitch. Existing AuthLayout serves the other authentication routes and remains unchanged. AnimateInView and LandingOpticalRibbon do not morph geometry across routes; the new bounded canvas fills that specific gap without replacing either.

Applicable guidance: OWASP ASVS 5.0.0 (stable, 2025-05-30), Authentication Cheat Sheet (password-manager-compatible forms, paste and keyboard access; generic authentication responses; MFA), Session Management Cheat Sheet (existing server-side lifecycle and guards). Sources: https://asvs.owasp.org/ , https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html , https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html . Credentials are never cloned or rendered into canvas; only the public brand and marketing headline have native transition names. No authentication endpoint, challenge, token, storage or session policy changes are part of this presentation extension. Validate the existing authentication regressions and the real form inside the new layout; this is not a whole-product ASVS audit.

## Validation and finish

Verified with Bun 1.4.4 from `web/`: `bun check -b`; changed-file `oxlint -c .oxlintrc.json` and `oxfmt --check`; `bun run build`; seven focused Vitest suites (52 tests) covering the new layout, homepage, branding, MFA login verification, Passkey domains, auth redirects and session handling. `bun run test:auth-layout` builds on an existing production build and exercises an isolated Chrome with synthetic local API fixtures: the real router guard precedes form mounting, native public-element transitions resolve, reverse navigation restores scroll after asynchronous home loading, direct redirect search survives, password controls have their approved size, mobile 320/390 layouts do not overflow, dark/reduced-motion/long-provider layouts remain usable, and pause stops the artwork. Homepage raster opacity stays at the incumbent computed value 0.82; neither homepage stylesheet nor optical-ribbon component was edited. The test fixture makes no live account or upstream requests.

The whole-repository `node scripts/add-copyright.mjs --check` reports 26 existing header issues, all outside the changed files; they were not repaired in this task. Existing DESIGN.md and its token sidecar were compared and preserved as homepage-scoped authority. No raster was created or replaced.

Independent finish review: initial disposition `fix`; the two listed fixes (scope documentation and reduced-motion playback) were scored resolved, final disposition `ship` at that fix-list scope. Captures and browser results live in `.impeccable/review/auth/`. Static captures alone do not certify live animation; browser interaction checks and source inspection provide the motion evidence. These implementation checks were completed before publication.
