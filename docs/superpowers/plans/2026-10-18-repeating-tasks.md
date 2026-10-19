# Repeating Tasks (step 25) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a task series (closed-set recurrence schedule + start/end dates) and let users enter the schedule in the new/edit task dialogs — no occurrence calculation yet.

**Architecture:** A `task_series` table holds shared fields + a `recurrence` JSON column (serde-tagged enum). A task row linked via `tasks.series_id` is an instance — creating a task with a schedule inserts both atomically; adding a schedule on edit links the existing task unchanged.

**Tech Stack:** Rust (sqlx/SQLite, nutype, specta, serde), React + RHF + zod, TanStack Query, cucumber-rs, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-repeating-tasks-design.md` (recurrence model, schema DDL, deferrals); `docs/specification.md` §54/§75–95/§109–135.

## Global Constraints

- All IPC via `src/api/transport.ts`; command names in `src/api/commands.ts`, cache keys in `src/api/queryKeys.ts`, copy in `src/lib/labels.ts`. Tests must import shared constants/labels — no duplicated literals.
- Exported Rust types must be registered in `bindings.rs` export list and `lib.rs` handler list; regenerate `src/api/bindings.ts` (`cargo run --bin export-bindings` or the project's bindings script) — never hand-edit.
- Backend validation authoritative (nutype for scalars, a `validate` fn for the enum); zod mirrors it in the frontend; `mode: "onTouched"`, `role="alert"` + `aria-invalid` on field errors.
- Typed `ApiError` `ErrorCode`s — add variants, never match message text.
- Dates stored as ISO `YYYY-MM-DD` TEXT. No occurrence math this step.
- `Weekday` serializes `"monday".."sunday"`. `Recurrence` is `#[serde(tag = "kind", rename_all = "snake_case")]`, `specta::Type` — verify the bindings export compiles before building on it.
- WorkdayAfter variant is defined but rejected by validation (`WorkdayRulesUnsupported`).
- UI work: Stitch pass on the task dialogs first (`.stitch/designs/`, update `.stitch/metadata.json`), then modular components.

## Review Focus

- Malformed/partial schedule input reaching the backend (null weekday list, interval 0, nth 0 or ±5, day 0/32, non-ISO or inverted dates) → typed validation errors, not panics or opaque SQLite errors.
- `WorkdayAfter` smuggled in by a client → rejected, not persisted inert.
- Editing a task that already has `series_id` with a `series` payload → `AlreadyInSeries`, no partial write.
- Profile scoping: create/update/list/delete under the wrong profile must fail or return empty — never leak.
- Migration on an existing DB with tasks present: `series_id` added NULL, all rows readable, FK + cascade enforced.
- Dialog submits: schedule fields cleared/hidden must not send a `series` payload; an instance's edit dialog must not offer the repeat section.

---

### Task 1: Migration `0008_task_series.sql`

**Files:**

- Create: `src-tauri/migrations/0008_task_series.sql`
- Test: `src-tauri/tests/migrations.rs` (generic data-preservation suite already runs every migration — add nothing bespoke unless a check is missing)

**Interfaces:**

- Produces: `task_series(id, profile_id, title, description, carry_over_rule, estimated_minutes, recurrence, start_date, end_date, created_at, updated_at)`; `tasks.series_id` nullable FK→`task_series(id) ON DELETE CASCADE`; indexes `idx_task_series_profile`, `idx_tasks_series`.

- [ ] **Step 1: Write the migration** — DDL exactly per design doc §Data model (CHECKs: carry_over_rule enum set, estimated_minutes ≥ 0, end_date IS NULL OR end_date ≥ start_date). Header comment in the style of 0006/0007.
- [ ] **Step 2: Verify** — `cargo test --test migrations` (data-preservation invariants pass); `bash scripts/check-migrations.sh`.
- [ ] **Step 3: Commit** `feat: add task_series table and tasks.series_id`.

### Task 2: Recurrence + series model (`src-tauri/src/series.rs`)

**Files:**

- Create: `src-tauri/src/series.rs`
- Modify: `src-tauri/src/errors.rs` (new variants), `src-tauri/src/lib.rs` (`mod series;`)

**Interfaces:**

- Produces:
  - `pub enum Weekday { Monday..Sunday }` — serde+sqlx TEXT snake_case, `specta::Type`.
  - `pub enum Recurrence { Daily{interval_days:u32}, Weekly{interval_weeks:u32, weekdays:Vec<Weekday>}, MonthlyDay{interval_months:u32, day:u8}, MonthlyNthWeekday{interval_months:u32, nth:i8, weekday:Weekday}, WorkdayAfter{day:u8} }` — `#[serde(tag="kind", rename_all="snake_case")]`, `Serialize, Deserialize, specta::Type`; `pub fn validate(&self) -> Result<()>`.
  - `pub struct IsoDate(String)` — nutype, ISO `YYYY-MM-DD` shape.
  - `pub struct TaskSeries { id, profile_id, title, description, carry_over_rule: CarryOverRule, estimated_minutes: Option<i64>, recurrence: Recurrence, start_date: String, end_date: Option<String>, created_at, updated_at }` — `specta::Type`; row decode: read `recurrence` as `String`, `serde_json::from_str`, map failure to internal `DbError`.
  - `pub struct NewSeries { pub recurrence: Recurrence, pub start_date: String, pub end_date: Option<String> }` — Deserialize + specta.
  - `pub(crate) async fn insert(tx: &mut Transaction<'_, Sqlite>, profile_id: i64, fields: &SeriesFields) -> Result<TaskSeries>` — the transactional core; `pub async fn create(pool, profile_id, fields) -> Result<TaskSeries>` wraps it for direct callers; `pub async fn list(pool, profile_id) -> Result<Vec<TaskSeries>>` (`ORDER BY id`); `pub async fn delete(pool, profile_id, id) -> Result<()>`.
  - `SeriesFields { title, description, carry_over_rule, estimated_minutes, recurrence, start_date, end_date }` — internal carrier so `tasks::{create,update}` can pass the task's own fields.
  - New `ErrorCode`s: `SeriesNotFound`, `RecurrenceInvalid`, `StartDateInvalid`, `EndDateInvalid`, `EndDateBeforeStart`, `WorkdayRulesUnsupported`, `AlreadyInSeries`.
- Consumes: `crate::db::{Result, DbError}`, `crate::tasks::{TaskTitle, TaskDescription, PositiveDuration, CarryOverRule}` — reuse, don't re-implement.

- [ ] **Step 1: Failing tests** in `series.rs` `mod tests` (seeded-pool pattern from tasks.rs): valid variants of each rule persist+round-trip; `interval_days:0`→`RecurrenceInvalid`; `MonthlyDay{day:32}`→`RecurrenceInvalid`; `nth:5`/`nth:0`→`RecurrenceInvalid`; empty `weekdays`→`RecurrenceInvalid`; `WorkdayAfter`→`WorkdayRulesUnsupported`; `end_date < start_date`→`EndDateBeforeStart`; non-ISO `start_date`→`StartDateInvalid`; `delete` unknown id→`SeriesNotFound`; list/delete scoped to profile (second profile sees empty/`SeriesNotFound`).
- [ ] **Step 2: Run** `cargo test series` — expect failures (module missing).
- [ ] **Step 3: Implement** the module: types above; `validate` (intervals ≥1, day 1–31, nth ∈ {1..=4,-1}, weekdays non-empty+deduped, WorkdayAfter→`WorkdayRulesUnsupported`); `create` inserts in one query after validating + parsing title/description/estimate via tasks' parsers (make them `pub(crate)` if needed); decode helper `fn from_row` doing the JSON→Recurrence mapping.
- [ ] **Step 4: Run** `cargo test series` — all pass; `cargo clippy`.
- [ ] **Step 5: Commit** `feat: task_series model with closed-set recurrence`.

### Task 3: Wire `series` through create/update + link column

**Files:**

- Modify: `src-tauri/src/tasks.rs` (`Task` +`series_id: Option<i64>`; `NewTask`/`UpdateTask` +`series: Option<NewSeries>`; `create`/`update` branch), `src-tauri/src/errors.rs` if `AlreadyInSeries` not added in Task 2.

**Interfaces:**

- Produces: `tasks::create(pool, pid, &NewTask{.., series: Some(s)})` → series row (fields copied from the task input; carry_over default `Return` when input's is `None`) + task row with `series_id` set, in one `pool.begin()`/`tx.commit()`. `tasks::update(..., series: Some(s))` on `series_id IS NULL` → insert series + `UPDATE tasks SET series_id`; on already-linked → `AlreadyInSeries`; `series: None` → existing behavior untouched.

- [ ] **Step 1: Failing tests** in `tasks.rs` tests: `create` with `series` returns task with `series_id` and `series::list` contains it with the task's fields; `update` with `series` links the task (row keeps status/spent/placement/categories — assert via `task_categories` intact); `update` with `series` on a linked task → `AlreadyInSeries`; foreign-profile update → `TaskNotFound`.
- [ ] **Step 2: Run + fail.**
- [ ] **Step 3: Implement** — `Task` struct + `series_id`; in `create`/`update`, open a transaction when `series.is_some()` and call `series::insert(&mut tx, ...)` (Task 2's interface); then the task INSERT/UPDATE runs on `&mut *tx` with the returned `series_id`.
- [ ] **Step 4: Run + pass; clippy.**
- [ ] **Step 5: Commit** `feat: create and attach task series on task create/update`.

### Task 4: Commands, bindings, cucumber

**Files:**

- Modify: `src-tauri/src/commands.rs` (`list_task_series`, `delete_task_series`; `create_task`/`update_task` already carry the new field), `src-tauri/src/lib.rs` (handler list), `src-tauri/src/bindings.rs` (export list), `src/api/bindings.ts` (regenerated).
- Create: `src-tauri/tests/features/series.feature` (+ step defs in `src-tauri/tests/cucumber.rs`/`support/`).

**Interfaces:**

- Consumes: `series::{list, delete}`, `tasks::{create, update}`.
- Produces: commands `list_task_series`, `delete_task_series`; TS types `Recurrence`, `Weekday`, `TaskSeries`, `NewSeries`; cucumber scenario covering create-with-schedule→`list_task_series`→edit-attach→instance `series_id` set.

- [ ] **Step 1: Failing cucumber scenario** — "create a task with a weekly schedule → list_task_series has one row with that recurrence → task.series_id set → updating a second task with a schedule links it".
- [ ] **Step 2: Implement** commands + registration + `cargo run --bin export-bindings` (verify `Recurrence` exports as a TS discriminated union — spike-check now before Task 5).
- [ ] **Step 3: `cargo test --test cucumber`** passes; `scripts/check-bindings.sh` clean.
- [ ] **Step 4: Commit** `feat: expose task series commands`.

### Task 5: Frontend API + zod + schedule form section (Stitch first)

**Files:**

- Modify: `src/api/commands.ts`, `src/api/queryKeys.ts` (`taskSeries: ["task-series"]`, `series(id)`), `src/lib/labels.ts` (all new copy), `.stitch/designs/new-task-dialog.html` + `.stitch/metadata.json` (Stitch edit adding the Repeat section).
- Create: `src/api/series.ts` (list/deleteTaskSeries + types re-exported from bindings), `src/features/tasks/RepeatScheduleFields.tsx` (the fieldset), `src/features/tasks/recurrenceSchema.ts` (zod discriminated union on `kind` mirroring the Rust enum + start/end dates, `endDate >= startDate` refinement, intervals ≥1, day 1–31, nth ∈{1..4,-1}).
- Modify: `src/features/tasks/NewTaskDialog.tsx`, `src/features/tasks/EditTaskDialog.tsx`.

**Interfaces:**

- Consumes: `bindings.ts` types from Task 4; commands from Task 4.
- Produces: `RepeatScheduleFields` — controlled fieldset, props `{ value: NewSeries | undefined, onChange, disabled? }`; emits `undefined` when frequency is "none". `NewTask`/`UpdateTask` TS payloads gain `series`. Edit dialog hides the section when `task.series_id != null`.

UI behavior: collapsed "Repeat" section; frequency select (None/Daily/Weekly/Monthly day/Monthly nth weekday); per-frequency inputs (interval number; weekday checkboxes; day-of-month number; nth select + weekday select); `start_date` date input defaulting to today; optional `end_date` date input; static hint when monthly day > 28 that short months clamp (label in `labels.ts`). All inputs labelled, grouped in a `fieldset`/`legend`, errors `role="alert"`.

- [ ] **Step 1: Stitch** — edit the New Task Modal screen to add the Repeat section per design doc §UI; download assets, update `.stitch/metadata.json`.
- [ ] **Step 2: Failing vitest** — `RepeatScheduleFields.test.tsx` (per-frequency field rendering, zod errors: interval 0, day 32, nth 0, end<start, weekday empty; emits `undefined` on None) + dialog wiring tests: NewTaskDialog sends `series` payload when filled and none when untouched; EditTaskDialog sends `series` on update, hides section when `series_id` set.
- [ ] **Step 3: Implement** API module, schema, component, dialog wiring (create path: pass `series` inside the existing `create_task` call; categories keep working since chips → `task_categories` on the resulting instance).
- [ ] **Step 4: vitest + tsc + eslint + prettier** pass.
- [ ] **Step 5: Commit** `feat: enter repetition schedules in task dialogs`.

### Task 6: e2e + a11y + final gate

**Files:**

- Modify: `tests/e2e/tasks.spec.ts` (or new `series.spec.ts`) — create task with weekly schedule asserting request payload carries `series`; edit-attach path. `tests/e2e/accessibility.spec.ts` — scan the dialog with the Repeat section expanded.

- [ ] **Step 1: Failing Playwright test** — fill repeat fields → submit → assert `create_task` payload contains the tagged recurrence JSON + dates; edit dialog on plain task → add schedule → `update_task` payload carries `series`.
- [ ] **Step 2: A11y spec** for expanded section (fieldset/legend, labelled inputs, axe clean).
- [ ] **Step 3: Run** `npx playwright test`; all green.
- [ ] **Step 4: Full gate** — `cargo fmt`, clippy, prettier, eslint, tsc, `cargo test`, vitest, playwright, bindings + migrations scripts, commitlint. Then commit `test: cover repeating task schedules e2e`.

## Self-review notes

- Spec §111–117 expressiveness: all examples covered except workday-aware (deferred w/ rejected variant) and "last day of month" (≡ `MonthlyDay{day:31}` + clamp — doc'd).
- Spec §95 carry-over default `return` for series handled in `series::create` (None→Return).
- No task should touch occurrence math; if a step wants `next_fitting_date`, it's out of scope — flag it.
