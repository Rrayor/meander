-- Week-start preference: which weekday begins the week in calendar
-- displays and (later) board views. Stored as the weekday index with
-- Monday = 0, matching `weekday_index` and the Weekday enum order.
-- Interval-week scheduling deliberately does NOT use this — interval
-- blocks anchor at each series' own start date.
ALTER TABLE profiles ADD COLUMN week_start INTEGER NOT NULL DEFAULT 0;
