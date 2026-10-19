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

Open `index.html` in a browser, or serve the folder as a static site — it
works both ways and needs no build step.

- Edit stage names, pick a score (0–5 or "not rated"), add an optional
  explanation.
- Reorder stages with the ↑/↓ buttons; add or delete stages freely.
- Set the **asset path** to the folder where you will commit the generated
  files in your repository (default `docs/ai-usage/`). This becomes the URL
  prefix in the generated snippet.
- Watch the live light/dark preview on the right.
- **Export zip** downloads all six files at once; **Download data.json**
  exports just the data; **Load data.json** restores a previous report.

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
