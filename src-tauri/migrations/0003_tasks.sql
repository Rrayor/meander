CREATE TABLE tasks (
    id INTEGER PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES profiles (id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
    carry_over_rule TEXT CHECK (carry_over_rule IN ('carry', 'return')),
    estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
    spent_minutes INTEGER CHECK (spent_minutes IS NULL OR spent_minutes >= 0),
    placement TEXT NOT NULL DEFAULT 'backlog' CHECK (placement IN ('backlog', 'weekly_backlog', 'scheduled')),
    scheduled_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (placement != 'scheduled' OR scheduled_date IS NOT NULL),
    CHECK (placement != 'weekly_backlog' OR scheduled_date IS NULL)
);

CREATE INDEX idx_tasks_profile ON tasks (profile_id);
