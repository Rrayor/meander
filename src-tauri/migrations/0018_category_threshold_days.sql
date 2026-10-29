-- Item 45: per-weekday overrides on a category's threshold (spec §285).
-- JSON map {"weekday": minutes}; NULL or {} means every day inherits the
-- category's own threshold_minutes. No CHECK: the generic migration test
-- probes every column with non-JSON text (see 0016).
ALTER TABLE categories ADD COLUMN threshold_day_minutes TEXT;
