// TanStack Query cache keys — single registry so invalidations and
// consumers can't drift on stringly-typed keys.
export const QUERY_KEYS = {
  profiles: ["profiles"],
  currentProfile: ["current-profile"],
  weekStart: ["week-start"],
  workDays: ["work-days"],
  dbPath: ["db-path"],
  tasks: ["tasks"],
  // Prefix key: invalidating it refreshes the board whatever week it
  // shows — task mutations (status, edits, deletes) must reach it.
  boardWeeks: ["board-week"],
  boardWeek: (start: string) => ["board-week", start],
  categories: ["categories"],
  // Prefix key: invalidating it covers every task's association list, e.g.
  // after a category rename/recolor or delete changes what chips show.
  allTaskCategories: ["task-categories"],
  taskCategories: (taskId: number) => ["task-categories", taskId],
  taskSeries: ["task-series"],
  seriesInstances: (seriesId: number) => ["series-instances", seriesId],
  seriesCategories: (seriesId: number) => ["series-categories", seriesId],
  // Prefix key covering every per-series category query — invalidate this
  // when a category itself is renamed/deleted so series chips refetch.
  allSeriesCategories: ["series-categories"],
  taskNotes: (taskId: number) => ["task-notes", taskId],
  seriesNotes: (seriesId: number) => ["series-notes", seriesId],
} as const;
