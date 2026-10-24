-- "This and future" edits archive a series' past onto an internal clone
-- row. Archived series are history containers — they produce no backlog
-- entries and no new occurrences, but their instances stay viewable.
ALTER TABLE task_series ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
