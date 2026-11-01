-- Placement is pool membership only (backlog | weekly_backlog): the
-- scheduled date is the fact, not a third placement. Rows become
-- weekly_backlog + their date; backlog rows are always undated.
CREATE TABLE tasks_new (
    id INTEGER PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES profiles (id),
    title TEXT NOT NULL,
    description TEXT CHECK (description IS NULL OR length(description) <= 20000),
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
    carry_over_rule TEXT CHECK (carry_over_rule IN ('carry', 'return')),
    estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes BETWEEN 1 AND 1440),
    spent_minutes INTEGER CHECK (spent_minutes IS NULL OR spent_minutes BETWEEN 1 AND 1440),
    placement TEXT NOT NULL DEFAULT 'backlog' CHECK (placement IN ('backlog', 'weekly_backlog')),
    scheduled_date TEXT,
    series_id INTEGER REFERENCES task_series (id) ON DELETE CASCADE,
    sort_order REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO tasks_new (id, profile_id, title, description, status,
    carry_over_rule, estimated_minutes, spent_minutes, placement,
    scheduled_date, series_id, sort_order, created_at, updated_at)
SELECT id, profile_id, title, description, status, carry_over_rule,
    estimated_minutes, spent_minutes,
    -- Any dated row is a board entity — including backlog rows carrying
    -- stray dates that older writes could leave behind.
    -- allow-rewrite: tasks.placement
    CASE WHEN scheduled_date IS NOT NULL OR placement = 'scheduled'
         THEN 'weekly_backlog' ELSE placement END,
    scheduled_date, series_id, sort_order, created_at, updated_at
FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX idx_tasks_profile ON tasks (profile_id);
CREATE INDEX idx_tasks_series ON tasks (series_id);
