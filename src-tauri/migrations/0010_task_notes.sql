-- Notes (spec: a note attaches to a task or to a series — never both —
-- and is limited to 10,000 characters). Instance notes point at the
-- tasks row for that instance; series notes point at task_series.
-- Deleting either parent cascades the notes.
CREATE TABLE task_notes (
    id INTEGER PRIMARY KEY,
    task_id INTEGER REFERENCES tasks (id) ON DELETE CASCADE,
    series_id INTEGER REFERENCES task_series (id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
-- updated_at stays NULL until the first edit, so the audit label
    -- distinguishes "created" from "edited" even within the same second.
    updated_at TEXT,
    CHECK ((task_id IS NULL) <> (series_id IS NULL))
);
CREATE INDEX idx_task_notes_task ON task_notes (task_id);
CREATE INDEX idx_task_notes_series ON task_notes (series_id);
