# Task details view — design

Milestone: big-picture-plan item 26. Adds the task details view described in
`docs/specification.md` §"Viewing Task details" as a read-only-first dialog,
leaving series editing (#28) and calendar highlighting (#27) for later
milestones.

## Intent and why

Today, clicking a task opens the edit dialog directly — there is no way to
look at a task without entering edit mode, and nowhere for repeating-task
surfaces (instance calendar, split notes, series audit info, save-scope
choice) to live. This milestone introduces that surface so #27 (calendar
highlighting) and #28 (whole-series editing) have a home.

## User decisions

- The details view is **the same layout as the edit dialog** — fields
  read-only on open; an **Edit** button unlocks them. Editing then behaves
  exactly as today's edit dialog (instance-level only).
- For repeating tasks, the **instance calendar** and **two notes tabs**
  ("Current instance" / "Series") live **below the fields** inside the same
  dialog.
- Selecting a date in the calendar **loads that instance into the dialog,
  read-only**. Dates where the schedule would place an instance but none is
  persisted yet show a "scheduled — instance created when the board is
  generated" empty state (assistant's call: background pre-creation of
  instances is #28 territory).
- Series-scope save options render **disabled with a short "available when
  series editing lands" hint** — never silently applying instance-scope
  saves (assistant's call; honest-disabled beats deceptive-functional).
- The read-only view shows the **instance's** field values; the series
  block shows audit information only (created/updated), not duplicated
  series field values (assistant's call).
- No Delete button in the details view this milestone — deletion stays in
  the backlog; the scoped delete prompt lands with #28 (user decision).
- All tasks open the details view read-only — not just series tasks
  (assistant's call).

## Goals

- Clicking a task card (board) or backlog row opens the details view in
  read-only mode.
- All current fields shown read-only: title, description, categories,
  carry-over rule, estimated/spent time, audit information — plus **series
  audit information** for series tasks (created/updated from
  `list_task_series`).
- An Edit button switches the dialog into the existing editable form.
- For tasks with `series_id`: an instance calendar and the two notes tabs
  render below the fields. Selecting a scheduled date loads that instance
  read-only (needs one new backend read command, e.g.
  `get_series_instance(series_id, date)` / list-instances-for-series —
  whichever the plan settles on).
- The save flow gains the scope prompt (this instance / entire series /
  this and future instances) for series tasks; series-scope options may be
  present but non-functional (documented as known-incomplete until #28).
- WCAG AA throughout; axe coverage for the new surfaces.

## Non-goals (this milestone)

- Backend changes for notes — notes data model doesn't exist yet; tabs
  render empty scaffolding ("No notes yet" or equivalent empty state).
- Calendar instance highlighting — deferred to #27. The calendar renders a
  month grid and accepts date selection but highlights nothing.
- Whole-series or "current + future" persistence — deferred to #28.
- Moving a task to an arbitrary date — deferred (needs board/date model
  work; note as TODO).
- Deletion from the details view entirely — deferred to #28 alongside the
  delete-scope prompt.
- Pre-creating instances on calendar selection — deferred to #28 (spec's
  background-instance behavior).

## Constraints

- Reuse `EditTaskDialog` as the base — the details view is that dialog in a
  read-only default mode, not a separate component tree. (Assistant's call:
  avoids duplicating the entire form; read-only mode renders field values
  as text where inputs exist today.)
- Stitch design pass first per `AGENTS.md` UI rules: generate the details
  view (fields + calendar + notes tabs) via the `generate-design` skill,
  save under `.stitch/designs/`, update `.stitch/metadata.json`, then
  implement via the react-components conventions.
- `list_task_series` needs a TS wrapper in `src/api/` (command exists in
  the backend already) to fetch series audit info for the details view.
- Backend: one new read command returning a series' persisted instance for
  a given date (or the list of instances for a series — the plan picks) to
  back calendar selection. Read-only; no instance creation.
- Scope prompt options come from a label registry (`src/lib/labels.ts`).

## Known-incomplete, tracked

- Notes tabs render an empty state; no notes backend exists yet.
- Scope prompt's series options are disabled and don't persist
  series-wide changes (until #28).
- Calendar shows no instance highlighting (until #27); selecting a
  scheduled-but-unpersisted date shows an empty state rather than creating
  the instance (until #28).

## Acceptance criteria covered

From spec §"Viewing Task details": clicking a task opens the view; fields
and audit info (incl. series audit info) shown; all info editable except
audit (via the Edit unlock, instance scope only); notes tabs rendered;
save-scope prompt present. Deferred criteria (calendar highlight/edit,
scope persistence, date move, delete scopes, notes persistence) are
explicitly deferred to #27/#28 and noted in the task plan doc.
