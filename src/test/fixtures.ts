import type { Category } from "@/api/categories";

export const FIXTURE_TIMESTAMP = "2026-10-10 09:00:00";

export const categoryFixture = (
  overrides: Partial<Category> = {},
): Category => ({
  id: 1,
  profile_id: 1,
  title: "Errands",
  description: null,
  color: "#2dd4bf",
  threshold_minutes: null,
  threshold_color: null,
  threshold_day_minutes: {},
  created_at: FIXTURE_TIMESTAMP,
  updated_at: FIXTURE_TIMESTAMP,
  ...overrides,
});
