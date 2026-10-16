-- Spec: a category has a required title, optional description and color,
-- and audit timestamps. Colors default at creation time (later milestone).
CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES profiles (id),
    title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 100),
    description TEXT,
    color TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_categories_profile ON categories (profile_id);
