-- Categories can belong to a whole series (spec §203 counts associated
-- tasks and task series). A series save propagates the set to every
-- instance (spec §146: series edits overwrite instance-level picks).
CREATE TABLE series_categories (
    series_id INTEGER NOT NULL REFERENCES task_series (id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    PRIMARY KEY (series_id, category_id)
);
CREATE INDEX idx_series_categories_category ON series_categories (category_id);
