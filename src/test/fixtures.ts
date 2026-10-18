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
  created_at: FIXTURE_TIMESTAMP,
  updated_at: FIXTURE_TIMESTAMP,
  ...overrides,
});
