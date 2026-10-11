// TanStack Query cache keys — single registry so invalidations and
// consumers can't drift on stringly-typed keys.
export const QUERY_KEYS = {
  profiles: ["profiles"],
  currentProfile: ["current-profile"],
  dbPath: ["db-path"],
} as const;
