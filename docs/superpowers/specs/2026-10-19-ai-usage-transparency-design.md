# AI Usage Transparency Report — Design

Date: 2026-10-19

## Intent

The README should carry an honest, glanceable signal for visitors about how
much AI was involved in building this project — per lifecycle stage, not just
one vague claim. A badge shows the average score; a custom SVG gauge shows the
per-stage breakdown; optional explanations are available one click away.

Scale semantics: each stage scores an **integer** 0–5 (no fractional stage
scores — the editor is a 0–5 segmented control plus a "not rated" option),
where **0 = "No AI at all"** and **5 = "Only vibes"**. The score communicates
_density of AI usage_, never quality — neither end is good or bad. A stage
may be unrated (`null`), shown as a dashed "not yet rated" bar and excluded
from the average. Fractional fills appear only in the average badge.

## Goals

- Graphical, colorful gauge — not a markdown table.
- Color encodes only "how far along", never good/bad (no red/green).
- Correct in GitHub light and dark mode.
- Single source of truth (a data file) with a tool to regenerate all assets,
  so future updates are one edit + regenerate.
- The tool is project-agnostic and reusable for other repos later.

## Non-goals / anti-goals

- Not a live service, no tracking, no CI metrics — a manually curated snapshot.
- No framework, build step, or dependencies in the tool — a plain static page.
- The tool must not integrate with the meander app toolchain (no imports into
  `src/`, not part of vite build/test/lint).
- Anti-goal: anything that makes a high score look like a failure or a low
  score like a virtue.

## The visual

**Gauge** (one row per stage): stage label left, a 300×18px pill bar, score
right. The bar is a single rounded rect clipped to a fixed horizontal gradient
**cyan `#00e5ff` → violet `#7c4dff` → magenta `#ff2d96`** (neon "synthwave").
The score reveals that much of the gradient; the remainder is a light neutral
fill. 5 cells are separated by thin divider lines. Empty/unrated stages render
as a dashed empty outline labelled "not yet rated".

**Average badge**: a mini version of the same mechanic — chip containing
"avg", a 5-cell mini bar filled to the average (fractional values fill a
partial cell — 3.5 = 3 cells + half of the 4th), and the text "3.5 / 5".

**Theming**: light and dark variants of both SVGs, selected in the README via
`<picture>` + `<source media="(prefers-color-scheme: dark)">`.

- Light: stage text `#334155`, score `#0f172a`, empty cells `#eef1f6`,
  dividers `#fff`, badge chip `#fff` with `#e2e8f0` border.
- Dark: stage text `#c9d1d9`, score `#f0f6fc`, empty cells `#21262d`,
  dividers `rgba(13,17,23,0.7)`, badge chip `#161b22` with `#30363d` border.

Typography: `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`.

## The tool

`tools/ai-usage-report/` — a fully self-contained static page
(`index.html`, inline or sibling `.js`/`.css`, zero dependencies, works on
`file://` and any static host). The folder gets its own `README.md`
describing what the tool does and how to use it: how to edit stages, export,
and embed the generated assets (the `<picture>` snippets, the badge, the
`<details>` block) in a GitHub README — written so it still makes sense if
the tool is later copied out or hosted standalone.

Features:

- Editable stage list: name, score 0–5 or "not rated", optional explanation
  (free text, one line). Stages can be added/removed/reordered — the seven
  meander stages (Specification, Architecture, UI Design, Implementation,
  Review, Testing, Documentation) are just this project's data.
- Live preview of gauge + badge (light and dark side by side).
- **Save data**: download `data.json` (the portable source of truth).
- **Load data**: file picker restores a previously exported `data.json`.
- **Export**: download `ai-usage.zip` (store-only zip written in JS, no lib)
  containing:
  - `ai-usage.svg`, `ai-usage-dark.svg` (gauge)
  - `ai-usage-avg.svg`, `ai-usage-avg-dark.svg` (badge)
  - `data.json`
  - `README-snippet.md` — the ready-to-paste markdown: `<picture>` block for
    the gauge, badge image, scale legend (0 = no AI, 5 = only vibes), and a
    `<details>` "Per-stage explanations" block listing each stage with its
    score and explanation (omitting stages without explanations).
- An "asset path" text field (default `docs/ai-usage/`) that controls the
  image paths in the generated snippet, so the tool stays repo-agnostic.
- Average computed by the tool (mean of rated stages, 1 decimal). When no
  stage is rated, the badge renders an empty bar and "— / 5".

## This repo's usage

- Generated assets live in `docs/ai-usage/` (gauge + badge, light + dark, plus
  this project's `data.json` copied there so the current values are committed).
- README gains a section (near the top, after the badges block) embedding the
  gauge and badge via `<picture>` plus the legend and `<details>` block.
- Current scores: Specification 1, Architecture 4, UI Design 4,
  Implementation 5, Review 3, Testing 4, Documentation unrated → avg 3.5.
- Explanations (from the author): spec — "AI corrected mistakes and filled in
  gaps"; architecture — "I skimmed the AI design and corrected where needed";
  UI design — "AI had free hand with some directions"; implementation —
  "fully AI generated"; review — "both AI and human review, not fully
  thorough"; testing — "AI wrote the tests; I adjusted and did manual testing".

## Builder's discretion (my calls)

- Exact folder names: `tools/ai-usage-report/` for the tool,
  `docs/ai-usage/` for generated assets.
- File format `data.json`; filename conventions `ai-usage{,-dark}.svg`,
  `ai-usage-avg{,-dark}.svg`.
- Zip via store-only (no compression) encoder written in-page.
- README section title: "AI usage transparency".
- No tests required for the tool (it's authoring tooling, not shipped
  product), but keep it small enough to verify by opening the page.
