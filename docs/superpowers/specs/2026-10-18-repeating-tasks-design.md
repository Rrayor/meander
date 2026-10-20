# Repeating tasks — series persistence + schedule UI (roadmap step 25)

## Intent

Spec §54/§109–135: a task can carry a repetition schedule. When a schedule is
set on create or edit, a **task series** is created in the database. This
milestone persists the schedule and exposes it in the task dialogs — it does
**not** generate occurrences, create instances, or touch boards/calendars
(steps 26–30 own that).

## Goals

- Store a profile-scoped task series with the task's fields plus a schedule.
- Let the user enter the schedule in the new-task and edit-task dialogs.
- Attach a plain task to a new series when a schedule is added on edit —
  the task becomes the series' first instance, keeping all its fields
  (user decision: no destructive convert).
- Keep the recurrence model a closed, type-safe set (user decision: no RRULE).

## Non-goals (deferred, recorded here)

- Occurrence calculation / instance creation (steps 26–30).
- The "next fitting date" default for the start date — spec §125 wants it,
  but it _is_ occurrence calculation; this step defaults the start field to
  today and requires the user to confirm/pick a date.
- Workday-aware rules ("first workday after the 11th") — needs the work-day
  settings from the settings milestone (step ~35). The enum reserves the
  variant; the UI does not offer it yet.
- Editing a series' schedule after creation (step 28 — "edit entire series").
- Category association on the series itself (spec §203 counts series
  separately; `task_series_categories` is deferred wholesale to the
  series-edit milestone — instances keep categories via `task_categories`).
- Showing series in the backlog/board (needs the board milestone).

## Data model

A series holds the shared task fields plus the schedule; an **instance is
an ordinary `tasks` row** linked via a new nullable FK — the task keeps
status, spent time, placement, sort order, and `task_categories` untouched:

```sql
CREATE TABLE task_series (
    id INTEGER PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES profiles (id),
    title TEXT NOT NULL,
    description TEXT,
    carry_over_rule TEXT NOT NULL DEFAULT 'return'
        CHECK (carry_over_rule IN ('carry', 'return')),
    estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
    recurrence TEXT NOT NULL,        -- serde JSON of the Recurrence enum
    start_date TEXT NOT NULL,        -- ISO date 'YYYY-MM-DD'
    end_date TEXT,                   -- NULL = repeats indefinitely
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX idx_task_series_profile ON task_series (profile_id);

ALTER TABLE tasks ADD COLUMN series_id INTEGER
    REFERENCES task_series (id) ON DELETE CASCADE;
CREATE INDEX idx_tasks_series ON tasks (series_id);
```

`ON DELETE CASCADE` mirrors spec §154 — deleting a series removes its
instances (the spec's "delete series" choice deletes past+future
instances; keeping instances while deleting the series is not a spec'd
option).

`recurrence` is serde-JSON text holding the tagged enum below — the closed
set lives in Rust types; extending it later needs no migration, only a new
variant (unknown variants fail deserialization loudly, which is correct for
a closed set). Same principle as the TEXT-enum columns elsewhere, one level
of nesting deeper.

Wiring detail (builder-check): sqlx has no `json` feature here, so the
column binds as `String` on write and `TaskSeries` is materialized by
reading the column then `serde_json::from_str` — the exported struct
carries `recurrence: Recurrence`, and a corrupt row maps to an internal
`DbError` (a bug, not user input). The stored JSON shape must stay what
serde emits for the tagged enum — that's what specta exports to TS, so the
wire type and the stored type are the same document.

`task_series_categories` also gets `CREATE INDEX ... ON (category_id)`,
mirroring `task_categories` (0007).

## The closed recurrence set

```rust
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Recurrence {
    /// "Every day" / "every 3 days"
    Daily { interval_days: u32 },
    /// "Every week on Monday" / "every 2 weeks on Mon+Wed"
    Weekly { interval_weeks: u32, weekdays: Vec<Weekday> },
    /// "On the 11th of each month" / "every 3 months on the 1st".
    /// `day` 1–31; short months clamp to the last valid day (spec §119), so
    /// day=31 IS "last day of the month" — no dedicated variant needed.
    MonthlyDay { interval_months: u32, day: u8 },
    /// "Second Monday", "last Friday". nth: 1–4 = 1st–4th, -1 = last.
    MonthlyNthWeekday { interval_months: u32, nth: i8, weekday: Weekday },
    /// "First workday after the Nth" — reserved for the work-day-settings
    /// milestone. The variant exists in the type but validation REJECTS it
    /// until that milestone ships — an accepted-but-inert rule is worse
    /// than a typed error.
    WorkdayAfter { day: u8 },
}
pub enum Weekday { Monday, .., Sunday }  // serializes as "monday".."sunday"
```

Validation (backend authoritative): a `validate(&Recurrence) -> Result<()>`
on the enum (nutype can't wrap variant fields) covering intervals ≥ 1,
`day` 1–31, `nth` ∈ {1..=4, -1}, `weekdays` non-empty/deduped, and
`WorkdayAfter` rejected-for-now. nutype newtypes for the scalars where they
pay off (dates as a `IsoDate` newtype). End date ≥ start date is a schema
CHECK _and_ a typed error; malformed dates get `StartDateInvalid`/
`EndDateInvalid`.

New `ErrorCode` variants: `SeriesNotFound`, `RecurrenceInvalid`,
`StartDateInvalid`, `EndDateInvalid`, `EndDateBeforeStart`,
`WorkdayRulesUnsupported`.

## API surface

The schedule rides the existing task commands — no separate
create/convert commands:

- `NewTask` and `UpdateTask` each gain `series: Option<NewSeries>` where
  `NewSeries { recurrence, start_date, end_date? }`. When present:
  - `create` — one transaction: insert `task_series` (fields copied from
    the task input), insert the task with `series_id` set. Returns the
    `Task`, which now carries `series_id: Option<i64>`.
  - `update` — on a plain task: insert the series (fields copied from the
    update input) and set `task.series_id`; the task's status/spent/
    placement/categories are untouched — no data loss. On a task that
    already has `series_id`: typed `AlreadyInSeries` error this step —
    editing a series' schedule is step 28, and the UI won't offer the
    repeat section on instances yet.
- `list_task_series` → `Vec<TaskSeries>` (profile-scoped, `ORDER BY id`;
  needed for tests now, list UI later).
- `delete_task_series(id)` — spec §152 series deletion lands here cheaply;
  cascades to instance tasks.

Categories need no new plumbing: they live on the instance via the
existing `task_categories` join and the dialogs' add/remove diff — so a
scheduled task keeps its chips with zero extra commands.

`TaskSeries`/`NewSeries`/`Recurrence`/`Weekday` are registered in
`bindings.rs`'s export list, `commands.ts`, and `lib.rs`'s handler list —
all three are hand-maintained.

Frontend: `src/api/series.ts` + command/QUERY_KEYS entries, transport calls
through the existing seam; specta bindings regenerated.

## UI

Stitch pass on the task dialogs first. A collapsed-by-default "Repeat"
section in both dialogs: frequency select (Daily / Weekly / Monthly day /
Monthly nth weekday), per-frequency sub-fields (interval number, weekday
checkboxes or day number or nth+weekday selects), start-date and optional
end-date inputs, plus an inline note when a chosen day can clamp in short
months (spec §132 warning — static hint for day > 28 since real per-month
evaluation is a calculation step). Setting a schedule goes out as
`series` on the normal create/update call — the backend links the task as
the first instance. The repeat section is hidden when editing a task that
already belongs to a series (`series_id` set) — series editing is step 28.

## Testing

- Rust: unit tests for recurrence validation, series create/list/delete,
  create-with-schedule linking, update-attaches-series (incl.
  foreign-profile rejection and `AlreadyInSeries`); cucumber scenario for
  create→list→attach.
- Frontend: vitest for the schedule field group (per-frequency validation,
  wire payloads, convert path); Playwright e2e create-with-schedule +
  edit-to-series; axe scan of the expanded section; smoke spec optional —
  series aren't visible in lists yet, so a smoke test has no user-visible
  path to assert; rely on cucumber for the real-backend round trip.
- Bindings + migration checks enforced by existing hooks.

## My calls (flagged for review)

- JSON-in-TEXT for `recurrence` rather than flat columns — keeps the closed
  set closed and extensible without migrations.
- Adding a schedule links the task instead of converting it — the task
  row becomes the first instance (user's call; keeps all instance fields
  and avoids the delete-and-copy path entirely).
- `carry_over_rule` on series is `NOT NULL DEFAULT 'return'` — the
  "leave empty to be prompted" affordance is a plain-task option; a series
  always has a concrete rule (spec §81 makes `return` the default).
- Series get no `sort_order`/backlog row yet — they only surface in the UI
  via the detail/board milestones.
- Start-date input defaults to _today_; the spec's "next fitting date"
  default is deferred as calculation work.
- The clamping warning for day-of-month > 28 renders as a static hint in
  the dialog (spec §132's warning); real per-month evaluation is
  calculation work for later steps.
