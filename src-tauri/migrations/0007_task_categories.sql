-- Many-to-many between tasks and categories. Cascades keep associations
-- consistent when either side is deleted (spec: deleting a category removes
-- it from all associated tasks).
CREATE TABLE task_categories (
    task_id INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, category_id)
);
CREATE INDEX idx_task_categories_category ON task_categories (category_id);
