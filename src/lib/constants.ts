// Domain-neutral primitives shared across features — import these
// rather than reaching into another feature's API module.

/// The selectable color palette for categories and threshold tints.
export const CATEGORY_COLORS = [
  "#f87171",
  "#fb923c",
  "#fbbf24",
  "#a3e635",
  "#4ade80",
  "#34d399",
  "#22d3ee",
  "#60a5fa",
  "#818cf8",
  "#a78bfa",
  "#e879f9",
  "#f472b6",
] as const;

/// Duration bound shared with the backend's CHECK (1–1440 minutes).
export const MAX_DURATION_MINUTES = 24 * 60;

/// List page size (spec §205/§224) — usePagination slices by this.
export const PAGE_SIZE = 50;

/// The seeded profile's name — mirrors `DEFAULT_PROFILE_NAME` in
/// `src-tauri/src/db/seed.rs`.
export const DEFAULT_PROFILE_NAME = "Default";
