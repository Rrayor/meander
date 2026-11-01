import type { Category, GlobalThreshold, Task } from "@/api/bindings";
import { TaskPlacement, TaskSort, TaskStatus } from "@/lib/enums";
import { weekdayNameOf } from "@/lib/utils";

import { matchesSearch, sortTasks } from "./viewFilters";

// Spec §312–§316: the board's three state rows, in render order.
export const STATUS_ROWS = [
  TaskStatus.Todo,
  TaskStatus.InProgress,
  TaskStatus.Done,
] as const;

/// A cell's droppable id packs its column (iso date or the weekly
/// backlog bucket) and its status row — the drop decodes placement,
/// date and status from it in one gesture (spec §314/§328).
const WEEKLY_CELL = "weekly-backlog";

export const cellId = (column: string | null, status: TaskStatus) =>
  `${column ?? WEEKLY_CELL}|${status}`;

export const columnKey = (column: string | null) => column ?? WEEKLY_CELL;

export const decodeCellId = (id: string) => {
  const [column, status] = id.split("|") as [string, TaskStatus];
  const date = column === WEEKLY_CELL ? null : column;
  return {
    date,
    status,
    placement:
      date === null ? TaskPlacement.WeeklyBacklog : TaskPlacement.Scheduled,
  } as const;
};

/// Column membership is the full scheduled set — thresholds and day
/// totals always read it, never the search-narrowed view (spec
/// §360/§366). `null` is the weekly backlog bucket.
export const columnMembers = (tasks: Task[], column: string | null) =>
  tasks.filter((t) =>
    column === null
      ? t.placement === TaskPlacement.WeeklyBacklog
      : t.scheduled_date === column,
  );

/// The rendered cards are the view-time transforms: search narrows and
/// the sort pick reorders within the cell's bounds — placement and
/// stored order are untouched (spec §360/§366).
export const columnTasks = (
  tasks: Task[],
  column: string | null,
  query: string,
  sort: TaskSort,
) =>
  sortTasks(
    columnMembers(tasks, column).filter((t) => matchesSearch(t, query)),
    sort,
  );

export interface ColumnTotals {
  count: number;
  estimated: number;
  spent: number;
}

export const taskTotals = (tasks: Task[]): ColumnTotals => ({
  count: tasks.length,
  estimated: tasks.reduce((n, t) => n + (t.estimated_minutes ?? 0), 0),
  spent: tasks.reduce((n, t) => n + (t.spent_minutes ?? 0), 0),
});

/// Spec §281/§285/§291: for a column, the colors of the category
/// thresholds its estimate total reaches — each category's effective
/// limit is its weekday override first, its per-day minutes as
/// fallback. Several reached thresholds blend into a gradient.
const reachedCategoryColors = (
  column: string,
  tasks: Task[],
  taskCategories: ReadonlyMap<number, Category[]>,
): Map<number, string> => {
  const sums = new Map<
    number,
    { est: number; color: string; limit: number | null }
  >();
  for (const t of tasks) {
    for (const cat of taskCategories.get(t.id) ?? []) {
      if (cat.threshold_color == null) continue;
      const cur = sums.get(cat.id) ?? {
        est: 0,
        color: cat.threshold_color,
        limit:
          cat.threshold_day_minutes?.[weekdayNameOf(column)] ??
          cat.threshold_minutes,
      };
      cur.est += t.estimated_minutes ?? 0;
      sums.set(cat.id, cur);
    }
  }
  return new Map(
    [...sums.entries()]
      .filter(([, s]) => s.limit != null && s.est >= s.limit)
      .map(([id, s]) => [id, s.color]),
  );
};

/// Per-column tint computation over full membership: the global
/// threshold color when the day's estimate total meets its effective
/// limit, plus every reached category threshold color — the weekly
/// backlog column never tints. `reachedCats` feeds the per-card tint
/// (§285: a reached category's card carries its tint, not the whole
/// column).
export const columnThresholds = (
  columns: (string | null)[],
  members: (column: string | null) => Task[],
  threshold: GlobalThreshold | undefined,
  taskCategories: ReadonlyMap<number, Category[]>,
): {
  tintColors: Map<string | null, string[]>;
  reachedCats: Map<string | null, Map<number, string>>;
} => {
  const tintColors = new Map<string | null, string[]>();
  const reachedCats = new Map<string | null, Map<number, string>>();
  for (const c of columns) {
    const cats =
      c === null
        ? new Map<number, string>()
        : reachedCategoryColors(c, members(c), taskCategories);
    const globalLimit =
      c === null
        ? null
        : (threshold?.day_minutes?.[weekdayNameOf(c)] ??
          threshold?.minutes ??
          null);
    const colors = [
      ...(threshold?.color != null &&
      globalLimit != null &&
      taskTotals(members(c)).estimated >= globalLimit
        ? [threshold.color]
        : []),
      ...cats.values(),
    ];
    tintColors.set(c, colors);
    reachedCats.set(c, cats);
  }
  return { tintColors, reachedCats };
};
