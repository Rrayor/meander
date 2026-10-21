# Task details view (big-picture item 26)

Implements `docs/superpowers/specs/2026-10-21-task-details-view-design.md`;
plan at `docs/superpowers/plans/2026-10-21-task-details-view.md`.

## Scope

- Backlog task rows open a details view: the edit dialog's layout in
  read-only mode; an Edit button unlocks today's instance-level editing.
- Series tasks additionally show: series audit info, an instance calendar
  (scheduled dates selectable; persisted instances load read-only,
  unpersisted dates show an empty state), "Current instance"/"Series" notes
  tabs, and a save-scope radio group.

## Deferred (recorded per AGENTS.md — decisions, not oversights)

- **Notes persistence** — no notes backend exists yet; tabs render empty
  states only.
- **Series-scope saves** — the scope prompt's `series`/`future` options are
  disabled with a hint until item 28 lands `update_task_series`.
- **Calendar highlighting of scheduled dates** — item 27; the predicate
  (`isScheduledOn`) is built this milestone and #27 only adds the visual.
- **Background pre-creation of future instances** on calendar selection —
  item 28 (spec §"Viewing Task details" pre-created-instance semantics).
- **Delete from the details view** (and its scope prompt) — item 28.
- **Moving a task to an arbitrary date** — needs board/date model work.
- **Board task cards** — the board page is still a stub; the details view
  integrates there when the board exists.

## Parity note

`isScheduledOn` (frontend) duplicates recurrence semantics the backend will
need for board-time instance generation — keep the two implementations in
lockstep when the backend evaluator lands.
