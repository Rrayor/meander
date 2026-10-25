-- Deleting one instance removes only its row, but the series still
-- schedules that date — the board's materialization would recreate it.
-- A tombstone makes individual-instance deletion stick (spec §152) while
-- a deliberate calendar pick can still re-create the instance.
CREATE TABLE skipped_instances (
    series_id INTEGER NOT NULL REFERENCES task_series(id) ON DELETE CASCADE,
    scheduled_date TEXT NOT NULL,
    PRIMARY KEY (series_id, scheduled_date)
);
