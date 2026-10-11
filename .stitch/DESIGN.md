# Design System: Meander

## 1. Overview

Meander is a private, offline desktop weekly planner. Its interface must
disappear: a calm, low-density work surface where planned effort vs. available
capacity is legible at a glance. Nothing is decorative, nothing shouts.
Accessibility floor: WCAG AA.

**Mode:** Dark is the default experience; a light theme exists and is
user-switchable. Treat dark as the primary canvas in all generated screens.

## 2. Color

### Dark theme (default)

- `background` — `#121417` (app canvas)
- `surface` — `#1A1D21` (cards, columns, panels)
- `surface-raised` — `#22262B` (hover, active surfaces, popovers)
- `text` — `#E8EAED` (primary text; 13:1 on surface)
- `text-muted` — `#9AA0A6` (secondary text, metadata; ≥4.5:1)
- `border` — `#2E3338` (hairlines only, used sparingly)
- `primary` — `#2DD4BF` (muted teal: links, focused states, primary actions)
- `on-primary` — `#0B1B19` (text/icons on primary fills; ≥4.5:1)

### Light theme

- `background` — `#FAFAFA`, `surface` — `#FFFFFF`, `surface-raised` — `#F1F3F4`
- `text` — `#1F2328`, `text-muted` — `#5F6368`, `border` — `#E2E5E8`
- `primary` — `#0F766E`, `on-primary` — `#FFFFFF`

### Threshold tint palette

Threshold colors are **always user-configurable**: for every threshold the user
either picks from this predefined palette or defines a fully custom color via a
color picker. The palette is the pool that default per-category colors are
drawn from, and the global threshold's default is `threshold-red`.

All threshold colors apply exclusively as **tints** — the color at 10–20%
alpha over the surface, never as saturated fills. Columns, cards, and
gradients between multiple reached thresholds all follow this rule. No
traffic-light semantics: a tint means "this threshold was reached", nothing
else.

- `threshold-red` — `#F87171`
- `threshold-orange` — `#FB923C`
- `threshold-amber` — `#FBBF24`
- `threshold-lime` — `#A3E635`
- `threshold-green` — `#4ADE80`
- `threshold-emerald` — `#34D399`
- `threshold-cyan` — `#22D3EE`
- `threshold-blue` — `#60A5FA`
- `threshold-indigo` — `#818CF8`
- `threshold-violet` — `#A78BFA`
- `threshold-fuchsia` — `#E879F9`
- `threshold-pink` — `#F472B6`

## 3. Typography

- **Font:** Inter for everything — display, body, labels. Single-family UI.
- Hierarchy through weight and size, not additional families:
  - `display` — 24px / 600 (page titles)
  - `title` — 16px / 600 (section headers, nav wordmark)
  - `body` — 14px / 400 (content, controls)
  - `label` — 12px / 500 (metadata, counts, captions)

## 4. Shape & Spacing

- **Roundness:** Medium. `8px` on cards/columns/buttons, `4px` on small chips
  and tags, `9999px` only for true pills/avatars.
- **Density:** Generous. `16px` base spacing grid; `24px`+ between sections;
  `12px` inside cards. Prefer whitespace over borders.
- **Elevation:** No heavy shadows. Layer via surface tones
  (`background` < `surface` < `surface-raised`); subtle 1px `border` only where
  tone alone can't separate.

## 5. Components

- **Left rail navigation** — the persistent app shell: slim sidebar
  (~224px), wordmark on top, nav items below. Active item reads via
  `surface-raised` background plus `primary` text/icon; no underlines, no pills.
- **Cards** — `surface` background, `8px` radius, `12px` padding, no border by
  default.
- **Buttons** — primary: `primary` fill + `on-primary` text; secondary:
  transparent + `border` + `text`. `8px` radius, clear `:focus-visible` ring
  in `primary`.
- **Form controls** — `surface-raised` inputs, `border` on focus replaced by a
  `primary` ring; labels in `text-muted` `label` type.

## 6. Don'ts

- Don't render threshold colors as full-saturation fills — tints only.
- Don't use pure black `#000` or pure white `#FFF` as backgrounds.
- Don't use decorative gradients, illustrations, or icon clutter in the shell.
- Don't reduce text contrast below AA (4.5:1 body, 3:1 large text).
