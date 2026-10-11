# Scaffold and Validation Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the Meander Tauri application and its full validation harness so every later feature lands on a tested, linted, CI-checked base.

**Architecture:** Standard Tauri 2 layout at repo root: `src/` Vite+React+TS frontend, `src-tauri/` Rust crate. No domain logic yet — this plan only creates the shell, the four test layers (Vitest/RTL, Playwright-with-mocked-Tauri, cucumber-rs, WebdriverIO smoke), lint/commit-hook tooling, and CI, then removes the dummy artifacts.

**Tech Stack:** Tauri 2, Rust (stable), React 18+ via Vite + TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui, Vitest + React Testing Library, Playwright, cucumber-rs, WebdriverIO + `@wdio/tauri-service` + tauri-driver, lefthook + commitlint + prettier + eslint, GitHub Actions.

**Spec:** `docs/specification.md` (non-functional requirements, testing stack), `docs/architecture/overview.md` (module layout, testing layers), `docs/tasks/big-picture-plan.md` steps 1–7 (the steps this plan implements).

## Global Constraints

- One git branch + one PR per task, in plan order; each task branches off `main` after the previous PR merges. After pushing a branch, open the PR against `main` via the GitHub MCP `create_pull_request` tool (owner `Rrayor`, repo `meander`).
- Conventional commit messages on every commit (`feat:`, `chore:`, `test:`, `ci:` as appropriate). Task 5 enforces this via commit-msg hook.
- Commit hooks must NOT run tests (repo plan step 5) — format/lint checks only.
- Package manager is `npm` only. No pnpm/yarn artifacts.
- `node_modules/` and `src-tauri/target/` are gitignored; never committed.
- All dummy/demo code created here is removed in Task 7 — keep it minimal.
- My calls (user did not decide these): app identifier `com.github.rrayor.meander`; lefthook for hooks (single config file covering cargo + npm checks); Tailwind v4 via the Vite plugin; no Stitch design for the throwaway demo component (Stitch starts when real UI work begins at repo-plan step 9); Vitest + dummy component test folded into Task 1 so step 1's "dummy tests run" criterion covers the frontend toolchain.
- Machine already has: DISPLAY `:0`, webkit2gtk4.1-devel/gtk3-devel/libsoup3-devel/openssl-devel installed. If a Playwright browser fails to launch on Fedora, install: `sudo dnf install atk at-spi2-atk cups-libs libdrm libXcomposite libXdamage libXrandr mesa-libgbm alsa-lib pango nss libxkbcommon` — ask the user, never run sudo.

## Review Focus

- **Rust MSRV drift:** the machine ships rustc 1.84; current tauri/clap/etc. deps may require newer. Task 1 runs `rustup update stable` first — do not skip it.
- **Playwright on Fedora:** officially unsupported for `install-deps`. Task 2's verification is the browser actually launching, not just installing.
- **WDIO flakiness:** tauri-driver + real webview is the heaviest, most timing-sensitive check in the repo (both locally and in CI under xvfb). Keep the smoke spec to one trivial assertion; resist adding more.
- **Scaffold drift:** `create-tauri-app` output changes between versions. Steps pin observable behavior (dev port 1420, `src-tauri/src/lib.rs` exists with `pub fn run()`), not exact generated file contents — verify, don't assume.
- **Tauri mock divergence:** the Playwright fixture stubs `window.__TAURI_INTERNALS__.invoke`. Every later feature plan that adds backend commands must extend it; a mock that silently returns `undefined` will produce green tests over a broken app.

---

### Task 1: Tauri + React scaffold with Tailwind, shadcn demo, Vitest

Implements repo-plan step 1. Branch: `chore/step-01-tauri-scaffold`.

**Files:**

- Create: entire app scaffold — `package.json`, `index.html`, `vite.config.ts`, `tsconfig*.json`, `src/`, `src-tauri/` (moved in from a temp scaffold dir)
- Create: `src/test/setup.ts`, `src/App.test.tsx`
- Modify: `vite.config.ts` (tailwind + test config), `src/index.css` (tailwind import), `src/App.tsx` (demo component), `tsconfig.json` + `tsconfig.app.json` (`@/` path alias), `vite.config.ts` (resolve alias)

**Interfaces:**

- Produces: `npm run dev` serves on `http://localhost:1420`; `npm run test` runs Vitest; `cargo test --manifest-path src-tauri/Cargo.toml` runs Rust tests; `src-tauri/src/lib.rs` exposes `pub fn run()` and `pub fn health() -> &'static str` (dummy, returns `"ok"`); `npm run tauri dev` opens a window showing a heading and a shadcn `Button`.

- [ ] **Step 1: Update Rust toolchain**

Run: `rustup update stable && rustc --version`
Expected: rustc >= 1.85.

- [ ] **Step 2: Scaffold into a temp dir and move into repo root**

```bash
npx create-tauri-app@latest meander-scaffold -t react-ts -m npm --identifier com.github.rrayor.meander -y
mv meander-scaffold/* meander-scaffold/.[!.]* . && rmdir meander-scaffold
```

Verify: `ls` shows `package.json`, `src/`, `src-tauri/` at repo root alongside `docs/`; `git status` shows only new files, no modifications to `docs/` or `AGENTS.md`.

- [ ] **Step 3: Install deps and verify the bare scaffold**

Run: `npm install && npm run build && cargo build --manifest-path src-tauri/Cargo.toml`
Expected: both succeed. If cargo fails on a dep's `rust-version`, that dep needs pinning or the toolchain check in Step 1 was skipped.

- [ ] **Step 4: Verify the window opens**

Run: `timeout 25 npm run tauri dev` (DISPLAY `:0` is available)
Expected: dev server starts, webview opens, no panic in output before timeout kills it. If the webview cannot open in this environment, record it and verify with `cargo build` only — flag to user at PR time.

- [ ] **Step 5: Add Tailwind v4**

```bash
npm i -D tailwindcss @tailwindcss/vite
```

In `vite.config.ts` add `tailwindcss()` to plugins. Replace `src/App.css` contents (or create `src/index.css` and import it in `main.tsx`) with `@import "tailwindcss";` and remove template CSS that fights it.
Verify: `npm run dev` still builds; `class="bg-red-500"` on any element visibly applies.

- [ ] **Step 6: Wire the `@/` alias and init shadcn/ui**

Add to `tsconfig.json` `compilerOptions`: `"baseUrl": ".", "paths": { "@/*": ["./src/*"] }`, same paths in `tsconfig.app.json`, and in `vite.config.ts`: `resolve: { alias: { "@": path.resolve(__dirname, "./src") } }` (add `import path from "path"`). Then:

```bash
npx shadcn@latest init -d -y
npx shadcn@latest add button
```

Expected: `components.json` created; `src/components/ui/button.tsx` exists.

- [ ] **Step 7: Demo component in App.tsx**

Replace template content in `src/App.tsx` with a minimal screen: an `<h1>` reading `Meander` and one shadcn `<Button>` labelled `It works`. Remove the template's `invoke('greet')` call and logo assets — nothing here may depend on a backend command.

- [ ] **Step 8: Add dummy Rust test hook and dummy fn**

In `src-tauri/src/lib.rs` add `pub fn health() -> &'static str { "ok" }` next to `run()`. Verify `cargo test --manifest-path src-tauri/Cargo.toml` passes (the template's default test setup, even if that's 0 tests — the point is the harness compiles).

- [ ] **Step 9: Add Vitest + RTL and a dummy component test**

```bash
npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

Add to `vite.config.ts`: `test: { environment: 'jsdom', globals: true, setupFiles: './src/test/setup.ts' }` and a `/// <reference types="vitest" />` reference. Create `src/test/setup.ts` with `import '@testing-library/jest-dom'`. Create `src/App.test.tsx` asserting the `Meander` heading and `It works` button render. Add `"test": "vitest run"` to `package.json` scripts.
Run: `npm run test` — Expected: PASS.

- [ ] **Step 10: Commit and push**

```bash
git add -A && git commit -m "chore: scaffold tauri 2 + react + tailwind + shadcn/ui"
git push -u origin chore/step-01-tauri-scaffold
```

Tell the user the branch is pushed and the PR is ready to open against `main`.

---

### Task 2: Playwright e2e harness with mocked Tauri API

Implements repo-plan step 2. Branch: `test/step-02-playwright`.

**Files:**

- Create: `playwright.config.ts`, `tests/e2e/fixtures.ts`, `tests/e2e/demo.spec.ts`
- Modify: `package.json` (add `test:e2e` script)

**Interfaces:**

- Consumes: `npm run dev` on port 1420 (Task 1).
- Produces: `test:e2e` script; `tests/e2e/fixtures.ts` exporting a `test` object that stubs `window.__TAURI_INTERNALS__.invoke` — later plans import this fixture instead of `@playwright/test` directly.

- [ ] **Step 1: Install Playwright**

```bash
npm i -D @playwright/test && npx playwright install chromium
```

Expected: browser downloads. If launch later fails on missing libs, give the user the `dnf install` line from Global Constraints — do not sudo.

- [ ] **Step 2: Config**

Create `playwright.config.ts`: `testDir: './tests/e2e'`, `baseURL: 'http://localhost:1420'`, `webServer: { command: 'npm run dev -- --port 1420 --strictPort', url: 'http://localhost:1420', reuseExistingServer: true }`, `use: { headless: true }`. Add `"test:e2e": "playwright test"` to scripts.

- [ ] **Step 3: Tauri-mock fixture**

Create `tests/e2e/fixtures.ts` exporting `test = base.extend({ page: async ({ page }, use) => { await page.addInitScript(() => { (window as any).__TAURI_INTERNALS__ = { invoke: async (cmd: string) => { throw new Error('unmocked tauri command: ' + cmd) } }; }); await use(page); } })`. Failing loudly on unmocked commands is deliberate — it forces every feature plan to mock explicitly.

- [ ] **Step 4: Dummy spec**

Create `tests/e2e/demo.spec.ts` importing `test` from `./fixtures`: navigate to `/`, expect heading `Meander` and button `It works` visible.

- [ ] **Step 5: Run**

Run: `npm run test:e2e` — Expected: PASS in headless chromium.

- [ ] **Step 6: Commit and push**

```bash
git add -A && git commit -m "test: add playwright e2e harness with mocked tauri api"
git push -u origin test/step-02-playwright
```

---

### Task 3: cucumber-rs service-layer harness

Implements repo-plan step 3. Branch: `test/step-03-cucumber`.

**Files:**

- Create: `src-tauri/tests/cucumber.rs`, `src-tauri/tests/features/dummy.feature` (features dir lives next to the test target per cucumber-rs convention)
- Modify: `src-tauri/Cargo.toml` (dev-dependencies + `[[test]]` entry)

**Interfaces:**

- Consumes: `health() -> &'static str` from `src-tauri/src/lib.rs` (Task 1).
- Produces: `cargo test --test cucumber` runs `.feature` files against the crate's library API — the pattern every service-layer acceptance test follows (World struct + `#[given]/#[when]/#[then]` + `tokio::runtime` or futures executor).

- [ ] **Step 1: Add cucumber dev-dependency**

```bash
cd src-tauri && cargo add cucumber --dev
```

Add to `Cargo.toml`: `[[test]] name = "cucumber" harness = false` and confirm a `[lib]` target exists (Tauri 2 template provides one; if not, add `path = "src/lib.rs"`).

- [ ] **Step 2: Dummy feature**

Create `src-tauri/tests/features/dummy.feature` — one scenario: `Given the application core` / `When I request a health check` / `Then the answer is "ok"`.

- [ ] **Step 3: World + steps**

Create `src-tauri/tests/cucumber.rs`: a `World` struct holding an `Option<String>`; `given` sets up nothing meaningful (stores marker), `when` calls `<app_lib_crate_name>::health()` (crate name is the `lib.name`/`package.name` with `-`→`_` — read it from `Cargo.toml`), `then` asserts `== "ok"`; end with `fn main() { futures::executor::block_on(World::run("tests/features")); }` or the cucumber-rs `main!` equivalent for the installed version — check the crate's docs for the version cargo resolved. Add `futures` (or `tokio`) as dev-dep if the runner needs it.

- [ ] **Step 4: Run**

Run: `cargo test --test cucumber --manifest-path src-tauri/Cargo.toml`
Expected: 1 scenario passed.

- [ ] **Step 5: Commit and push**

```bash
git add -A && git commit -m "test: add cucumber-rs acceptance harness"
git push -u origin test/step-03-cucumber
```

---

### Task 4: WebdriverIO smoke test via tauri-driver

Implements repo-plan step 4. Branch: `test/step-04-wdio-smoke`.

**Files:**

- Create: `wdio.conf.ts`, `tests/smoke/app.e2e.ts`
- Modify: `package.json` (`test:smoke` script), `.gitignore` if the service writes artifacts

**Interfaces:**

- Consumes: the scaffolded app binary (Task 1).
- Produces: `npm run test:smoke` launches the real Tauri app under tauri-driver and runs `tests/smoke/*.e2e.ts`. One assertion only: the window's `h1` contains `Meander`.

- [ ] **Step 1: Install tauri-driver and WDIO packages**

```bash
cargo install tauri-driver --locked
npm i -D @wdio/cli @wdio/local-runner @wdio/mocha-framework @wdio/spec-reporter @wdio/tauri-service
```

Expected: `tauri-driver --version` works. cargo install compiles from source — allow time.

- [ ] **Step 2: Config**

Create `wdio.conf.ts` following the `@wdio/tauri-service` README for the installed version — the canonical shape is `services: ['tauri']`, `runner: 'local'`, `framework: 'mocha'`, `reporters: ['spec']`, `specs: ['./tests/smoke/**/*.ts']`, `capabilities: [{ 'tauri:options': { application: './src-tauri/target/debug/<binary-name>' } }]` where binary name is the `productName`/`mainBinaryName` from `src-tauri/tauri.conf.json` — read it, don't guess. Add `"test:smoke": "wdio run ./wdio.conf.ts"` to scripts.

- [ ] **Step 3: Build the debug binary**

Run: `npm run tauri build -- --debug` (or `cargo build` in `src-tauri` if the service builds it — follow the README).
Expected: binary exists at the path in Step 2.

- [ ] **Step 4: Smoke spec**

Create `tests/smoke/app.e2e.ts`: one test — `await browser.$('h1')` has text containing `Meander`. Nothing else.

- [ ] **Step 5: Run**

Run: `npm run test:smoke` (DISPLAY `:0` available)
Expected: app launches, 1 passing test. Webdriver failures here are usually tauri-driver version skew with the webkit webdriver — record versions if it fails rather than retry-looping.

- [ ] **Step 6: Commit and push**

```bash
git add -A && git commit -m "test: add webdriverio smoke test via tauri-driver"
git push -u origin test/step-04-wdio-smoke
```

---

### Task 5: Linting and commit hooks

Implements repo-plan step 5. Branch: `chore/step-05-lint-hooks`. Hooks check formatting/linting/commit-messages only — never tests.

**Files:**

- Create: `lefthook.yml`, `commitlint.config.js`, `.prettierrc`, `.prettierignore`
- Modify: `package.json` (`lint`, `format`/`format:check` scripts), eslint config if needed to cover `tests/`

**Interfaces:**

- Produces: `npm run lint` (eslint + prettier --check) and `npm run format`; `lefthook install` wires `pre-commit` (cargo fmt --check, cargo clippy -D warnings, prettier --check, eslint) and `commit-msg` (commitlint) hooks for anyone who runs `npm install` + `npx lefthook install`.

- [ ] **Step 1: Install lint tooling**

```bash
npm i -D lefthook @commitlint/cli @commitlint/config-conventional prettier
```

- [ ] **Step 2: Configs**

`commitlint.config.js`: `export default { extends: ['@commitlint/config-conventional'] }`. `.prettierrc`: minimal (e.g. `{ "semi": true, "singleQuote": true }` — match whatever the scaffolded code already looks like). `.prettierignore`: `node_modules`, `dist`, `src-tauri/target`, `playwright-report`, `test-results`, `src/components/ui` is NOT ignored (shadcn code is ours to format).
`lefthook.yml`:

```yaml
pre-commit:
  parallel: true
  commands:
    cargo-fmt: { run: cargo fmt --manifest-path src-tauri/Cargo.toml -- --check }
    cargo-clippy: { run: cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings }
    prettier: { run: npx prettier --check . }
    eslint: { run: npx eslint . }
commit-msg:
  commands:
    commitlint: { run: npx commitlint --edit {1} }
```

- [ ] **Step 3: package.json scripts**

Add `"lint": "eslint . && prettier --check ."` and `"format": "prettier --write . && cargo fmt --manifest-path src-tauri/Cargo.toml"`. Ensure eslint config lints `src/` and `tests/` (flat config or `.eslintrc` per what the template shipped).

- [ ] **Step 4: Normalize the tree**

Run: `npm run format && npm run lint`
Expected: clean after formatting; fix anything prettier can't (e.g. eslint errors in template code) minimally. `cargo fmt --check` and `cargo clippy -- -D warnings` must both pass.

- [ ] **Step 5: Install hooks and prove they work**

Run: `npx lefthook install`, then make a trivial commit — Expected: all four pre-commit commands run and pass. Verify `git commit -m "bad message"` on a scratch change is rejected by commitlint, then undo the scratch change (do not leave test commits on the branch).

- [ ] **Step 6: Commit and push**

```bash
git add -A && git commit -m "chore: add lefthook, commitlint, prettier and eslint checks"
git push -u origin chore/step-05-lint-hooks
```

---

### Task 6: GitHub Actions CI

Implements repo-plan step 6. Branch: `ci/step-06-github-actions`. Remote is `git@github.com:Rrayor/meander.git`.

**Files:**

- Create: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: every script produced in Tasks 1–5 (`npm run test`, `test:e2e`, `test:smoke`, `lint`; cargo fmt/clippy/test/cucumber).
- Produces: CI runs on `pull_request` and `push` to `main`. Three jobs: `rust`, `frontend`, `smoke`.

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`, `on: { pull_request: {}, push: { branches: [main] } }`. Jobs on `ubuntu-latest` with `actions/checkout`, `actions/setup-node` (node 22, `cache: npm`), `dtolnay/rust-toolchain@stable` with `components: rustfmt, clippy`, `Swatinem/rust-cache`:

- `rust`: `sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libayatana-appindicator3-dev librsvg2-dev`; then `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` (all with `--manifest-path src-tauri/Cargo.toml` or `working-directory: src-tauri`).
- `frontend`: `npm ci`, `npm run lint`, `npm run test`, `npx playwright install --with-deps chromium`, `npm run test:e2e`.
- `smoke`: same system deps as `rust` plus `cargo install tauri-driver --locked`, `npm ci`, `npm run tauri build -- --debug`, `xvfb-run -a npm run test:smoke`.

- [ ] **Step 2: Validate the yaml**

Run: `npx --yes yaml-lint .github/workflows/ci.yml` or `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` — whichever tool exists locally.
Expected: parses. Then commit, push, open the PR — the workflow runs on this very PR; report whether it went green, and fix-forward if it didn't before asking the user to review.

- [ ] **Step 3: Commit and push**

```bash
git add -A && git commit -m "ci: run all validation suites on PRs and main"
git push -u origin ci/step-06-github-actions
```

---

### Task 7: Remove dummy artifacts

Implements repo-plan step 7. Branch: `chore/step-07-remove-dummies`.

**Files:**

- Delete: `src/App.test.tsx`, `tests/e2e/demo.spec.ts`, `tests/smoke/app.e2e.ts`, `src-tauri/tests/features/dummy.feature`, the dummy steps in `src-tauri/tests/cucumber.rs`, `pub fn health()` in `src-tauri/src/lib.rs`, the demo `<Button>` in `src/App.tsx`, `src/components/ui/button.tsx` if unused (shadcn components are added on demand — removing an unused one is correct)
- Modify: `src/App.tsx` → minimal placeholder (`<h1>Meander</h1>` only); `tests/cucumber.rs` keeps the World skeleton and runner `main` with zero scenarios — the harness stays, the dummy goes

**Interfaces:**

- Produces: clean base — harnesses installed and runnable, no demo code. `npm run test` reports no tests found (exit 0 via `vitest run --passWithNoTests` — add the flag when deleting the only test); cucumber runs zero scenarios green; e2e/smoke specs absent until real features add them.

- [ ] **Step 1: Delete the artifacts and add `--passWithNoTests`**

Delete the files above. Change `test` script to `vitest run --passWithNoTests`.

- [ ] **Step 2: Strip App.tsx to the placeholder**

Keep only `<h1>Meander</h1>` — no imports from `components/ui`.

- [ ] **Step 3: Run every harness**

Run: `npm run lint && npm run test && npm run test:e2e; cargo test --manifest-path src-tauri/Cargo.toml && cargo test --test cucumber --manifest-path src-tauri/Cargo.toml && cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
Expected: all green (empty suites pass; clippy must not warn on the stripped code — remove now-unused imports/deps).

- [ ] **Step 4: Commit and push**

```bash
git add -A && git commit -m "chore: remove scaffold dummy code, keep test harnesses"
git push -u origin chore/step-07-remove-dummies
```

---

## Self-Review Notes

- Spec coverage: repo-plan steps 1–7 each map to exactly one task. Spec sections exercised: "Testing" (all four layers), "CI/CD" (Task 6), stack versions (Task 1). No spec feature work is in scope — correct, per the repo plan's sequencing.
- Deliberate deviation: repo step 1's "dummy tests run — just what comes with the toolchain" — the Vite template ships no frontend test runner, so Vitest is installed in Task 1 rather than inventing a different meaning for "frontend toolchain tests."
- Proportion check: this plan intentionally contains more shell commands than code; the only written code blocks are the fixture stub and lefthook config where an implementer could reasonably choose wrong.
