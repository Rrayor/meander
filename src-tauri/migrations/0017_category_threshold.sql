-- Per-category per-day planning thresholds (spec §285): each category may
-- carry its own minutes limit + color; NULL means no threshold.
ALTER TABLE categories ADD COLUMN threshold_minutes INTEGER
    CHECK (threshold_minutes IS NULL OR (threshold_minutes >= 1 AND threshold_minutes <= 1440));
ALTER TABLE categories ADD COLUMN threshold_color TEXT;
