# AI Usage Transparency Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a graphical AI-usage transparency report to the README, plus a standalone static tool that generates its assets.

**Architecture:** A self-contained static tool under `tools/ai-usage-report/` (no deps, no repo toolchain integration) renders SVG gauges/badges from `data.json` in the browser and exports a zip. The same pure render module runs under `node --test` for TDD and under a `generate.mjs` script to write this repo's assets into `docs/ai-usage/`. The README embeds light/dark variants via `<picture>`.

**Tech Stack:** vanilla HTML/CSS/JS (ES modules), SVG, `node:test`, conventional commits.

**Spec:** `docs/superpowers/specs/2026-10-19-ai-usage-transparency-design.md`

## Global Constraints

- Stage scores are **integers 0–5 or `null`** (unrated). Only the average badge uses fractional fill.
- Neon gradient stops, verbatim: `#00e5ff` → `#7c4dff` → `#ff2d96` at offsets 0 / 0.5 / 1.
- Light theme: stage text `#334155`, score `#0f172a`, empty cells `#eef1f6`, dividers `#fff`, chip `#fff`/`#e2e8f0`.
- Dark theme: stage text `#c9d1d9`, score `#f0f6fc`, empty cells `#21262d`, dividers `rgba(13,17,23,0.7)`, chip `#161b22`/`#30363d`.
- Font stack: `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`.
- Filenames: `ai-usage.svg`, `ai-usage-dark.svg`, `ai-usage-avg.svg`, `ai-usage-avg-dark.svg`.
- Zero dependencies, zero build step; tool must not import from or be imported by `src/`, vite, vitest, or the pre-commit toolchain.
- Conventional commits; the tool is excluded from repo lint/test tooling (it is not part of the app).

## Review Focus

- **XML-unsafe text** in stage names/explanations (`&`, `<`, `>`, quotes, emoji) — must be escaped in generated SVG and snippet markdown.
- **Out-of-range/garbage scores** in a hand-edited `data.json` (e.g. `7`, `-1`, `"high"`) — clamp/reject to 0–5|null, never emit a broken gauge.
- **Long stage names or explanations** overflowing the 300px bar / snippet layout.
- **Many stages** (e.g. 12) — gauge height must grow with rows.
- **All stages unrated** — badge shows empty bar + "— / 5" (per spec); gauge still renders.

---

### Task 1: SVG render module — gauge

**Files:**

- Create: `tools/ai-usage-report/render.js`
- Test: `tools/ai-usage-report/render.test.mjs`

**Interfaces:**

- Produces:
  - `THEMES = { light: {...}, dark: {...} }` — the Global Constraints colors.
  - `renderGauge(stages, theme) -> string` — full `<svg>` document. `stages` = `[{ name: string, score: 0|1|2|3|4|5|null }]`. Rows are 30px apart; label col 0–120px, bar at x=130, width 300 (5 cells of 60px, height 18, rx 9), score at x≈445. Height = `rows*30 + 16`.
  - `escapeXml(s: string) -> string` — escapes `& < > " '`; used for every text node.

- [ ] **Step 1: Write failing tests** in `render.test.mjs` using `node:test`/`node:assert`:
  - `renderGauge` output for `[{name:"Specification",score:1}]` light theme: contains the gradient id, a rect of width 60 filled `url(#...)`, an `#eef1f6` mask rect starting at x=60, and text `1`.
  - `score: 5` emits no empty-fill mask rect; `score: null` emits a `stroke-dasharray` outline and text `not yet rated`, no gradient.
  - Dark theme uses `#21262d` empty fill.
  - `escapeXml("<b>&\x27")` → `&lt;b&gt;&amp;&#x27;`.

- [ ] **Step 2:** Run `node --test tools/ai-usage-report/` — expect failures (module missing).

- [ ] **Step 3:** Implement `render.js` with `escapeXml`, `THEMES`, `renderGauge` (gradient `<linearGradient id>` namespaced per theme, `<clipPath>` rounded bar, white/dark divider strokes, `stroke-dasharray="5 4"` unrated row). Truncate stage labels longer than ~18 chars with `…` so they can't collide with the bar.

- [ ] **Step 4:** `node --test` — all pass.

- [ ] **Step 5:** Commit `feat(tools): add ai-usage gauge svg renderer`.

### Task 2: Average + badge renderer

**Files:**

- Modify: `tools/ai-usage-report/render.js`
- Test: `tools/ai-usage-report/render.test.mjs`

**Interfaces:**

- Produces (new exports, same module):
  - `averageScore(stages) -> number|null` — mean of rated scores, rounded to 1 decimal; `null` when none rated.
  - `renderBadge(avg, theme) -> string` — chip 240×30, "avg" label, 120×14 mini bar (cells of 24px), fill width `avg/5*120` (supports halves), text `${avg} / 5` or `— / 5` when `avg === null`.

- [ ] **Step 1:** Failing tests: `averageScore([{score:1},{score:4},{score:null}])` → `2.5`; all-null → `null`; badge for 3.5 emits mask at x=84 (3.5/5*120=84) and text `3.5 / 5`; badge for `null` emits `— / 5` and no gradient fill.

- [ ] **Step 2–4:** Run-fail, implement, run-pass (same commands as Task 1).

- [ ] **Step 5:** Commit `feat(tools): add average badge renderer`.

### Task 3: README snippet generator + input sanitizing

**Files:**

- Modify: `tools/ai-usage-report/render.js`
- Test: `tools/ai-usage-report/render.test.mjs`

**Interfaces:**

- Produces (same module):
  - `sanitizeStages(raw) -> stages` — coerces a parsed `data.json` array: keeps `name` (string, trimmed, fallback `Stage N`), `score` (integer clamped to 0–5, else `null`), `explanation` (string, trimmed, may be empty). Non-object entries dropped.
  - `renderReadmeSnippet(stages, avg, assetPath) -> string` — markdown: `<picture>` with dark/light `<source>`/`img` for gauge + badge, legend line "0 = no AI at all · 5 = only vibes", and `<details><summary>Per-stage explanations</summary>` listing `**Name (N)** — explanation` only for stages with non-empty explanations (whole block omitted if none). `assetPath` is joined to filenames as `${assetPath.replace(/\/$/,'')}/ai-usage.svg` etc.

- [ ] **Step 1:** Failing tests: `sanitizeStages` on `[{name:" A ",score:7},{name:5,score:"hi"},null]` → `[{name:"A",score:5,explanation:""}]` (score clamped, name fallback applied, bad entries dropped); snippet with `assetPath:"docs/ai-usage/"` contains `srcset="docs/ai-usage/ai-usage-dark.svg"`; stage without explanation absent from details block; stage named `A <b>` appears escaped in details.

- [ ] **Step 2–4:** Run-fail, implement, run-pass.

- [ ] **Step 5:** Commit `feat(tools): add readme snippet generation and data sanitizing`.

### Task 4: Store-only zip encoder

**Files:**

- Create: `tools/ai-usage-report/zip.js`
- Test: `tools/ai-usage-report/render.test.mjs` (append, or `zip.test.mjs`)

**Interfaces:**

- Produces: `zipSync(files: Array<{name: string, data: Uint8Array}>) -> Uint8Array` — valid store-only zip (no compression), UTF-8 filenames. CRC32 computed internally.

- [ ] **Step 1:** Failing tests: output starts with bytes `0x50 0x4B 0x03 0x04`, ends with EOCD `0x50 0x4B 0x05 0x06`, and `unzip -t`/`unzip -p` round-trip verified via a test that shells out (`node:child_process` execSync `unzip -p` on a temp file) if `unzip` exists — else assert CRC of stored data matches `zlib.crc32` from `node:zlib`.

- [ ] **Step 2–4:** Run-fail, implement (local file headers + central directory + EOCD, CRC32 table), run-pass.

- [ ] **Step 5:** Commit `feat(tools): add dependency-free zip encoder`.

### Task 5: Generator script for repo assets

**Files:**

- Create: `tools/ai-usage-report/generate.mjs`
- Test: `tools/ai-usage-report/render.test.mjs` (append)

**Interfaces:**

- Consumes: `renderGauge`, `renderBadge`, `renderReadmeSnippet`, `sanitizeStages`, `averageScore` from `render.js`; `zipSync` not needed here.
- Produces: `node generate.mjs <data.json> --out <dir>` writes the 4 SVGs + `README-snippet.md`. Also used in Task 8 to produce `docs/ai-usage/`.

- [ ] **Step 1:** Failing test: run `generate.mjs` via execSync against a fixture `data.json` in `os.tmpdir()`, assert the 5 output files exist and the snippet contains the passed `--assets` path (CLI args: `--out <dir> --assets <path-prefix>`, default `docs/ai-usage`).

- [ ] **Step 2–4:** Run-fail, implement (read/parse/sanitize/write), run-pass.

- [ ] **Step 5:** Commit `feat(tools): add ai-usage asset generator script`.

### Task 6: Editor page (index.html + app.js)

**Files:**

- Create: `tools/ai-usage-report/index.html`, `tools/ai-usage-report/app.js`

**Interfaces:**

- Consumes: all of `render.js` + `zipSync` as ES modules (`<script type="module">`).
- Produces: the tool UI. No exports; `app.js` wires DOM to render functions.

- [ ] **Step 1:** Build `index.html`: header, stage-editor list, per-stage row = drag handle (or ↑/↓ buttons), name input, segmented control 0–5 + "not rated", explanation input, delete button; "Add stage" button; controls: asset-path text field (default `docs/ai-usage/`), "Load data.json" file input, "Download data.json", "Export zip"; live preview pane showing light and dark gauge + badge side by side. Minimal CSS inline in `<style>` matching the slate/neon aesthetic.

- [ ] **Step 2:** `app.js`: state = stages array; re-render previews on every change via `renderGauge`/`renderBadge`; downloads via `Blob` + `URL.createObjectURL` (single files) and `zipSync` (zip). Load: `FileReader` → `JSON.parse` → `sanitizeStages`. Seed default state with the meander data from the spec.

- [ ] **Step 3:** Manual verification — `python3 -m http.server` (or `file://`) open page: edit a score, see preview change in both themes; export zip; `unzip -l` shows 6 entries. Record in commit message.

- [ ] **Step 4:** Commit `feat(tools): add ai-usage report editor page`.

### Task 7: Tool README

**Files:**

- Create: `tools/ai-usage-report/README.md`

- [ ] **Step 1:** Write README: what it is (AI-usage transparency report generator), the 0–5 scale meaning, how to use (open index.html / serve statically, edit stages, export), what the zip contains, how to embed the output in a GitHub README (`<picture>` snippet + badge + `<details>`), how `data.json` round-trips, and the `generate.mjs` CLI usage for scripted regeneration. Standalone-readable (no meander references).

- [ ] **Step 2:** Commit `docs(tools): document ai-usage report tool`.

### Task 8: Generate assets + wire into meander README

**Files:**

- Create: `docs/ai-usage/data.json`, `docs/ai-usage/ai-usage*.svg` (4), `docs/ai-usage/README-snippet.md`
- Modify: `README.md`

- [ ] **Step 1:** Create `docs/ai-usage/data.json` with the spec's stages/scores/explanations (Specification 1, Architecture 4, UI Design 4, Implementation 5, Review 3, Testing 4, Documentation null; explanations verbatim from spec).

- [ ] **Step 2:** Run `node tools/ai-usage-report/generate.mjs docs/ai-usage/data.json --out docs/ai-usage --assets docs/ai-usage` — verify 5 files, open `ai-usage.svg` to eyeball it.

- [ ] **Step 3:** Insert into `README.md` after the badge block (before "Offline desktop weekly kanban planner" line or right after it — put the snippet's content as a `## AI usage transparency` section): paste generated `README-snippet.md` contents.

- [ ] **Step 4:** Verify: `git diff README.md` sane; render check optional via markdown preview.

- [ ] **Step 5:** Commit `docs: add ai usage transparency report to readme`.

---

## Self-review notes

- Spec coverage: gauge ✓(T1), badge ✓(T2), theming ✓(T1–2), details/snippet ✓(T3), tool UI ✓(T6), zip export ✓(T4), data.json save/load ✓(T6), tool README ✓(T7), repo integration ✓(T8), integer-only scores ✓(T3 sanitize + T6 segmented control), asset-path field ✓(T3/T6), all-unrated "— / 5" ✓(T2).
- Review Focus covered: XML escaping → T1/T3 tests; garbage scores → T3; many stages → `renderGauge` height formula in T1; unrated → T1/T2. Long-name overflow is mitigated by truncating labels at ~18 chars with ellipsis in `renderGauge` (implementer note in T1).
