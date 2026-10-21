# Whole-series editing + scoped delete — design

Milestone: big-picture-plan item 28. Enables the "entire series" save scope
and adds scoped deletion to the task details view, per
`docs/specification.md` §"Repeating tasks" and §"Viewing Task details".
Notes are deliberately split into a follow-up task (user decision — the
notes data model doesn't exist yet and deserves its own PR).

## User decisions

- **Notes split out** — #28 ships series editing + delete scopes; the notes
  backend + functional tabs are a separate task/PR after this.
- **Delete included** — the details view gains a Delete affordance with the
  spec's scope prompt (instance / entire series / current + future).
- **Schedule editable** — series scope surfaces `RepeatScheduleFields`
  seeded from the series row; "all the properties" includes the
  recurrence, start, and end dates.
- **Series categories added** — new `series_categories` table; a series
  save propagates the category set to every instance, overwriting
  instance-level picks (spec §146: series edits overwrite custom edits).

## Semantics

### Update scope

- **This instance** — today's behavior, unchanged.
- **Entire series** — writes the form values (title, description,
  carry-over, estimated minutes), the edited schedule, and the category
  set onto the `task_series` row, then propagates title/description/
  carry-over/estimate/categories to **every** persisted instance (past and
  future), overwriting per-instance customizations per spec §146.
  `status`, `spent_minutes`, `scheduled_date`, and `placement` remain
  per-instance — the series row doesn't carry them.
- **Current + future** — stays disabled (item 30).

### Delete scope (prompt on Delete)

- **This instance** — existing `delete_task` on the viewed row.
- **Entire series** — `task_series` row delete; FK cascade removes all
  instances (spec §154).
- **Current + future** — deletes persisted instances with
  `scheduled_date >= viewed date` and truncates `end_date` to the day
  before the viewed date (spec §152/§236: "effectively ending the
  series"). If the viewed date is at/before `start_date`, this is
  equivalent to a whole-series delete; the command treats it as such.
  Past instances keep `series_id` and remain viewable.

## Backend

- Migration `0009_series_categories.sql`: `series_categories(series_id,
category_id)` PK, both FK cascade.
- `update_task_series(input)` — validates title/description/estimate via
  the existing nutypes, `Recurrence::validate`, `end >= start`, and the
  `first_occurrence`-through-`end_date` rule (reuses `series::insert`'s
  checks). One transaction: series row, instance propagation,
  `series_categories` + `task_categories` sync.
- `delete_task_series(series_id)` — cascades.
- `truncate_task_series(series_id, from_date)` — current+future delete.
- `list_series_categories(series_id)` — read for view/edit seeding.
- Instance-scope paths reuse existing commands.

## Frontend

- Save-scope radio: "entire series" enabled; "current + future" stays
  disabled with the coming-soon hint until #30.
- Series scope keeps the same form; the schedule fields appear seeded
  from the series row (schedule editing is series-scope only — an
  instance can't re-scope its series' calendar).
- Delete button in the details view opens a scope prompt (radio + confirm);
  "this instance" only offered when the viewed row is persisted.
- New labels/messages through `src/lib/labels.ts` registries; specta
  bindings regenerated.

## Deferred (recorded, not forgotten)

- Notes model + tabs — next task.
- "Current + future" edit scope — #30.
- Editing individual future instances (pre-creation) — #29.
- Moving a task to an arbitrary date — still deferred.
- Category list "count of associated tasks and task series" (spec §203)
  — the count query gains series counts when the categories page surfaces
  it; this task only builds the schema + propagation.

## Testing

- Rust: update/truncate/propagation cases incl. off-schedule and past
  instances, atomicity on validation failure, cross-profile rejection,
  category sync overwrite.
- Vitest: scope enablement, schedule seeding, delete prompt paths.
- Playwright: series-scope save propagates; delete scopes wire the right
  commands.
- Cucumber: backend scenarios for update/truncate/delete semantics.
- Axe coverage extended to the delete prompt.
