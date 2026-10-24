-- "This and future" edits archive a series' past onto an internal clone
-- row. The clone records the series it continues as (`succeeded_by`),
-- which marks it as history: it produces no new occurrences and the
-- backlog shows only the family's anchor instance. Its rows stay
-- viewable through the per-series instance query.
ALTER TABLE task_series ADD COLUMN succeeded_by INTEGER REFERENCES task_series(id);
