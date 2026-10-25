import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { listTaskCategories } from "@/api/categories";
import { weekStart } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import type { Task } from "@/api/bindings";
import { listWeekTasks } from "@/api/tasks";
import { EditTaskDialog } from "@/features/tasks/EditTaskDialog";
import { TaskCard } from "@/features/tasks/TaskCard";
import { TaskPlacement, TaskStatus, Weekday } from "@/lib/enums";
import {
  BOARD_HEADING,
  STATUS_LABELS,
  WEEKLY_BACKLOG_LABEL,
  boardWeekRangeLabel,
  dayTotalsLabel,
  editTaskLabel,
  shortDateLabel,
  shortWeekdayLabel,
  taskCountLabel,
} from "@/lib/labels";
import { errorMessage, todayLocalIso, weekDates } from "@/lib/utils";

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
}: Readonly<{ task: Task; onOpen: () => void }>) {
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
      <TaskCard task={task} categories={categories ?? []} />
    </button>
  );
}

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
  const days = weekDates(todayIso, start ?? Weekday.Monday);
  const { data: tasks, error: weekError } = useQuery({
    queryKey: QUERY_KEYS.boardWeek(days[0]),
    queryFn: () => listWeekTasks(todayIso),
  });
  const error = startError ?? weekError;

  // null column = the weekly backlog bucket.
  const columns: (string | null)[] = [null, ...days];
  const columnTasks = (column: string | null) =>
    (tasks ?? []).filter((t) =>
      column === null
        ? t.placement === TaskPlacement.WeeklyBacklog
        : t.scheduled_date === column,
    );
  const weekTotals = totals(tasks ?? []);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-6 py-3">
        <h1 className="text-2xl font-semibold tracking-tight text-text">
          {BOARD_HEADING}
        </h1>
        <p className="text-sm font-medium text-text">
          {boardWeekRangeLabel(days[0], days[6])}
        </p>
        <p className="text-sm text-text-muted">
          {taskCountLabel(weekTotals.count)} ·{" "}
          {dayTotalsLabel(weekTotals.estimated, weekTotals.spent)}
        </p>
      </header>
      {error && (
        <p role="alert" className="px-6 pt-4 text-sm text-danger">
          {errorMessage(error)}
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
                      className="rounded-md bg-surface/40 align-top"
                    >
                      {cell.length > 0 && (
                        <ul className="flex flex-col gap-2">
                          {cell.map((task) => (
                            <li key={task.id}>
                              <BoardCard
                                task={task}
                                onOpen={() => setEditingTask(task)}
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
      {editingTask && (
        <EditTaskDialog
          task={editingTask}
          onClose={() => setEditingTask(undefined)}
        />
      )}
    </>
  );
}
