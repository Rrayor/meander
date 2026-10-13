-- Spec: an estimate is optional, but when present it is a positive value and
-- at most 24 hours; a description is optional and at most 20,000 characters.
-- CHECK constraints can't be altered in SQLite, so rebuild the table.
CREATE TABLE tasks_new (
    id INTEGER PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES profiles (id),
    title TEXT NOT NULL,
    description TEXT CHECK (description IS NULL OR length(description) <= 20000),
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
    carry_over_rule TEXT CHECK (carry_over_rule IN ('carry', 'return')),
    estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes BETWEEN 1 AND 1440),
    spent_minutes INTEGER CHECK (spent_minutes IS NULL OR spent_minutes BETWEEN 1 AND 1440),
    placement TEXT NOT NULL DEFAULT 'backlog' CHECK (placement IN ('backlog', 'weekly_backlog', 'scheduled')),
    scheduled_date TEXT,
    sort_order REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (placement != 'scheduled' OR scheduled_date IS NOT NULL),
    CHECK (placement != 'weekly_backlog' OR scheduled_date IS NULL)
);
INSERT INTO tasks_new (id, profile_id, title, description, status,
    carry_over_rule, estimated_minutes, spent_minutes, placement,
    scheduled_date, sort_order, created_at, updated_at)
SELECT id, profile_id, title, description, status, carry_over_rule,
    estimated_minutes, spent_minutes, placement, scheduled_date, sort_order,
    created_at, updated_at
FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX idx_tasks_profile ON tasks (profile_id);
