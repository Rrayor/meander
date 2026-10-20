# Task Details View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a backlog task opens a details view — today's edit-dialog layout read-only until Edit is pressed — with series audit info, an instance calendar, notes tabs, and a (disabled-scope) save prompt for repeating tasks.

**Architecture:** Extend `EditTaskDialog` with a view/edit mode instead of a parallel dialog tree. One new backend read command (`list_series_instances`), one new pure TS predicate (`isScheduledOn`) for scheduled-date detection, plus TS wrappers for the existing series commands. UI design goes through Stitch first per repo rules.

**Tech Stack:** Rust/SQLx backend, specta bindings, React + react-hook-form + zod, Tailwind, Vitest/RTL, Playwright, cucumber.

**Spec:** `docs/superpowers/specs/2026-10-21-task-details-view-design.md` (also `docs/specification.md` §"Viewing Task details")

## Global Constraints

- No magic values: labels/commands/query keys live in `src/lib/labels.ts`, `src/api/commands.ts`, `src/api/queryKeys.ts`; tests import the constants.
- Regenerate `src/api/bindings.ts` after Rust type/command changes — never hand-edit (`scripts/check-bindings.sh` gates it).
- Errors cross the wire as typed `ApiError` (`code`, `kind`, `message`).
- IPC only through `src/api/` — no `@tauri-apps/*` imports elsewhere.
- UI work requires a Stitch design first (`generate-design` skill; save under `.stitch/designs/`, update `.stitch/metadata.json`).
- WCAG AA: `role="alert"` inline errors, labeled controls, keyboard operability.
- Known-incomplete by design: series-scope save options are **disabled with a hint**, calendar selection of an unpersisted date shows an empty state (no instance creation), notes tabs are empty-state scaffolding, no delete button in the view.

## Review Focus

- `isScheduledOn` month-end clamping: monthly-day `31` must land on Feb 28/29 (per `REPEAT_MONTHLY_CLAMP_HINT`), never skip the month — Task 3 tests pin leap/non-leap.
- Interval anchoring: "every 2 weeks" must count from `start_date`, not from an epoch Monday — Task 3 tests pin a non-aligned start.
- `monthly_nth_weekday` with `nth = -1` (last) must find the *last* matching weekday, and `nth` beyond the month's count must not match (no 5th-Monday collapse) — Task 3.
- Selecting a date whose instance isn't persisted yet must show the empty state, not a crash or a phantom task — Task 7.
- Read-only mode must not let a stray submit save anything (form absent/disabled) — Task 5.

---

### Task 1: Backend `list_series_instances` command

**Files:**
- Modify: `src-tauri/src/tasks.rs` (add `list_instances`)
- Modify: `src-tauri/src/commands.rs:158` (add command next to `list_task_series`)
- Modify: `src-tauri/src/lib.rs` (register in invoke handler)
- Regenerate: `src/api/bindings.ts`

**Interfaces:**
- Produces: `pub async fn list_instances(pool: &SqlitePool, profile_id: i64, series_id: i64) -> Result<Vec<Task>, DbError>` returning tasks where `series_id = ?` ordered by `scheduled_date`.
- Command: `#[tauri::command] pub async fn list_series_instances(state: State<'_, AppState>, series_id: i64) -> Result<Vec<Task>, ApiError>`.

- [ ] **Step 1: Write the failing test** in `tasks.rs` mod tests — insert a task with `series_id` set (follow the existing `link`/series test helper), assert `list_instances` returns only that series' tasks ordered by `scheduled_date`, and a second profile's series returns empty.
- [ ] **Step 2: Run** `cargo test -p meander_lib list_instances` — expect compile error (function missing).
- [ ] **Step 3: Implement** `list_instances` in `tasks.rs` (SELECT ... WHERE profile_id AND series_id ORDER BY scheduled_date) + the `list_series_instances` command + invoke-handler registration.
- [ ] **Step 4: Run** `cargo test -p meander_lib` — green.
- [ ] **Step 5:** `./scripts/check-bindings.sh` (or the documented regen command) — bindings updated.
- [ ] **Step 6: Commit** `feat: list instances of a series`.

### Task 2: Stitch design pass

**Files:**
- Create: `.stitch/designs/task-details-dialog.html`
- Modify: `.stitch/metadata.json`

- [ ] **Step 1:** Invoke `generate-design` — task details dialog: read-only field block (title, description, categories, carry-over, estimate, spent, audit timestamps), Edit button top-right, below-fields sections for series tasks (series audit line, month calendar with prev/next, two tabs "Current instance"/"Series" with empty state, save-scope radio group with two options disabled + hint).
- [ ] **Step 2:** Save output to `.stitch/designs/task-details-dialog.html`; record in `.stitch/metadata.json` notes.
- [ ] **Step 3: Commit** `design: task details dialog mockup` (designs only — no code yet).

### Task 3: `isScheduledOn` recurrence predicate

**Files:**
- Create: `src/lib/recurrence.ts`
- Test: `src/lib/recurrence.test.ts`

**Interfaces:**
- Produces: `export const isScheduledOn = (recurrence: Recurrence, startIso: string, endIso: string | null, iso: string) => boolean` — true when `iso` is a scheduled occurrence in `[startIso, endIso ?? ∞]`. `iso` is `YYYY-MM-DD`.

Rules: daily → `(date - start).days % interval === 0`; weekly → `(weeks between)` `% interval === 0` AND iso's weekday ∈ `weekdays`; monthly_day → `(months since start) % interval === 0` AND iso day == min(day, last day of month); monthly_nth_weekday → same month-interval test AND iso is the nth (or last when nth = -1) matching weekday of its month.

- [ ] **Step 1: Write failing tests** covering: daily every-N-days; weekly interval + weekday set; monthly day incl. Feb clamp (day 31 → Feb 28/29); nth weekday incl. -1 last and a date past the month's nth count; before-start and after-end exclusion; non-aligned start anchor.
- [ ] **Step 2: Run** `npx vitest run src/lib/recurrence.test.ts` — fail (module missing).
- [ ] **Step 3: Implement** `isScheduledOn` in `src/lib/recurrence.ts` (pure date math; reuse `weekdayOfIso` from `@/lib/utils`).
- [ ] **Step 4: Run** the test file — green.
- [ ] **Step 5: Commit** `feat: recurrence occurrence predicate`.

### Task 4: TS API wrappers + query keys

**Files:**
- Modify: `src/api/tasks.ts` (or new `src/api/series.ts` if cleaner)
- Modify: `src/api/commands.ts`, `src/api/queryKeys.ts`

**Interfaces:**
- Produces: `listSeriesInstances(seriesId: number): Promise<Task[]>`, `listTaskSeries(): Promise<TaskSeries[]>`; `QUERY_KEYS.seriesInstances(seriesId)`, `QUERY_KEYS.taskSeries` (profile-scoped like existing keys).

- [ ] **Step 1:** Add `listSeriesInstances`/`listTaskSeries` command names, wrappers through `transport.invoke`, and profile-scoped query keys (follow `listTaskCategories` conventions).
- [ ] **Step 2: Run** `npx tsc --noEmit` — clean.
- [ ] **Step 3: Commit** `feat: series api wrappers`.

### Task 5: Read-only view mode + Edit toggle in `EditTaskDialog`

**Files:**
- Modify: `src/features/tasks/EditTaskDialog.tsx` (add `mode` state: `"view" | "edit"`, default `"view"`)
- Test: `src/features/tasks/EditTaskDialog.test.tsx`

- [ ] **Step 1: Update `renderDialog`** — existing tests continue to exercise edit mode, so the helper clicks the Edit button (`EDIT_BUTTON_LABEL` in labels) after render. Add new tests: view mode shows field values as text, no form submission possible; clicking Edit reveals the form.
- [ ] **Step 2: Run** — failing (no view mode / no Edit button).
- [ ] **Step 3: Implement** — in view mode render the field values as read-only text per the Stitch design (Task 2), plus `Edit` button that sets `mode: "edit"` rendering the existing form unchanged. Audit info (created/updated via `formatDate`) shown in view mode.
- [ ] **Step 4: Run** `npx vitest run src/features/tasks/EditTaskDialog.test.tsx` — green.
- [ ] **Step 5: Commit** `feat: task dialog opens read-only with edit toggle`.

### Task 6: Series sections — audit info, save-scope prompt

**Files:**
- Modify: `src/features/tasks/EditTaskDialog.tsx`
- Modify: `src/lib/labels.ts` (series audit labels, scope labels, disabled hint)
- Test: `src/features/tasks/EditTaskDialog.test.tsx`

- [ ] **Step 1: Failing tests** — a task with `series_id`: view mode shows series audit line (from `listTaskSeries` via TanStack query, find matching `series_id`); edit mode shows a save-scope radio group (`instance` selected; `series` and `future` disabled with hint label); save still sends instance-scoped `updateTask` as today.
- [ ] **Step 2: Run** — fail.
- [ ] **Step 3: Implement** — query `listTaskSeries`, render audit line in view mode; render the radio group in edit mode for `task.series_id` only. Labels: `TASK_SCOPE_INSTANCE_LABEL`, `TASK_SCOPE_SERIES_LABEL`, `TASK_SCOPE_FUTURE_LABEL`, `TASK_SCOPE_COMING_SOON_HINT`, `SERIES_AUDIT_LABEL` (+ `formatSeriesAudit` if interpolated).
- [ ] **Step 4: Run** — green.
- [ ] **Step 5: Commit** `feat: series audit info and save-scope prompt`.

### Task 7: Instance calendar + notes tabs

**Files:**
- Create: `src/features/tasks/InstanceCalendar.tsx`, `src/features/tasks/NotesTabs.tsx`
- Modify: `src/features/tasks/EditTaskDialog.tsx` (render both below fields when `task.series_id`)
- Test: `src/features/tasks/InstanceCalendar.test.tsx`, dialog tests

**Interfaces:**
- Consumes: `isScheduledOn` (Task 3), `listSeriesInstances` (Task 4), `TaskSeries` (Task 4 wrapper), labels registry.
- `InstanceCalendar({ series, onPick }: { series: TaskSeries; onPick: (task: Task | null, iso: string) => void })` — month grid; scheduled dates (via `isScheduledOn`) are selectable; selecting calls `onPick` with the persisted `Task` for that `scheduled_date` or `null` + the iso.

- [ ] **Step 1: Failing tests** — calendar renders current month with prev/next nav; scheduled dates selectable (others not); selecting a persisted-instance date calls `onPick` with the task; unpersisted scheduled date calls `onPick(null, iso)`; notes tabs switch between "Current instance"/"Series" empty states.
- [ ] **Step 2: Run** — fail.
- [ ] **Step 3: Implement** — month grid from the series' start month; use `listSeriesInstances` query for persisted tasks; on `onPick(null, iso)` the dialog shows a "scheduled — created when the board is generated" empty state in place of field values. `NotesTabs` renders two tabs with empty-state text only.
- [ ] **Step 4: Run** — green.
- [ ] **Step 5: Commit** `feat: instance calendar and notes tabs in details view`.

### Task 8: e2e + a11y coverage

**Files:**
- Modify: `tests/e2e/backlog.spec.ts`, `tests/e2e/accessibility.spec.ts`, `tests/e2e/stubs.ts` (fixture tasks with `series_id`/`scheduled_date`)

- [ ] **Step 1: Failing spec** — opening a task shows read-only details (no inputs); Edit unlocks the form; a series task shows the calendar + tabs; selecting a scheduled date shows the instance or empty state (stub `list_series_instances`/`list_task_series`).
- [ ] **Step 2: Run** `npx playwright test tests/e2e/backlog.spec.ts` — fail.
- [ ] **Step 3: Implement** fixtures/assertions; extend the axe scan to the details view with calendar + tabs expanded.
- [ ] **Step 4: Run** — green.
- [ ] **Step 5: Commit** `test: cover the task details view end to end`.

---

## Self-review notes

- Spec coverage: read-only open, Edit unlock, fields+audit shown, series audit shown, calendar with selectable scheduled dates, notes tabs, save-scope prompt present (disabled series options = deliberate #26 deferral, recorded). Deferred by design/doc: persistence of series scope, instance pre-creation, calendar highlighting, delete, arbitrary date move, notes persistence.
- `isScheduledOn` is frontend-only for now; the backend needs the same semantics later for board generation — flag as parity requirement in the task doc.
- Deferred-criteria bookkeeping also lives in `docs/tasks/` — create `docs/tasks/2026-10-21-task-details-view.md` alongside the plan with the milestone summary and deferral list (AGENTS.md requires deferrals be recorded).
