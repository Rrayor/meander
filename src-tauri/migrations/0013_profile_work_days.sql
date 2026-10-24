-- Work days per profile as a bitmask: bits 0-6 = Monday-Sunday.
-- Default 0b0011111 (31) = Monday-Friday (spec: work days default Mon-Fri).
ALTER TABLE profiles ADD COLUMN work_days INTEGER NOT NULL DEFAULT 31;
