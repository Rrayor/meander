# Testing

Meander uses four test layers (see `docs/architecture/overview.md` for the rationale).

| Layer         | Command                                        | What it runs                                             |
| ------------- | ---------------------------------------------- | -------------------------------------------------------- |
| Frontend unit | `npm run test`                                 | Vitest + React Testing Library, jsdom                    |
| Frontend e2e  | `npm run test:e2e`                             | Playwright against the Vite dev server, Tauri API mocked |
| Acceptance    | `cargo test --test cucumber` (in `src-tauri/`) | cucumber-rs `.feature` files against the service layer   |
| Smoke         | `npm run test:smoke`                           | WebdriverIO + tauri-driver against the real built app    |
| Rust unit     | `cargo test` (in `src-tauri/`)                 | Standard Rust tests                                      |

## Frontend e2e (Playwright)

Specs live in `tests/e2e/`. Import `test`/`expect` from `./fixtures`, never from
`@playwright/test` directly — the fixture stubs `window.__TAURI_INTERNALS__.invoke`
and throws on any command that has not been explicitly mocked, so every feature
test must declare the backend surface it uses.

## Acceptance tests (cucumber-rs)

Feature files live in `src-tauri/tests/features/`, step definitions and the
`World` in `src-tauri/tests/cucumber.rs` (a `[[test]]` target with
`harness = false`). Steps call `meander_lib` functions directly — Tauri command
handlers stay thin so business logic is covered here, not through the UI.

Tests that need a database use `tests/support` helpers: `temp_db_path()` gives
each scenario a unique file under the system temp dir, so databases never touch
the working tree. `db::seed` marks a fresh database via `meander_meta`.

## Smoke tests (WebdriverIO)

`npm run test:smoke` launches the real Tauri binary through `tauri-driver` and
`WebKitWebDriver` (see `wdio.conf.ts`). Prerequisites:

- `cargo install tauri-driver --locked`
- `WebKitWebDriver` on PATH (see platform notes below)
- A display — use `xvfb-run -a npm run test:smoke` when headless
- A **self-contained release binary** — see below

### Building the binary for smoke tests

```bash
npm run build
cd src-tauri && cargo build --release --features tauri/custom-protocol
```

The `tauri/custom-protocol` feature matters: in Tauri 2 it is _not_ part of the
crate's default features. `tauri dev` builds with `--no-default-features` (no
custom-protocol → the webview loads `devUrl`), while `tauri build` builds with
it (→ the frontend is embedded from `frontendDist`). A plain
`cargo build --release` therefore produces a binary that still tries to load
`http://localhost:1420` and fails with a connection-refused page — this is the
single most likely cause of "app launches but the page is empty" in smoke tests.
`generate_context!` switches on `cfg!(not(feature = "custom-protocol"))`.

### Platform notes: WebKitWebDriver

- **Debian/Ubuntu**: `sudo apt-get install -y webkit2gtk-driver`
- **Fedora**: there is no `webkit2gtk-driver` package. `WebKitWebDriver` ships
  inside `webkitgtk6.0` and can drive webkit2gtk-4.1 webviews as long as the
  upstream WebKit versions match (verified with 2.54.1).
- **WebKitWebDriver <-> webview version skew** is the classic source of
  `Direct eval HTTP error: 404` spam and empty element queries — check versions
  before debugging further.
