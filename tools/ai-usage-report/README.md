# AI Usage Transparency Report

A small, dependency-free tool that generates a visual "AI usage" report for a
repository README. Each stage of the development lifecycle is scored on a 0–5
scale:

- **0** — no AI at all
- **5** — only vibes

The scale reports usage density, not quality: neither end is meant to read as
good or bad. Filled cells reveal a fixed neon gradient; the score controls how
much of it shows.

## What it produces

- `ai-usage.svg` / `ai-usage-dark.svg` — a five-cell gauge per stage
- `ai-usage-avg.svg` / `ai-usage-avg-dark.svg` — an average-score badge
  (one decimal, e.g. `3.5 / 5`)
- `data.json` — the stage data, for later re-editing
- `README-snippet.md` — ready-to-paste markdown with theme-aware
  `<picture>` tags, a legend, and a collapsible per-stage explanations block

Stages without a score render as a dashed "not yet rated" bar and are excluded
from the average. Optional per-stage explanations appear in a `<details>`
block in the snippet.

## Using the editor

Serve the folder locally and open `index.html`, or host it as a static
site — no build step needed:

```sh
cd tools/ai-usage-report && python3 -m http.server 8000
# then open http://localhost:8000/
```

(Opening `index.html` directly via `file://` only works in browsers that
allow module scripts on local files — Chromium blocks them, and the page
shows a warning when that happens.)

- Edit stage names, pick a score (0–5 or "not rated"), add an optional
  explanation.
- Reorder stages with the ↑/↓ buttons; add or delete stages freely.
- Set the **asset path** to the folder where you will commit the generated
  files in your repository (default `docs/ai-usage/`). This becomes the URL
  prefix in the generated snippet.
- Watch the live light/dark preview on the right.
- **Export zip** downloads all six files at once; **Download data.json**
  exports just the data; **Load data.json** restores a previous report.
- The **README markdown** panel shows the exact snippet to paste into a
  README — copy it with the **Copy** button. Image URLs use the
  asset-path field as the prefix.

Unzip into your repository (e.g. `docs/ai-usage/`), commit the SVGs and
`data.json`, and paste `README-snippet.md` into your README.

## Embedding in a GitHub README

The generated snippet looks like this:

```html
<picture>
  <source
    srcset="docs/ai-usage/ai-usage-dark.svg"
    media="(prefers-color-scheme: dark)"
  />
  <img
    src="docs/ai-usage/ai-usage.svg"
    alt="AI usage transparency: per-stage gauge from 0 (no AI) to 5 (only vibes)"
    width="520"
  />
</picture>
```

GitHub renders the dark variant for visitors using dark mode and the light
one otherwise — no JavaScript needed. The badge and `<details>` explanation
block follow the same pattern.

> **Note:** the SVGs use shared internal `id`s for gradients and clip paths.
> They are designed to be referenced via `<img>`/`<picture>` (as the snippet
> does). If you inline multiple same-theme SVGs into one HTML page instead,
> the ids can collide — regenerate or rename ids in that case.

## Scripted regeneration

`generate.mjs` regenerates the assets from a `data.json` without opening the
editor — useful after a manual edit or in CI:

```sh
node generate.mjs docs/ai-usage/data.json --out docs/ai-usage --assets docs/ai-usage
```

- `<data.json>` — input file with the stage list
- `--out` — directory the five output files are written to
- `--assets` — path prefix embedded in `README-snippet.md` (default
  `docs/ai-usage`)

## data.json format

```json
[
  {
    "name": "Implementation",
    "score": 5,
    "explanation": "Fully AI generated"
  },
  {
    "name": "Documentation",
    "score": null,
    "explanation": ""
  }
]
```

Scores are integers 0–5 or `null` (not yet rated). Input is sanitized on
load: non-integer scores become `null`, out-of-range values are clamped, and
malformed entries are dropped.
