-- Spec §295/§297: a global per-day estimated-time threshold with a
-- user-settable color (default red). NULL means unset — no tint.
ALTER TABLE profiles ADD COLUMN global_threshold_minutes INTEGER
    CHECK (global_threshold_minutes BETWEEN 1 AND 1440);
ALTER TABLE profiles ADD COLUMN global_threshold_color TEXT;
