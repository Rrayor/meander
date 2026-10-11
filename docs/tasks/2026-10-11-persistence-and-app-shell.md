# Persistence Layer + App Shell Implementation Plan

> **For agentic workers:** execute task-by-task per `docs/CONTRIBUTION.md` — one branch + PR per task, conventional commits, all harnesses green before commit. Steps use checkbox syntax for tracking.

**Goal:** Give Meander a real SQLite persistence layer (connection, migrations, seeded test database used by cucumber), a navigable app shell (Kanban / Backlog / Settings routes), and a settings option to select the database file.

**Architecture:** Rust owns persistence per `docs/architecture/overview.md`: a connection layer (`db/`), a migration runner, and service-layer modules that own business logic; Tauri command handlers stay thin (deserialize → service → serialize). The frontend talks to the backend only through typed functions in `src/api/` wrapping `invoke`. Navigation is a React Router shell with a sidebar; the shell is designed in Stitch first per `AGENTS.md`.

**Tech Stack:** `sqlx` (sqlite + migrations), `tauri-plugin-dialog`, `react-router-dom`, Stitch → Tailwind v4 + shadcn/ui.

**Spec:** `docs/specification.md` — sections "Database file selection", "Settings", non-functional requirements (offline, embedded SQLite); `docs/architecture/overview.md` — layering and testing rules; `docs/tasks/big-picture-plan.md` steps 8–10.

## Global Constraints

- Embedded SQLite, offline, local only. Default DB location is portable-by-convention: dev builds use `<repo>/meander.db` (gitignored, including `-wal`/`-shm` sidecars); release builds use the executable's directory. Resolution must not depend on cwd — dev resolves via compile-time `CARGO_MANIFEST_DIR`'s parent, release via `current_exe()`.
- "The default setting is the default name for the embedded db" — spec.
- DB-file switch must "handle possible compatibility issues gracefully" and "only unloads everything if the chosen file is verified as compatible" — spec.
- Components never call `invoke` directly — only `src/api/` wrappers.
- One branch + PR per task; conventional commits; `npm run lint`, `npm run test`, `npm run test:e2e`, `cargo test`, `cargo clippy -D warnings`, `cargo fmt --check` green before commit.
- UI work is Stitch-first: generated designs saved under `.stitch/designs/` with `.stitch/metadata.json` updated; converted to modular React/Tailwind/shadcn components, never pasted raw.

## Review Focus

- **Active-connection swap**: selecting a new DB while the app is running must close/drop the old pool before exposing the new one — a task pinning "commands after a switch read from the new file" lives in Task 3.
- **Incompatible file selection**: non-SQLite file, valid SQLite missing our migrations, file in an unwritable location — each must surface an error in settings and leave the current DB untouched (Task 3).
- **Migration drift**: a DB whose applied migrations diverge from the app's set must be rejected, not half-migrated (Task 3 compat check).
- **Cold-start config**: selected-path config missing/corrupt/pointing at a deleted file must fall back to the default path, never crash startup (Task 3).
- **Router inside Tauri webview**: hash-less deep links fail in production builds — `createHashRouter`-compatible navigation must be used (Task 2).

## My calls (user did not decide)

- `sqlx` over `rusqlite`/`tauri-plugin-sql`: async, pool-based, built-in migrate support, and the architecture doc's "other SQL databases later" seam maps directly to sqlx drivers.
- `react-router-dom` v7 for routing; `createHashRouter` (see Review Focus).
- Settings have two storage layers, and `config.rs` owns only the first: **app-level** settings live in `config.json` under `app_config_dir` — things needed before a db can be opened (the selected db path) or about the machine, not a person (later: last active profile). **Profile-scoped** settings — week start, work days, thresholds — will live in the db keyed to a profile, per the spec's "separate profiles have separate settings." The db-path setting is deliberately pre-profile: switching files switches the whole profile universe.
- Config written as a hand-rolled serde JSON `config.json` in `app_config_dir` rather than `tauri-plugin-store` — one less plugin. The _default_ database file itself is portable (repo dir in dev, beside the executable in release) so it can be moved/inspected/backed up trivially.
- Nav items this milestone: Board (`/`), Backlog (`/backlog`), Settings (`/settings`). Categories arrives with its feature (step 19).
- Database filename: `meander.db` (`db::default_path()` owns the dev/release resolution above); test databases are unique temp files per cucumber run via `tests/support`.

---

### Task 1: SQLite persistence layer + seeded test database (repo step 8)

Branch: `feat/step-08-test-database`

**Files:**

- Create: `src-tauri/migrations/0001_initial.sql`, `src-tauri/src/db/mod.rs`, `src-tauri/src/db/connect.rs`, `src-tauri/src/db/seed.rs`, `src-tauri/src/state.rs`, `src-tauri/tests/support/mod.rs`, `src-tauri/tests/features/database.feature`
- Modify: `src-tauri/Cargo.toml` (sqlx, tokio, thiserror, serde), `src-tauri/src/lib.rs` (AppState + `db` module + `init_db` command), `src-tauri/tests/cucumber.rs` (world gains a pool field)

**Interfaces:**

- Produces: `db::default_path() -> PathBuf` (dev: `CARGO_MANIFEST_DIR/../meander.db`; release: `current_exe()` dir + `meander.db`), `db::connect(path: &Path) -> Result<SqlitePool>` (runs migrations), `db::seed(pool: &SqlitePool) -> Result<()>` (idempotent seed marker), `state::AppState { db: RwLock<SqlitePool> }` with `AppState::pool()`, `#[tauri::command] db_path() -> String`, `state::AppState::reconnect(path) -> Result<()>` (Task 3 consumes).
- Consumes: nothing — first backend feature.

- [ ] **Step 1: Write the failing cucumber feature**

`tests/features/database.feature` — a scenario asserting that connecting to a fresh temp file applies migrations (`_sqlx_migrations` row count = migration count) and that `db::seed` marks the db seeded (a `meander_meta` table exists with a `seeded` key). Support module `tests/support/mod.rs` exposes `temp_db_path()` (unique file under `std::env::temp_dir()`).

- [ ] **Step 2: Run cucumber — fails to compile**

`cargo test --test cucumber --manifest-path src-tauri/Cargo.toml` — expected: `meander_lib::db` unresolved.

- [ ] **Step 3: Implement `db/` + `state.rs`**

`db/connect.rs`: `default_path()` per the constraint above; `connect` creates parent dirs, builds `SqliteConnectOptions` (`create_if_missing`, WAL + `foreign_keys` pragmas), opens pool, runs `sqlx::migrate!("./migrations")`. `db/seed.rs`: creates `meander_meta(key TEXT PRIMARY KEY, value TEXT)` via the initial migration; `seed` upserts `('schema_seeded','1')`. `state.rs`: `AppState::new(path)` connects; `reconnect` swaps pool after a successful `connect`. Initial migration `0001_initial.sql` creates only `meander_meta` — entities land in later steps. `lib.rs` registers `db` + `state` modules; `run()` sets up `AppState` (default path = `db::default_path()`) before `generate_handler`; add `db_path` command reading the state's current path — Task 3 and the settings UI consume it. Add `meander.db*` to the root `.gitignore` (covers `-wal`/`-shm` sidecars).

- [ ] **Step 4: Run cucumber — green**

Same command; 1 scenario passes. Also `cargo clippy -D warnings`, `cargo fmt --check`.

- [ ] **Step 5: Docs + commit**

Add a "Persistence layer" subsection to `docs/architecture/overview.md` (db/, state, migrations, test-db convention) and a testing.md line for the seeded-db helper. Commit `feat: add sqlite persistence layer and seeded test database`, push, open PR.

---

### Task 2: Navigation shell with Stitch design (repo step 9)

Branch: `feat/step-09-main-navigation`

**Files:**

- Create: `.stitch/designs/app-shell.*`, `src/api/router`… concretely: `src/pages/BoardPage.tsx`, `src/pages/BacklogPage.tsx`, `src/pages/SettingsPage.tsx`, `src/components/layout/AppShell.tsx`, `src/components/layout/SideNav.tsx`, `src/router.tsx`, `tests/e2e/navigation.spec.ts`, `tests/smoke/nav.e2e.ts`
- Modify: `src/main.tsx` (RouterProvider), `src/App.tsx` (consumed/removed into shell), `package.json` (`react-router-dom`), `.stitch/metadata.json`

**Interfaces:**

- Produces: routes `/` (Board), `/backlog`, `/settings` wrapped in `AppShell` + `SideNav` (Board/Backlog/Settings links, active-state styling, `aria-current`); e2e + smoke specs.
- Consumes: nothing from Task 1 (pages are placeholders; Settings page hosts the db control in Task 3).

- [ ] **Step 1: Stitch design pass**

Invoke `generate-design`: one screen, desktop sidebar layout — left rail with app wordmark "Meander" + three nav items (Board, Backlog, Settings), main content area. Clean, low-density, WCAG AA contrast; Tailwind-friendly tokens. Save under `.stitch/designs/`, update `.stitch/metadata.json`.

- [ ] **Step 2: Write the failing Playwright spec**

`tests/e2e/navigation.spec.ts` with the mock fixture: renders app, asserts nav landmark + three links, clicks "Backlog" → URL `/backlog` + backlog heading visible; "Settings" → settings heading. Run `npm run test:e2e` — fails (no router/nav).

- [ ] **Step 3: Implement shell + router**

Convert the Stitch design per `react-components` conventions: `AppShell` (sidebar + `<Outlet/>`), `SideNav` (`NavLink` per item, `aria-current`, keyboard focusable), three thin placeholder pages (each an `h1` + one line). `router.tsx` uses `createHashRouter` (Tauri production builds can't serve deep links). `main.tsx` mounts `RouterProvider`; `App.tsx` reduced to re-export or removed in favor of the router root.

- [ ] **Step 4: Playwright green + smoke spec**

`npm run test:e2e` passes. Add `tests/smoke/nav.e2e.ts`: real binary launches, nav renders, one click navigates — this restores the wdio spec so the CI smoke job goes green again. Run `npm run build` + `cargo build --release --features tauri/custom-protocol` + `npm run test:smoke` locally to verify.

- [ ] **Step 5: Lint, unit test, commit**

`npm run lint`, `npm run test` (add one vitest for `SideNav` active-state if cheap — RTL with `MemoryRouter`), `cargo fmt --check`, clippy. Commit `feat: add navigation shell and placeholder pages`, push, PR.

---

### Task 3: Database file selection in settings (repo step 10)

Branch: `feat/step-10-db-file-selection`

**Files:**

- Create: `src-tauri/src/config.rs` (persisted selected path), `src/api/settings.ts`, `src/features/settings/DatabaseSection.tsx`, `tests/e2e/db-selection.spec.ts`, cucumber feature `tests/features/db_switch.feature`
- Modify: `src-tauri/Cargo.toml` (+ `tauri-plugin-dialog`), `src-tauri/src/lib.rs` (commands: `select_database_file`, `current_db_path`), `src-tauri/src/state.rs` (compat check in `reconnect`), `package.json` (`@tauri-apps/plugin-dialog`), `src/pages/SettingsPage.tsx`, `tests/e2e/fixtures.ts` (mock `select_database_file`), `src-tauri/capabilities/default.json` (dialog permission)

**Interfaces:**

- Consumes: `state::AppState`, `db::connect` (Task 1); SettingsPage route (Task 2).
- Produces: commands `select_database_file(path: String) -> Result<String>` (validates, swaps, persists path) and `current_db_path() -> String`; `db::check_compatible(path) -> Result<()>` — opens candidate read-only, requires `meander_meta` present + applied migration set ⊆ known set.

- [ ] **Step 1: Write failing tests**

Cucumber `db_switch.feature`: given a connected AppState, when `reconnect` is pointed at (a) a migrated test db → success + `pool` reads from it, (b) a non-sqlite file → error and pool unchanged, (c) a valid sqlite without `meander_meta` → error and pool unchanged. Playwright `db-selection.spec.ts`: settings page shows current path, a "Choose database file" button calls the (mocked) dialog + `select_database_file`, an error return renders an inline message without replacing the shown path.

- [ ] **Step 2: Run — red**

`cargo test --test cucumber` and `npm run test:e2e` fail.

- [ ] **Step 3: Implement backend**

`config.rs`: `load_config(app_config_dir) -> Config { database_path }` (missing/corrupt → `db::default_path()`; configured file missing → default) and `save_config`. `state.rs` `reconnect`: run `db::connect` on the candidate into a scratch pool → `check_compatible` → on success swap `AppState.pool` and persist path; on failure return error, keep old pool. `lib.rs` registers the two commands + `tauri-plugin-dialog`. Wire startup: `run()` resolves config → `AppState::new(configured_path)`.

- [ ] **Step 4: Implement frontend**

`src/api/settings.ts` typed wrappers. `DatabaseSection` on the settings page: current path display + choose button → `open({ filters: [{name:'SQLite', extensions:['db','sqlite']}] })` → `select_database_file`; error string rendered in an alert region, path unchanged on failure.

- [ ] **Step 5: All green + commit**

cucumber green, Playwright green, `npm run lint`, `npm run test`, clippy/fmt. Update `docs/testing.md` (temp-db helper usage is already noted; add compat-check behavior). Commit `feat: database file selection in settings`, push, PR.

---

## Self-Review Notes

- Spec coverage: steps 8–10 map to Tasks 1–3. Spec lines exercised: "separate test-database file which can be seeded" (T1), nav + three views (T2), "select database file / graceful incompatibility / default name" (T3). Not covered here and not in scope: profiles, entities, week settings.
- Interfaces: T3 consumes T1 (`AppState`, `connect`) and T2 (settings route) — names fixed above.
- Proportion: three tasks, three PRs; the only code-level detail preserved is the compat-check contract and the hash-router ruling, both of which an implementer would otherwise guess wrong.
- Known gap to watch at execution: whether `sqlx::migrate!` path resolution needs `src-tauri` as cwd in tests — if it does, pass an absolute `Migrator` path or run migrations via `migrations/` include.
