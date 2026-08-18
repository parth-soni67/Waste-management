# WasteWise AI — Design Guide

This file is the single source of truth for anything visual. It overrides
your (Antigravity's/Gemini's) default styling instincts. Read the whole
file before generating any UI code.

## -1. Design tooling available in this workspace — use it

This workspace has design-generation MCP servers/skills installed. Use
them as accelerants, not as a replacement for this guide — every output
they produce still has to pass the rules below (palette, motion,
layout) before it ships.

- **21st.dev Magic MCP** — good for generating individual polished React
  components (buttons, cards, form fields, nav bars) from a natural-
  language description, and for pulling component inspiration. Use it to
  scaffold dashboard/form components fast, then restyle tokens (color,
  radius, font) to match §2–§3 of this guide — don't ship its default
  theme as-is.
- **Stitch MCP** — good for generating and iterating whole screens (e.g.
  "the officer command center dashboard", "the citizen report flow") from
  a prompt, and for keeping multi-screen consistency once one screen's
  "style DNA" is extracted. Use the extract → generate flow: build/
  approve the landing+auth screen first (§5), extract its design context,
  then generate subsequent screens from that context so the whole app
  stays visually consistent.
- **UI/UX Max skill** — apply for general UX quality passes (hierarchy,
  spacing, contrast, accessibility) across whatever screen you're on.

When these tools' output conflicts with this guide (e.g. it defaults to a
dark/purple theme), this guide wins — regenerate with more specific
constraints rather than accepting the default.

## 0. The one rule that matters most

**Do not build the generic "AI app" look**: a near-black dashboard with a
purple-to-blue gradient hero, glowing blob shapes, and a rounded sans-serif
everywhere. That look is now the default output of most AI coding agents
in 2026 — using it makes WasteWise AI look like every other hackathon
project. If at any point you're about to reach for `#0a0a1a` background +
`#7c3aed → #3b82f6` gradient, stop and re-read this file.

WasteWise AI is a **civic, environmental, public-good product**. The design
should feel closer to a well-funded climate-tech or civic-infrastructure
brand than a SaaS dashboard — grounded, optimistic, credible, a little
tactile. Light-mode-first, with a proper dark mode as a toggle, not a
default.

## 1. Brand direction

**Mood**: capable, calm, optimistic, precise. This is infrastructure that
quietly works, not a flashy consumer app.

**Reference feel** (describe-don't-copy — do not reproduce any real brand's
actual assets, wordmark, or copyrighted design elements): the material
warmth of modern climate/sustainability brands, the structural confidence
of civic-tech platforms, and the tactile "light skeuomorphism" resurgence
of 2026 — soft embossed surfaces, believable light sources, and subtle
depth instead of flat glow.

## 2. Color system

Primary palette moves away from purple/blue entirely and instead uses an
**earth + signal** palette: deep forest/moss greens for structure and
trust, warm neutrals for surfaces, and an amber/coral accent for action and
alerts (which also does useful double-duty as the incident-severity color
language).

```
--color-canvas:        #F6F3EC   /* warm off-white, not pure white */
--color-canvas-dark:    #12160F   /* dark-mode base, near-black with green undertone, NOT navy/black-purple */
--color-surface:        #FFFFFF
--color-surface-dark:   #1B211A

--color-ink:            #14201A   /* primary text, deep green-black, not pure #000 */
--color-ink-muted:      #4B5A50

--color-primary:        #1F5E3F   /* deep forest green — primary actions, nav, brand */
--color-primary-strong: #123C29
--color-primary-tint:   #DCEBE0

--color-accent:         #E86A33   /* warm amber-coral — CTAs, highlights, "attention" */
--color-accent-tint:    #FBE4D6

--color-aqua:           #2B8C86   /* secondary accent — used sparingly for data/AI moments */

/* Severity / priority language — reuse across incident UI, not arbitrary reds */
--color-p0-emergency:   #C1272D
--color-p1-veryhigh:    #E86A33
--color-p2-high:        #E3A62F
--color-p3-normal:      #2B8C86
--color-p4-low:         #1F5E3F
```

Rules:
- No purple anywhere in the core palette. If a data-viz chart needs a wider
  categorical palette, extend with olive, clay, and slate tones before
  reaching for violet.
- Dark mode is a real, separately-designed mode (deep green-black, not
  navy/indigo) — never just an inverted light theme, and never the default.
- Gradients, where used (hero backgrounds, the landing 3D scene lighting),
  blend **green → amber/coral** ("canopy to sunrise") or **green → aqua**
  ("canopy to water") — never green → purple → blue.

## 3. Typography

- **Display/headline font**: a confident, slightly humanist geometric
  sans or a low-contrast display serif for the landing hero only (e.g. in
  the family of Fraunces, Söhne, or General Sans — pick one actually
  licensed/available via Google Fonts or a bundled webfont; do not assume
  a paid font is available without checking).
- **Body/UI font**: a clean grotesque (e.g. Inter, Manrope, or Public
  Sans) for all dashboard and form text — legibility first.
- Headlines are large and a little expressive (kinetic type on the
  landing page — see §5) but body copy in the dashboards stays calm,
  static, and highly legible. Don't animate text inside data-dense
  officer/driver screens.

## 4. Layout language

- **Dashboards** (officer/driver): a controlled **bento-grid** layout —
  asymmetric card sizes, clear hierarchy, generous whitespace, cards with
  soft embossed edges (light skeuomorphism: subtle inset highlight + soft
  drop shadow, border-radius ~16–20px) rather than flat glass panels.
- **Landing/marketing surfaces**: allowed more asymmetry and motion — see
  §5.
- **Maps** (command center, driver nav): full-bleed, card chrome floats
  above it with a light glass effect (`backdrop-filter: blur`) — this is
  the one place translucency/glassmorphism is encouraged, since it's
  functionally useful over a live map.
- Avoid perfectly centered, perfectly symmetric hero sections. Slight
  intentional imbalance (off-center headline, staggered cards) reads as
  2026-current; dead-center layouts read as a 2021 template.

## 5. The landing + sign-in experience (build this — it's a first-class deliverable)

This is the first thing a judge sees. Budget real implementation time for
it in Phase 1 of `task.md`. **There is no separate marketing landing page
and login page — they are one screen.** The 3D scene *is* the landing
page's hero, and the auth form sits on top of it as the primary (only)
call to action. A visitor's first view already contains "sign in" /
"create account" — don't build a click-through marketing page in front of
it.

**Reference for the form itself — GitHub's login pattern, not GitHub's
theme.** Study `github.com/login`'s actual UX decisions and reuse the
*pattern*, restyled entirely in this project's palette (§2) and type
(§3):
- A single, small, centered card — not a wide split-screen marketing
  panel. GitHub's own login is famously restrained: mark/logotype, one
  heading, two fields, one primary button, secondary links below.
  Field order: identifier (email/username) → password, primary action
  button full-width and unmistakably the single most prominent element
  on the card.
- Minimal, calm microcopy: "Sign in to WasteWise AI" as the heading, not
  a marketing headline.
- Secondary links below the card in a quiet, small type-size row:
  "Forgot password?" near the password field; "New to WasteWise AI?
  Create an account" below the card, matching GitHub's convention of
  separating "sign in" from "create account" as two lightweight, always-
  visible affordances rather than a tab switch.
- Support a **passkey/WebAuthn option** and standard OAuth-style social
  buttons as secondary options above or below the primary form, styled as
  quiet outlined buttons — this mirrors the current (2026) baseline auth
  UX described in `security_guide.md` §1, not just GitHub's.
- Inline, specific validation errors near the field they refer to
  (never a vague top-of-page banner only) — but the *account-exists*
  question stays generic per `security_guide.md` §1 ("invalid email or
  password", never "no account with that email").
- Keep the card itself free of heavy chrome: light surface, soft
  1px border or subtle shadow (§4's light-skeuomorphism treatment, but
  restrained — this is a small login card, not a dashboard widget), no
  glass/blur needed here since it sits on a deliberately calm zone of the
  3D scene (see below).

**The 3D scene it sits on**: "The city, seen from above, breathing." A
soft scene rendered with **React Three Fiber**, evoking a stylized
low-poly city block or terrain with a slow, ambient rotation — waste
incidents shown as small glowing amber points that pulse and fade as the
scene "collects" them into a vehicle glyph that glides along a curved
path. This visually *tells the product story* (predict → prioritize →
collect) in about 4–6 seconds of ambient loop, entirely passively.

Concrete build spec:

- **Composition**: the 3D scene fills the viewport; the login card sits
  in a fixed, asymmetric position (right third on desktop, e.g.) over a
  calmer region of the scene — reduce mesh density/motion directly behind
  the card so form text stays legible without needing a heavy blur/scrim.
  A thin, deliberate scrim or vignette behind the card is fine; a full
  glass panel is not required here (contrast this with dashboard map
  overlays in §4, where glass *is* the right call).
- **Materials/light**: low-poly isometric city block or abstracted
  terrain mesh, soft directional light + ambient fill, materials in the
  green/amber palette from §2 (no neon, no purple rim-lighting). Subtle
  fog/gradient background in "canopy → sunrise" tones.
- **Motion**: slow auto-rotation (~20–30s per revolution) or a subtle
  cursor/gyroscope-driven parallax — pick one, don't do both. Cap
  parallax to ~5–8° of tilt so it reads as premium, not dizzying.
- **Micro-narrative**: 2–3 amber "incident" points appear on the mesh,
  pulse, then a small vehicle glyph travels a curved bezier path between
  them and they fade — loops seamlessly. A lightweight visual metaphor,
  not a literal feature demo.
- **Headline**: one short, confident line above or beside the card (not
  competing with it) with a kinetic entrance (word-by-word or line-by-line
  reveal via Framer Motion, ease-out, <600ms per line), then static — no
  looping text animation that could distract from the form.
- **Performance & fallback (required, not optional)**:
  - Detect `prefers-reduced-motion` and WebGL support; fall back to a
    static, art-directed 2D gradient/illustration version of the same
    scene (same palette, same composition) — never a blank or broken
    screen, and the login card must render and be usable identically in
    the fallback.
  - Target 60fps on a mid-range laptop GPU; graceful degrade (lower poly
    count / disable parallax, or skip straight to the static fallback) on
    mobile/low-power devices.
  - Lazy-load the 3D bundle; **the form itself must be interactive
    immediately** — mount and hydrate the auth card first, stream the
    3D canvas in behind it, never block the form on the scene loading.
- **Accessibility**: the 3D scene is decorative — never the only carrier
  of information. Form fields fully keyboard-navigable, labeled for
  screen readers, and usable with the canvas absent entirely.

Sign-in, sign-up, and forgot-password are the same layout with swapped
foreground card content over the same persistent scene component — never
unmount/reload the canvas when switching between them (fade/cross-fade
the card only).

Once this screen is built and approved, extract its palette/type/
component "style DNA" (via Stitch MCP if available, per §-1) and reuse it
as the shared design context when generating the citizen, driver, and
officer surfaces in later phases — this is what keeps the whole app
feeling like one product instead of one nice login page bolted onto
generic dashboards.

## 6. Motion principles (whole app, not just landing)

- Motion should explain state change (a new P0 incident arriving, a route
  recalculating, a card entering) — not decorate. If an animation doesn't
  communicate something, cut it.
- Standard easing: ease-out for entrances, ease-in-out for continuous/loop
  motion. Durations: 150–250ms for UI micro-interactions, 400–700ms for
  section/page transitions, longer only for the ambient landing scene.
- Respect `prefers-reduced-motion` everywhere, not just on the landing page.

## 7. Data visualization & map styling

- Custom MapLibre style using the palette above (muted warm basemap,
  forest-green roads/boundaries, amber/coral incident markers scaled by
  severity, aqua for vehicle trails) — do not ship the default
  dark-blue/black map style that most AI-generated dashboards default to.
- Charts: categorical palette extends from primary green through olive,
  clay, and aqua — sequential scales (e.g. hotspot risk) go
  light-amber → deep-coral, not the default blue→purple ramp.

## 8. Component notes

- Buttons: solid `--color-primary` for primary actions, `--color-accent`
  reserved for the single most important action per screen (e.g. "Report
  Waste", "Deploy Vehicle") so it stays meaningful.
- Severity/priority badges (P0–P4) always use the fixed mapping in §2 —
  consistent across incident cards, the map, and analytics, so a judge can
  learn the color language once and read it everywhere.
- Before/after verification images: display as a slider/compare component,
  not two static side-by-side thumbnails — it's a genuinely nice moment to
  make tactile.

## 9. What "done" looks like for this guide

By the end of Phase 1 (`task.md`), a reviewer should be able to look at the
sign-in screen and the officer dashboard and correctly guess this is a
climate/civic-infrastructure product **before** reading any text — not
mistake it for a generic AI SaaS demo.
