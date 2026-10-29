import { useQueries, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { listTaskCategories } from "@/api/categories";
import type { Category } from "@/api/bindings";
import { globalThreshold, weekStart } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import type { Task } from "@/api/bindings";
import { listPendingCarryOver, listWeekTasks } from "@/api/tasks";
import { CarryOverPrompt } from "@/features/board/CarryOverPrompt";
import { WeekJumpCalendar } from "@/features/board/WeekJumpCalendar";
import { EditTaskDialog } from "@/features/tasks/EditTaskDialog";
import { TaskCard } from "@/features/tasks/TaskCard";
import { TaskPlacement, TaskStatus, Weekday } from "@/lib/enums";
import {
  BOARD_HEADING,
  STATUS_LABELS,
  BOARD_NEXT_WEEK_LABEL,
  BOARD_PREVIOUS_WEEK_LABEL,
  BOARD_THIS_WEEK_LABEL,
  WEEKLY_BACKLOG_LABEL,
  boardWeekRangeLabel,
  dayTotalsLabel,
  editTaskLabel,
  shortDateLabel,
  shortWeekdayLabel,
  taskCountLabel,
} from "@/lib/labels";
import {
  errorMessage,
  shiftDays,
  thresholdTintStyle,
  weekdayNameOf,
  todayLocalIso,
  weekDates,
} from "@/lib/utils";

const STATUS_ROWS = [
  TaskStatus.Todo,
  TaskStatus.InProgress,
  TaskStatus.Done,
] as const;

// A card queries its own category chips — same per-task association
// read the backlog row does.
function BoardCard({
  task,
  onOpen,
  tintColors,
}: Readonly<{ task: Task; onOpen: () => void; tintColors?: string[] }>) {
  const { data: categories } = useQuery({
    queryKey: QUERY_KEYS.taskCategories(task.id),
    queryFn: () => listTaskCategories(task.id),
  });
  return (
    <button
      type="button"
      aria-label={editTaskLabel(task.title)}
      onClick={onOpen}
      className="w-full cursor-pointer text-left"
    >
      <TaskCard
        task={task}
        categories={categories ?? []}
        tintColors={tintColors}
      />
    </button>
  );
}

/// Spec §281/§285/§291: for every column, the colors of the thresholds
/// it reaches — the global one (its weekday override or the minutes
/// fallback) plus each category whose estimate total meets its own
/// effective limit. Several reached thresholds blend into a gradient;
/// the weekly backlog column never tints. Also returns the reached
/// category id → color map so cards can carry their category's tint.
const columnThresholds = (
  columns: (string | null)[],
  columnTasks: (column: string | null) => Task[],
  threshold:
    | {
        minutes: number | null;
        color: string | null;
        day_minutes: Record<string, number>;
      }
    | undefined,
  taskCategories: Map<number, Category[]>,
): {
  tintColors: Map<string | null, string[]>;
  reachedCats: Map<string | null, Map<number, string>>;
} => {
  const tintColor = threshold?.color ?? null;
  const tintColors = new Map<string | null, string[]>();
  const reachedCats = new Map<string | null, Map<number, string>>();
  for (const c of columns) {
    const colors: string[] = [];
    const cats = new Map<number, string>();
    if (c !== null) {
      const limit =
        threshold?.day_minutes?.[weekdayNameOf(c)] ??
        threshold?.minutes ??
        null;
      if (
        tintColor !== null &&
        limit != null &&
        totals(columnTasks(c)).estimated >= limit
      ) {
        colors.push(tintColor);
      }
      const sums = new Map<
        number,
        { est: number; color: string; limit: number | null }
      >();
      for (const t of columnTasks(c)) {
        for (const cat of taskCategories.get(t.id) ?? []) {
          if (cat.threshold_color == null) continue;
          const cur = sums.get(cat.id) ?? {
            est: 0,
            color: cat.threshold_color,
            limit:
              cat.threshold_day_minutes?.[weekdayNameOf(c)] ??
              cat.threshold_minutes,
          };
          cur.est += t.estimated_minutes ?? 0;
          sums.set(cat.id, cur);
        }
      }
      for (const [id, s] of sums) {
        if (s.limit != null && s.est >= s.limit) {
          cats.set(id, s.color);
          colors.push(s.color);
        }
      }
    }
    tintColors.set(c, colors);
    reachedCats.set(c, cats);
  }
  return { tintColors, reachedCats };
};

const totals = (tasks: Task[]) => ({
  count: tasks.length,
  estimated: tasks.reduce((n, t) => n + (t.estimated_minutes ?? 0), 0),
  spent: tasks.reduce((n, t) => n + (t.spent_minutes ?? 0), 0),
});

// Spec §312–§316: 8 columns — the standing weekly backlog plus seven
// weekday columns anchored at the configured week start — and three
// state rows whose heights follow their contents. Only the current
// week renders for now; navigation and carry-over are later items.
export function BoardPage() {
  const [editingTask, setEditingTask] = useState<Task>();
  const todayIso = todayLocalIso();
  const { data: start, error: startError } = useQuery({
    queryKey: QUERY_KEYS.weekStart,
    queryFn: weekStart,
  });
  const [anchor, setAnchor] = useState(todayIso);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [promptDismissed, setPromptDismissed] = useState(false);
  const rangeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!jumpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setJumpOpen(false);
        // The focused cell unmounts with the popover — hand focus
        // back to the trigger instead of dropping it on <body>.
        rangeButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [jumpOpen]);
  const days = weekDates(anchor, start ?? Weekday.Monday);
  const { data: threshold, error: thresholdError } = useQuery({
    queryKey: QUERY_KEYS.globalThreshold,
    queryFn: globalThreshold,
  });
  const { data: tasks, error: weekError } = useQuery({
    queryKey: QUERY_KEYS.boardWeek(days[0]),
    queryFn: () => listWeekTasks(days[0]),
  });
  const error = startError ?? weekError ?? thresholdError;
  const isCurrentWeek =
    days[0] === weekDates(todayIso, start ?? Weekday.Monday)[0];

  // null column = the weekly backlog bucket, a standing container of
  // current state — rendered only on the current week's board
  // (spec §336/§348/§354), never on past or future weeks.
  // The carry-over prompt only ever opens on the current week's board.
  const { data: pending } = useQuery({
    queryKey: QUERY_KEYS.pendingCarryOver,
    queryFn: listPendingCarryOver,
    enabled: isCurrentWeek,
  });
  const columns: (string | null)[] = isCurrentWeek ? [null, ...days] : days;
  const columnTasks = (column: string | null) =>
    (tasks ?? []).filter((t) =>
      column === null
        ? t.placement === TaskPlacement.WeeklyBacklog
        : t.scheduled_date === column,
    );

  // Task→category associations ride the same query keys as the card
  // chips, so this dedupes against them rather than adding a new read.
  const categoryQueries = useQueries({
    queries: (tasks ?? []).map((t) => ({
      queryKey: QUERY_KEYS.taskCategories(t.id),
      queryFn: () => listTaskCategories(t.id),
    })),
  });
  const taskCategories = new Map(
    (tasks ?? []).map((t, i) => [t.id, categoryQueries[i]?.data ?? []]),
  );
  const categoryError = categoryQueries.find((q) => q.error)?.error;
  const boardError = error ?? categoryError ?? null;

  const { tintColors: columnTintColors, reachedCats } = columnThresholds(
    columns,
    columnTasks,
    threshold,
    taskCategories,
  );
  const tint = (column: string | null) =>
    thresholdTintStyle(columnTintColors.get(column) ?? []);

  const weekTotals = totals(tasks ?? []);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-6 py-3">
        <h1 className="text-2xl font-semibold tracking-tight text-text">
          {BOARD_HEADING}
        </h1>
        <div className="relative flex items-center gap-1">
          <button
            type="button"
            aria-label={BOARD_PREVIOUS_WEEK_LABEL}
            onClick={() => setAnchor(shiftDays(days[0], -7))}
            className="flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            ref={rangeButton}
            aria-expanded={jumpOpen}
            aria-haspopup="dialog"
            onClick={() => setJumpOpen((o) => !o)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setJumpOpen(false);
            }}
            className="rounded px-1 text-sm font-medium text-text transition-colors hover:bg-surface-raised"
          >
            {boardWeekRangeLabel(days[0], days[6])}
          </button>
          {jumpOpen && (
            <>
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                onClick={() => setJumpOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div className="absolute top-full z-20 mt-2 w-72">
                <WeekJumpCalendar
                  anchorIso={anchor}
                  weekStart={start ?? Weekday.Monday}
                  onPick={(iso) => {
                    setAnchor(iso);
                    setJumpOpen(false);
                  }}
                />
              </div>
            </>
          )}
          <button
            type="button"
            aria-label={BOARD_NEXT_WEEK_LABEL}
            onClick={() => setAnchor(shiftDays(days[0], 7))}
            className="flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            onClick={() => setAnchor(todayIso)}
            disabled={isCurrentWeek}
            className="rounded px-space-md py-1 text-sm font-medium text-text transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
          >
            {BOARD_THIS_WEEK_LABEL}
          </button>
        </div>
        <p className="text-sm text-text-muted">
          {taskCountLabel(weekTotals.count)} ·{" "}
          {dayTotalsLabel(weekTotals.estimated, weekTotals.spent)}
        </p>
      </header>
      {error && (
        <p role="alert" className="px-6 pt-4 text-sm text-danger">
          {errorMessage(boardError)}
        </p>
      )}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable regions need tabIndex=0 so keyboard users can scroll them (axe scrollable-region-focusable) */}
      <section tabIndex={0} className="flex-1 overflow-auto p-6">
        <table className="w-full min-w-[1200px] border-separate border-spacing-2">
          <thead>
            <tr>
              {/* Corner cell — keeps the day headers aligned with the
                  rowheader + 8 data cells of the body rows. */}
              <td className="w-12" />
              {columns.map((column) => {
                const day = totals(columnTasks(column));
                return (
                  <th
                    key={column ?? "weekly-backlog"}
                    scope="col"
                    style={tint(column)}
                    className="w-[12.5%] rounded-md bg-surface-raised px-3 py-2 text-left align-top"
                  >
                    <p className="text-sm font-medium text-text">
                      {column === null
                        ? WEEKLY_BACKLOG_LABEL
                        : `${shortWeekdayLabel(column)} ${shortDateLabel(column)}`}
                    </p>
                    <p className="mt-0.5 text-xs font-normal text-text-muted">
                      {taskCountLabel(day.count)} ·{" "}
                      {dayTotalsLabel(day.estimated, day.spent)}
                    </p>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {STATUS_ROWS.map((status) => (
              <tr key={status}>
                <th
                  scope="row"
                  className="w-12 rounded-md bg-surface/40 align-middle text-xs font-medium uppercase tracking-wide text-text-muted"
                >
                  {STATUS_LABELS[status]}
                </th>
                {columns.map((column) => {
                  const cell = columnTasks(column).filter(
                    (t) => t.status === status,
                  );
                  return (
                    <td
                      key={column ?? "weekly-backlog"}
                      style={tint(column)}
                      className="rounded-md bg-surface/40 align-top"
                    >
                      {cell.length > 0 && (
                        <ul className="flex flex-col gap-2">
                          {cell.map((task) => (
                            <li key={task.id}>
                              <BoardCard
                                task={task}
                                onOpen={() => setEditingTask(task)}
                                // §285: cards of a reached category carry
                                // that threshold's tint — the global tint
                                // stays on the column only.
                                tintColors={(taskCategories.get(task.id) ?? [])
                                  .map((cat) =>
                                    reachedCats.get(column)?.get(cat.id),
                                  )
                                  .filter((x): x is string => x != null)}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {isCurrentWeek && !promptDismissed && (pending?.length ?? 0) > 0 && (
        <CarryOverPrompt
          tasks={pending ?? []}
          onDone={() => setPromptDismissed(true)}
        />
      )}
      {editingTask && (
        <EditTaskDialog
          task={editingTask}
          onClose={() => setEditingTask(undefined)}
        />
      )}
    </>
  );
}
