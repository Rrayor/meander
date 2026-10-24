# This-and-future series editing — design

Plan item #30; spec §146/§152/§234/§255.

## Semantics

Saving with scope "This and future instances" applies the edited values to
the viewed instance and every later occurrence, leaving past instances —
and the series' past — untouched (spec §146: "only leaves past instances
intact").

## Data model: split, but keep the living id

A forward-only edit that can change the recurrence cannot be represented
on a single series row, so the save splits it — **invisibly**: the living
series keeps its id so the change is seamless everywhere it is referenced.

1. When persisted instances exist before the cutoff, an "archive" series
   is inserted: a clone of the old schedule (old fields, recurrence,
   start, categories) ended the day before `from_date` — same cutoff rule
   as `truncate` (earlier of `from - 1` and any existing `end_date`).
   Rows before the cutoff move onto it, ids preserved — instance notes
   stay attached and custom per-instance values are untouched.
2. The living series row is updated in place with the edited fields,
   recurrence, and end date; its `start_date` becomes `from_date`. The
   editor shows Starts read-only at that cutoff so the displayed value is
   the persisted one and Ends validates against it.
3. Persisted instances at or after the cutoff keep `series_id` and get
   their shared fields (title, description, carry-over, estimate)
   overwritten — the same overwrite set as series-scope `update`.
   Per-instance data (status, spent, placement, sort order) is untouched.
4. Series notes stay on the living series — conceptually it never ended
   (notes are deliberately scoped per §150/§266).
5. `from_date <= start_date` with no earlier persisted rows degenerates
   to a whole-series `update`. A cutoff with nothing at or after it is
   rejected (`InstanceDateNotScheduled`); a retried submit against the
   living id degenerates to a harmless full update — no duplicate.

Off-schedule persisted instances follow the same rule as series-scope
edits: they are kept and viewable even if the schedule wouldn't produce
them — an archived one simply lives on the archive instead.

## Backend

`series::update_from(pool, profile_id, series_id, from_date, input)`:

- validates `from_date` as strict ISO (`InstanceDateInvalid`);
- `owned_row` ownership check (`SeriesNotFound`);
- counts rows before/after the cutoff to pick between full `update`,
  rejection, or archive-and-rewrite — all in one transaction;
- returns the (still same id) `TaskSeries`.

Command `update_task_series_from` (args `seriesId`, `fromDate`, `input`),
registered in `lib.rs`, bindings unchanged (no new types).

## Frontend (`EditTaskDialog`)

- The `TaskScope.Future` radio in the save-scope group is enabled, except
  when `viewed.scheduled_date === null` — a future edit needs a date to
  anchor on (SaveScopeFieldset receives `futureDisabled`).
- `saveScope !== TaskScope.Instance` gets series treatment everywhere the
  Series scope already does: seed fields from the series row, stored
  categories come from `listSeriesCategories`, status/spent disabled, the
  schedule section editable — but Starts read-only at the viewed date via
  `RepeatScheduleFields`' `lockedStartDate` prop (remounts per scope and
  anchor via `key`).
- Submit with Future scope sends `update_task_series_from` with
  `fromDate = viewed.scheduled_date` and the same `UpdateSeries` payload
  as series scope. `updateSeriesFrom.isPending` joins the Save guard.
- After save the dialog closes as usual; series-scope invalidation covers
  the moved rows — and since the series id never changes, every open
  view reflects the edit.

## UI/Stitch

No new visual surface — the third scope radio was designed and shipped
disabled in #26; the read-only Starts field reuses the disabled-input
style from the same component.

## Tests

- Rust: archive+rewrite happy path (living id kept, archive ended,
  past moved with custom values, future overwritten), category sync on
  both segments, `from <= start` with no earlier rows delegates,
  off-schedule earlier row preserved, retried split is a harmless full
  update, foreign series and bad dates rejected.
- Cucumber: a this-and-future edit scenario incl. past-instance
  preservation.
- Vitest: every scope enabled, no-date guard, seeding/disabled parity,
  locked Starts, pending save blocked, `updateTaskSeriesFrom` dispatched
  with the viewed date.
- Playwright: stub the command, assert the wire args (`seriesId`,
  `fromDate`, payload) and that the dialog closes.
