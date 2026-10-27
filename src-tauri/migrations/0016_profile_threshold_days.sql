-- Per-weekday overrides for the global planning threshold (spec §291):
-- { "monday": 480, "sunday": 720 } — absent days inherit the global value.
-- No json_valid CHECK: the service validates the map before writing, and a
-- constraint would reject the generic migration-test column probes.
ALTER TABLE profiles ADD COLUMN global_threshold_day_minutes TEXT;
