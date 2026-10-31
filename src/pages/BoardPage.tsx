import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { listTaskCategories } from "@/api/categories";
import type { Category, Task } from "@/api/bindings";
import { globalThreshold, weekStart } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import { boardMove, listPendingCarryOver, listWeekTasks } from "@/api/tasks";
import { CarryOverPrompt } from "@/features/board/CarryOverPrompt";
import { WeekJumpCalendar } from "@/features/board/WeekJumpCalendar";
import { EditTaskDialog } from "@/features/tasks/EditTaskDialog";
import { NewTaskDialog } from "@/features/tasks/NewTaskDialog";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { TaskCard } from "@/features/tasks/TaskCard";
import { TaskPlacement, TaskSort, TaskStatus, Weekday } from "@/lib/enums";
import {
  BOARD_HEADING,
  ADD_TASK_LABEL,
  STATUS_LABELS,
  TRANSPOSE_LAYOUT_LABEL,
  BOARD_NEXT_WEEK_LABEL,
  BOARD_PREVIOUS_WEEK_LABEL,
  BOARD_SAVING_LABEL,
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
import { serverErrorMessage } from "@/lib/errors";
import { matchesSearch, sortTasks } from "@/features/viewFilters";
import { ViewToolbar } from "@/features/ViewToolbar";

const STATUS_ROWS = [
  TaskStatus.Todo,
  TaskStatus.InProgress,
  TaskStatus.Done,
] as const;

/// A cell's droppable id packs its column (iso date or the weekly
/// backlog bucket) and its status row — the drop decodes placement,
/// date and status from it in one gesture (spec §314/§328).
const WEEKLY_CELL = "weekly-backlog";
const BOARD_LAYOUT_KEY = "meander.boardLayout";

const cellId = (column: string | null, status: TaskStatus) =>
  `${column ?? WEEKLY_CELL}|${status}`;

function DroppableCell({
  id,
  style,
  children,
}: Readonly<{
  id: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}>) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <td
      ref={setNodeRef}
      style={style}
      className={`rounded-md align-top transition-colors ${
        isOver ? "bg-primary/20" : "bg-surface/40"
      }`}
    >
      {children}
    </td>
  );
}

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
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- dnd-kit supplies role=button/tabIndex/keyboard via spread attributes
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-label={editTaskLabel(task.title)}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      // §451: the card follows the pointer immediately — the backend
      // write must never gate the visual.
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        zIndex: isDragging ? 30 : undefined,
        cursor: "grab",
      }}
      className={isDragging ? "opacity-70" : undefined}
    >
      <TaskCard
        task={task}
        categories={categories ?? []}
        tintColors={tintColors}
      />
    </div>
  );
}

/// Spec §281/§285/§291: for every column, the colors of the thresholds
/// it reaches — the global one plus each category whose estimate
/// total meets its own effective limit (weekday override first, its
/// per-day minutes as fallback). Several reached thresholds blend
/// into a gradient; the weekly backlog column never tints.
const reachedCategoryColors = (
  column: string,
  tasks: Task[],
  taskCategories: Map<number, Category[]>,
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
  const tintColors = new Map<string | null, string[]>();
  const reachedCats = new Map<string | null, Map<number, string>>();
  for (const c of columns) {
    const cats =
      c === null
        ? new Map<number, string>()
        : reachedCategoryColors(c, columnTasks(c), taskCategories);
    const globalLimit =
      c === null
        ? null
        : (threshold?.day_minutes?.[weekdayNameOf(c)] ??
          threshold?.minutes ??
          null);
    const colors = [
      ...(threshold?.color != null &&
      globalLimit != null &&
      totals(columnTasks(c)).estimated >= globalLimit
        ? [threshold.color]
        : []),
      ...cats.values(),
    ];
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const todayIso = todayLocalIso();
  const { data: start, error: startError } = useQuery({
    queryKey: QUERY_KEYS.weekStart,
    queryFn: weekStart,
  });
  const [anchor, setAnchor] = useState(todayIso);
  const sensors = useSensors(
    // A small distance keeps plain clicks opening the dialog while a
    // real drag gesture takes over.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
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
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TaskSort>(TaskSort.Manual);
  // §368 — the transposed layout is a persisted view preference,
  // never the default.
  const [transposed, setTransposed] = useState(
    () => localStorage.getItem(BOARD_LAYOUT_KEY) === "day-rows",
  );
  const toggleLayout = () =>
    setTransposed((t) => {
      const next = !t;
      localStorage.setItem(BOARD_LAYOUT_KEY, next ? "day-rows" : "status-rows");
      return next;
    });
  // Search narrows and the pick reorders within the grid's bounds —
  // columns, rows and placement are never touched (spec §360/§366).
  const columnMembers = (column: string | null) =>
    (tasks ?? []).filter((t) =>
      column === null
        ? t.placement === TaskPlacement.WeeklyBacklog
        : t.scheduled_date === column,
    );
  // Thresholds and day totals always use the full membership — a
  // search must not hide workload that is still scheduled. Only the
  // rendered cards are narrowed and reordered (spec §360/§366).
  const columnTasks = (column: string | null) =>
    sortTasks(
      columnMembers(column).filter((t) => matchesSearch(t, query)),
      sort,
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

  const queryClient = useQueryClient();
  const move = useMutation({
    mutationFn: ({
      taskId,
      placement,
      date,
      status,
    }: {
      taskId: number;
      placement: TaskPlacement;
      date: string | null;
      status: TaskStatus;
    }) => boardMove(taskId, placement, date, status),
    onMutate: async ({ taskId, placement, date, status }) => {
      // §451: optimistic — the card relocates the moment it drops;
      // the query refetches to confirm.
      await queryClient.cancelQueries({
        queryKey: QUERY_KEYS.boardWeek(days[0]),
      });
      queryClient.setQueryData<Task[]>(QUERY_KEYS.boardWeek(days[0]), (old) =>
        (old ?? []).map((t) =>
          t.id === taskId
            ? {
                ...t,
                placement,
                scheduled_date: date,
                status,
              }
            : t,
        ),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.boardWeeks,
      });
    },
  });

  const renderCell = (column: string | null, status: TaskStatus) => {
    const cell = columnTasks(column).filter((t) => t.status === status);
    return (
      <DroppableCell
        key={cellId(column, status)}
        id={cellId(column, status)}
        style={tint(column)}
      >
        {cell.length > 0 && (
          <ul className="flex flex-col gap-2">
            {cell.map((task) => (
              <li key={task.id}>
                <BoardCard
                  task={task}
                  onOpen={() => setEditingTask(task)}
                  // §285: cards of a reached category carry that
                  // threshold's tint — the global tint stays on the
                  // column only.
                  tintColors={(taskCategories.get(task.id) ?? [])
                    .map((cat) => reachedCats.get(column)?.get(cat.id))
                    .filter((x): x is string => x != null)}
                />
              </li>
            ))}
          </ul>
        )}
      </DroppableCell>
    );
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const [col, status] = (over.id as string).split("|") as [
      string,
      TaskStatus,
    ];
    const task = tasks?.find((t) => t.id === active.id);
    if (!task) return;
    const placement =
      col === "weekly-backlog"
        ? TaskPlacement.WeeklyBacklog
        : TaskPlacement.Scheduled;
    const date = col === "weekly-backlog" ? null : col;
    if (
      task.placement === placement &&
      task.scheduled_date === date &&
      task.status === status
    ) {
      return;
    }
    move.mutate({ taskId: task.id, placement, date, status });
  };

  const { tintColors: columnTintColors, reachedCats } = columnThresholds(
    columns,
    columnMembers,
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
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="ml-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary transition-colors duration-150 ease-out hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {ADD_TASK_LABEL}
          </button>
        </div>
        <p className="text-sm text-text-muted">
          {taskCountLabel(weekTotals.count)} ·{" "}
          {dayTotalsLabel(weekTotals.estimated, weekTotals.spent)}
        </p>
      </header>
      {(boardError != null || move.isError) && (
        <p role="alert" className="px-6 pt-4 text-sm text-danger">
          {serverErrorMessage(boardError ?? move.error) ??
            errorMessage(boardError ?? move.error)}
        </p>
      )}
      {/* §451: drops move instantly — a status line announces the
          save in flight so a relocating card never looks silent. */}
      {move.isPending && (
        <output className="px-6 pt-4 text-sm text-text-muted">
          {BOARD_SAVING_LABEL}
        </output>
      )}
      <ViewToolbar
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
      />
      <button
        type="button"
        aria-label={TRANSPOSE_LAYOUT_LABEL}
        onClick={toggleLayout}
        className="mx-6 mt-3 w-fit rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:bg-surface-raised"
      >
        {TRANSPOSE_LAYOUT_LABEL}
      </button>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable regions need tabIndex=0 so keyboard users can scroll them (axe scrollable-region-focusable) */}
      <section tabIndex={0} className="flex-1 overflow-auto p-6">
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <table className="w-full min-w-[1200px] border-separate border-spacing-2">
            <thead>
              <tr>
                {/* Corner cell — keeps the day headers aligned with the
                  rowheader + 8 data cells of the body rows. */}
                <td className="w-12" />
                {transposed &&
                  STATUS_ROWS.map((status) => (
                    <th
                      key={status}
                      scope="col"
                      className="w-[33%] rounded-md bg-surface/40 px-3 py-2 text-left align-middle text-xs font-medium uppercase tracking-wide text-text-muted"
                    >
                      {STATUS_LABELS[status]}
                    </th>
                  ))}
                {!transposed &&
                  columns.map((column) => {
                    const day = totals(columnMembers(column));
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
              {transposed
                ? columns.map((column) => (
                    <tr key={column ?? "weekly-backlog"}>
                      <th
                        scope="row"
                        style={tint(column)}
                        className="w-48 rounded-md bg-surface-raised px-3 py-2 text-left align-top"
                      >
                        <p className="text-sm font-medium text-text">
                          {column === null
                            ? WEEKLY_BACKLOG_LABEL
                            : `${shortWeekdayLabel(column)} ${shortDateLabel(column)}`}
                        </p>
                        <p className="mt-0.5 text-xs font-normal text-text-muted">
                          {taskCountLabel(totals(columnMembers(column)).count)}{" "}
                          ·{" "}
                          {dayTotalsLabel(
                            totals(columnMembers(column)).estimated,
                            totals(columnMembers(column)).spent,
                          )}
                        </p>
                      </th>
                      {STATUS_ROWS.map((status) => renderCell(column, status))}
                    </tr>
                  ))
                : STATUS_ROWS.map((status) => (
                    <tr key={status}>
                      <th
                        scope="row"
                        className="w-12 rounded-md bg-surface/40 align-middle text-xs font-medium uppercase tracking-wide text-text-muted"
                      >
                        {STATUS_LABELS[status]}
                      </th>
                      {columns.map((column) => renderCell(column, status))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </DndContext>
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
      {dialogOpen && <NewTaskDialog onClose={() => setDialogOpen(false)} />}
    </>
  );
}
