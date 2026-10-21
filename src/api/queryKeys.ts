// TanStack Query cache keys — single registry so invalidations and
// consumers can't drift on stringly-typed keys.
export const QUERY_KEYS = {
  profiles: ["profiles"],
  currentProfile: ["current-profile"],
  dbPath: ["db-path"],
  tasks: ["tasks"],
  categories: ["categories"],
  // Prefix key: invalidating it covers every task's association list, e.g.
  // after a category rename/recolor or delete changes what chips show.
  allTaskCategories: ["task-categories"],
  taskCategories: (taskId: number) => ["task-categories", taskId],
  taskSeries: ["task-series"],
  seriesInstances: (seriesId: number) => ["series-instances", seriesId],
  seriesCategories: (seriesId: number) => ["series-categories", seriesId],
} as const;
