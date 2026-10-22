# Task: task notes

Notes on tasks — instance-scoped and series-scoped. Design:
`docs/superpowers/specs/2026-10-22-task-notes-design.md`, Stitch screen
`.stitch/designs/task-details-notes.html`.

## Shipped

- `task_notes` table (migration 0010): `task_id` XOR `series_id` parent via
  CHECK constraint, cascade-deleted with either parent; `body` +
  `created_at`/`updated_at`.
- `notes` module: `create_for_task`, `create_for_series`, `list_for_task`,
  `list_for_series`, `update`, `delete`. Every entry point verifies the
  parent belongs to the active profile (`note_parent_not_found`,
  `note_not_found`); blank bodies reject (`note_body_empty`); length is
  bounded by `NOTE_BODY_MAX_LEN` (`note_body_too_long`).
- Commands + specta bindings for all six operations.
- `NoteList` component: query-backed list, composer with `maxLength`, inline
  edit, delete, loading/error/empty states, typed `ApiError` surface.
- `NotesTabs` wired to real targets — "Current instance" lists task notes,
  "Series" lists series notes — keeping tab a11y (roving tabindex, hidden
  panels, arrow-key nav).
- Details view: series tasks show `NotesTabs`; plain tasks show a single
  task-scoped `NoteList`; pending (unpersisted) occurrences show no notes
  until the instance exists.

## Deferred

- Notes on a scheduled-but-unpersisted date creating the instance in the
  background (spec §150) — belongs with #29 future-instance editing.
- "This and future" note scope — with #30.
