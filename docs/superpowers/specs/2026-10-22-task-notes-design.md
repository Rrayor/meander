# Task notes — design

Spec §12, §150, §230, §238, §249, §260–272. Split from #28 by user decision;
this task lands the notes data model and CRUD.

## Scope (decided with user)

- Notes CRUD on the **viewed** entity: a plain task gets a single notes
  list; a repeating task gets the "Instance" / "Series" tabs — instance
  notes bind to the currently viewed instance, series notes to the series.
- Past persisted instances are selectable in the calendar already; notes
  on them are editable per §249 (notes are exempt from the read-only rule).
- **Deferred**: notes on scheduled-but-unpersisted dates (which must
  create the instance in the background per §230) ride with #29's
  future-instance work. Notes on pending dates stay read as "no instance
  yet" — the panel is hidden in the pending state.
- **Deferred**: creating notes from the new-task dialog.

## Data model

New `task_notes` table:

```sql
CREATE TABLE task_notes (
    id         INTEGER PRIMARY KEY,
    task_id    INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    series_id  INTEGER REFERENCES task_series(id) ON DELETE CASCADE,
    body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((task_id IS NULL) <> (series_id IS NULL))
);
```

Exactly one parent — a note belongs to a task _or_ a series, never both.
Profile isolation is enforced through the parent row, never trusted from
the client: every command joins the parent and checks `profile_id`.

Validation mirrors §52: body is 1–10,000 chars after trim (a blank note
is rejected, not stored empty). Typed errors reuse `note_body_required` /
`note_body_too_long` / `note_not_found` `ErrorCode` variants.

## Backend API (`notes.rs`)

- `list_task_notes(profile, task_id) -> Vec<Note>`
- `list_series_notes(profile, series_id) -> Vec<Note>`
- `create_task_note(profile, task_id, body) -> Note`
- `create_series_note(profile, series_id, body) -> Note`
- `update_note(profile, note_id, body) -> Note`
- `delete_note(profile, note_id)`

Update/delete resolve the note's parent to check the profile. No
propagation rules per §268 — instance notes never touch the series and
vice versa; deleting a task/series cascades its notes.

## Frontend

- `NotesTabs` gains a real `NoteList` per panel: list of notes (body +
  relative audit), inline add composer, per-note edit/delete with
  confirm. For a non-series task a single untabbed `NoteList` renders.
- Notes live in the **details view**, not the edit form — notes are
  handled separately from other edits (§150) and stay available on
  view-only past instances.
- TanStack keys: `notes.task(id)` / `notes.series(id)`; mutations
  invalidate their own key only.
- All labels/limits in `src/lib/labels.ts`; empty/loading/error states
  get `role="alert"`/status semantics per the a11y rules.

## Testing

- Rust: CRUD round-trip, 1-char and 10,000-char boundaries, blank/oversize
  rejection, parent-profile isolation (foreign task/series/note), cascade
  on task and series delete, orphan-parent CHECK.
- Cucumber: add/edit/delete a note on a task; instance vs series notes are
  independent; notes on a foreign task rejected.
- Vitest: list render, add flow, edit flow, delete confirm, empty state,
  typed error surface; tabs switch panels.
- e2e: add/edit/delete through the stubbed transport for task, instance,
  and series targets; a11y spec covers the notes region.
