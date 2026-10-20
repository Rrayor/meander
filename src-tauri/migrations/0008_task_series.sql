-- Repeating tasks (spec: a repetition schedule on a task creates a task
-- series). A series holds the shared task fields plus the schedule; an
-- instance is an ordinary tasks row linked via series_id. Deleting a
-- series cascades to its instances (spec: deleting the series affects
-- all past and future instances). recurrence is serde-JSON text holding
-- the closed Recurrence enum; dates are ISO 'YYYY-MM-DD'.
CREATE TABLE task_series (
    id INTEGER PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES profiles (id),
    title TEXT NOT NULL,
    description TEXT,
    carry_over_rule TEXT NOT NULL DEFAULT 'return'
        CHECK (carry_over_rule IN ('carry', 'return')),
    estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
    recurrence TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    -- end_date >= start_date is enforced by the service layer (typed
    -- EndDateBeforeStart); a cross-column CHECK can't be satisfied by the
    -- generic migration probe.
);
CREATE INDEX idx_task_series_profile ON task_series (profile_id);

ALTER TABLE tasks ADD COLUMN series_id INTEGER
    REFERENCES task_series (id) ON DELETE CASCADE;
CREATE INDEX idx_tasks_series ON tasks (series_id);
