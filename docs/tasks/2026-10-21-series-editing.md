# Task: series editing (plan #28)

Edit the entire series — every shared property including the recurrence
schedule — and scoped deletion. Design:
`docs/superpowers/specs/2026-10-21-series-editing-design.md`, Stitch screen
`.stitch/designs/series-edit-dialog.html`.

## Shipped

- `update_task_series` command: rewrites shared fields on `task_series` and
  propagates them to every persisted instance in one transaction
  (spec §146). Instance-only fields (`status`, `spent_minutes`,
  `scheduled_date`, `sort_order`, `board`) are untouched.
- Recurrence is editable at series scope — same `NewSeries` validation path
  as creation (intervals, weekdays, real dates, ≥1 occurrence before end).
- `series_categories` join table (migration 0009): a series save writes the
  category set and propagates it to all instances; `list_series_categories`
  reads it. Category ids are profile-checked via `categories::ensure_exists`.
- Scoped deletion from the details view:
  - this instance → `delete_task`;
  - entire series → `delete_task_series` (FK cascade removes instances);
  - this and future → `truncate_task_series` sets `end_date` to the day
    before the viewed instance and deletes instances scheduled on/after it.
- Dialog: "Entire series" save-scope radio enabled; "This and future" stays
  disabled for #30. Schedule fields appear in series-scope edit mode, seeded
  from the loaded series via `RepeatScheduleFields`' new `initialSchedule`
  prop. Spent-time and status stay instance-scoped: spent is disabled at
  series scope, status group disabled accordingly.

## Deferred

- "This and future" save scope (plan #30) — the delete-side equivalent
  (`truncate_task_series`) already exists.
- Notes persistence — split into its own follow-up task by user decision;
  the details view keeps the tab scaffolding with the empty state.
