# This-and-future series editing — design

Plan item #30; spec §146/§152/§234/§255.

## Semantics

Saving with scope "This and future instances" applies the edited values to
the viewed instance and every later occurrence, leaving past instances —
and the series' past — untouched (spec §146: "only leaves past instances
intact").

## Data model: split the series

A forward-only edit that can change the recurrence cannot be represented
on a single series row, so the save splits it:

1. Old series ends the day before the viewed date — same cutoff rule as
   `truncate` (earlier of `from - 1` and any existing `end_date`). Past
   instances keep `series_id` and stay viewable, mirroring delete-scope
   "this and future" (§236).
2. A new series is created with the edited fields, recurrence, end date,
   and categories. Its `start_date` is the viewed date (`from_date`) — the
   editor shows Starts read-only at that cutoff so the displayed value is
   the persisted one and Ends validates against it.
3. Persisted instances with `scheduled_date >= from_date` move to the new
   series (`series_id` updated, ids preserved → instance notes stay
   attached) and their shared fields (title, description, carry-over,
   estimate) are overwritten — the same overwrite set as series-scope
   `update`. Per-instance fields (status, spent, placement, sort order)
   are untouched.
4. Series notes do not carry over to the new series (notes are
   deliberately scoped per §150/§266; instance notes live on rows and are
   unaffected).
5. `from_date <= start_date` degenerates to a whole-series update only
   when no persisted instance precedes the cutoff — a start moved forward
   can leave off-schedule rows behind that must be preserved. A split
   with nothing at or after the cutoff is rejected
   (`InstanceDateNotScheduled`): a legitimate call always moves at least
   the anchored instance, so zero rows means a retried submit and the
   guard prevents duplicate series.

Off-schedule persisted instances follow the same rule as series-scope
edits: they are kept and viewable even if the new recurrence wouldn't
produce them.

## Backend

`series::update_from(pool, profile_id, series_id, from_date, input)`:

- validates `from_date` as strict ISO (`InstanceDateInvalid`);
- `owned_row` ownership check (`series_not_found`);
- `from_date <= start_date` → `update`;
- otherwise: truncate-old + create-new + move/overwrite future rows +
  `sync_categories` on the new series, all in one transaction;
- returns the new `TaskSeries`.

Command `update_task_series_from` (args `seriesId`, `fromDate`, `input`),
registered in `lib.rs`, bindings regenerated.

## Frontend (`EditTaskDialog`)

- Enable the `TaskScope.Future` radio in the save-scope group; remove the
  coming-soon hint. Guard: the option stays disabled when
  `viewed.scheduled_date === null`.
- `saveScope !== TaskScope.Instance` gets series treatment everywhere the
  Series scope already does today: seed fields from the series row, stored
  categories come from `listSeriesCategories`, status/spent/carry-over
  fields disabled, schedule section editable (RepeatScheduleFields), and
  the same save-blocked conditions.
- Submit with Future scope sends `update_task_series_from` with
  `fromDate = viewed.scheduled_date` and the same `UpdateSeries` payload
  as series scope (`start_date` echoed as the viewed date for symmetry —
  the backend anchors on `from_date` regardless).
- After save the dialog closes as usual; series-scope invalidation covers
  the moved rows.

## UI/Stitch

No new visual surface — the third scope radio was designed and shipped
disabled in #26. Enabling it needs no new design pass.

## Tests

- Rust: split happy path (old ends, new series created, rows moved with
  ids, shared fields overwritten, per-instance fields kept), categories
  synced onto the new series, `from <= start` delegates to full update,
  foreign series rejected, malformed `from_date` rejected.
- Cucumber: a this-and-future edit scenario incl. past-instance
  preservation.
- Vitest: the Future radio is enabled for series instances, seeds from
  the series row, disables per-instance fields, sends `updateTaskSeriesFrom`
  with the viewed date, and a typed rejection surfaces inline.
- Playwright: stub the command, assert the wire args (`seriesId`,
  `fromDate`, payload) and that the dialog closes.
