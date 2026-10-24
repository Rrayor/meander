-- "This and future" edits split a series into segments: a clone of the
-- old schedule carries the pre-cutoff window, the living row keeps the
-- continuation. Each segment records the series it is succeeded by
-- (`succeeded_by`), so any number of splits form one chain.
ALTER TABLE task_series ADD COLUMN succeeded_by INTEGER REFERENCES task_series(id);
