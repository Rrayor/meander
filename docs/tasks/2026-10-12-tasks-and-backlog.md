# Milestone: task entity + backlog CRUD

Big-picture plan steps **15–18**. First profile-owned entity — this activates
the deferred "profile-scoping verification" item: everything created here must
be scoped to the active profile.

## Task 1 — task entity + backlog list (step 15)

- Migration `0003_tasks.sql`: `tasks` table
  - `id` INTEGER PRIMARY KEY
  - `profile_id` INTEGER NOT NULL REFERENCES profiles(id) — tasks belong to a
    profile; queries always filter by the active profile
  - `title` TEXT NOT NULL (validated like profile names: non-blank after trim;
    no control characters; pick a sane cap, e.g. 200)
  - `description` TEXT NULL
  - `status` TEXT NOT NULL DEFAULT 'todo' CHECK(status IN
    ('todo','in_progress','done')) — enum mirrored as a specta-exported Rust enum
  - `carry_over_rule` TEXT NULL CHECK(carry_over_rule IN ('carry','return'))
    NULL = "ask at week boundary" per spec; 'return' = moves back to the
    global backlog (spec renamed "discard" — it is not deletion)
  - `estimated_minutes` INTEGER NULL, `spent_minutes` INTEGER NULL
  - `placement` TEXT NOT NULL DEFAULT 'backlog' CHECK(placement IN
    ('backlog','weekly_backlog','scheduled')), `scheduled_date` TEXT NULL —
    `backlog` = global backlog; `weekly_backlog` = the standing
    not-yet-day-assigned container, shown only on the current week's board
    (spec: weekly backlog is current state, never history, and takes no date);
    `scheduled` + date = day column on that date
    `CHECK (placement != 'scheduled' OR scheduled_date IS NOT NULL)` and
    `CHECK (placement != 'weekly_backlog' OR scheduled_date IS NULL)`
  - `created_at`, `updated_at` TEXT defaults
- `tasks.rs` service: `list(pool, profile_id)` only
- `Task` struct: `specta::Type` + `FromRow`; `TaskStatus` enum exported to TS
- `TaskTitle` nutype newtype (same pattern as `ProfileName`)
- `list_tasks` command + `tasksApi` + `COMMANDS.listTasks` + `QUERY_KEYS.tasks`
- Backlog page (`BacklogPage`): Stitch screen first; renders a list of task
  titles + status badge + estimate; empty state when no tasks
- Tests: cucumber (tasks scoped to profile, seeded profile sees empty list),
  Playwright (list renders, status shown)

## Task 2 — task creation (step 16)

- `tasks::create(pool, profile_id, title)` — title only at this step
- Inline create form on the backlog page (same pattern as profiles)
- `create_task` command validates against the _active_ profile — you cannot
  create a task on a profile you haven't selected
- Tests: cucumber (create+trim/blank reject, created on active profile),
  Playwright (create flow, validation)

Implemented beyond the plan: a proper creation **dialog** (title,
description, estimate as h+min, carry-over rule select) instead of the
inline form; `NewTask` DTO; bounds per spec (estimate 1min–24h, description
≤20k chars) and typed error codes.

## Task 2b — backlog manual ordering

- `sort_order REAL` column, default = insertion order (`MAX(sort_order) + 1`
  on insert)
- `tasks::move_task(pool, profile_id, task_id, before_id, after_id)` —
  midpoint insertion between the two drop neighbours (either may be the list
  edge); pagination-safe since only the anchors are needed; lazy
  renormalization if a gap is exhausted
- `move_task` command + `@dnd-kit` sortable list with a drag handle
  (keyboard reordering included — required for WCAG AA)
- Spec: manual order is the default display order; future sorting/filtering
  are view-time transforms that never touch it
- Tests: cucumber (move persists, foreign anchor rejected), Playwright (drag)

## Task 3 — task deletion (step 17)

- `tasks::delete(pool, profile_id, id)` — scoped delete; deleting another
  profile's task id is an error, not a no-op
- Delete button per backlog row; no confirmation yet (spec's deletion
  prompting only applies to repeating tasks)
- Tests: cucumber (delete removes row, cross-profile delete rejected),
  Playwright (row disappears)

## Task 4 — task editing (step 18)

- `tasks::update(pool, profile_id, id, {title, description, carry_over_rule,
estimated_minutes, spent_minutes, status})` — full-row update, scoped
- Task detail/edit view opened from a backlog row: title, description, status,
  carry-over rule select, estimated/spent minutes — plus read-only audit
  info (created_at/updated_at) per spec
- `updated_at` bump
- Tests: cucumber (update persists, timestamp bumps, unknown id rejected),
  Playwright (edit flow persists)

## Deferred items

- Notes (entity + UI) — later milestone per spec
- Categories — steps 19–24
- Repeat schedule + series — steps 25–30
- "Ask at week boundary" carry-over prompt — needs the board (steps 34, 39)
- Backlog pagination — step 51
- "Add to current week" / move-back actions — step 50
- Task create entry point on the kanban view — step 49
- Scheduling a date at task creation (spec's create view allows it) —
  a scheduled task isn't visible anywhere until the board exists (steps 34+)
- Backlog sorting/filtering/search — spec features not yet assigned to a
  step; they are view-time transforms on top of the stored manual order and
  interact with pagination (step 51) — schedule alongside or after it
- Task placement changes via detail view ("move to a different date") —
  needs the board; step 50 family
