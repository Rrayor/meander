import { cn } from "cn";

import type { Category, GlobalThreshold, Task } from "@/api/bindings";
import { TaskSort, TaskStatus } from "@/lib/enums";
import {
  STATUS_LABELS,
  WEEKLY_BACKLOG_LABEL,
  dayTotalsLabel,
  shortDateLabel,
  shortWeekdayLabel,
  taskCountLabel,
} from "@/lib/labels";
import { thresholdTintStyle } from "@/lib/utils";

import { BoardCard } from "./BoardCard";
import { DroppableCell } from "./DroppableCell";
import {
  STATUS_ROWS,
  cellId,
  columnKey,
  columnMembers,
  columnTasks,
  columnThresholds,
  taskTotals,
} from "./boardGrid";

import type { CSSProperties } from "react";
import type { ColumnTotals } from "./boardGrid";

interface ColumnHeaderProps {
  column: string | null;
  scope: "col" | "row";
  totals: ColumnTotals;
  style?: CSSProperties;
  className?: string;
}

/// One column's heading: weekday + date (or the weekly backlog bucket)
/// over its task count and estimate/spent totals. Doubles as the
/// columnheader in the status-rows layout and the rowheader in the
/// day-rows (transposed) layout — only `scope` and width differ.
function ColumnHeader({
  column,
  scope,
  totals,
  style,
  className,
}: Readonly<ColumnHeaderProps>) {
  return (
    <th
      scope={scope}
      style={style}
      className={cn(
        "rounded-md bg-surface-raised px-3 py-2 text-left align-top",
        className,
      )}
    >
      <p className="text-sm font-medium text-text">
        {column === null
          ? WEEKLY_BACKLOG_LABEL
          : `${shortWeekdayLabel(column)} ${shortDateLabel(column)}`}
      </p>
      <p className="mt-0.5 text-xs font-normal text-text-muted">
        {taskCountLabel(totals.count)} ·{" "}
        {dayTotalsLabel(totals.estimated, totals.spent)}
      </p>
    </th>
  );
}

interface WeekColumnsProps {
  /// Ordered columns — the weekly backlog bucket (`null`) plus the
  /// week's seven day ISOs, or the days only on past/future weeks.
  columns: (string | null)[];
  /// §368: day-rows swaps axes — statuses head columns, days head rows.
  transposed: boolean;
  tasks: Task[];
  query: string;
  sort: TaskSort;
  threshold: GlobalThreshold | undefined;
  taskCategories: ReadonlyMap<number, Category[]>;
  onOpenTask: (task: Task) => void;
}

// Spec §312–§316: 8 columns — the standing weekly backlog plus seven
// weekday columns anchored at the configured week start — and three
// status rows whose heights follow their contents. The table renders
// inside the page's DndContext; its cells are the drop targets.
export function WeekColumns({
  columns,
  transposed,
  tasks,
  query,
  sort,
  threshold,
  taskCategories,
  onOpenTask,
}: Readonly<WeekColumnsProps>) {
  const members = (column: string | null) => columnMembers(tasks, column);
  const { tintColors: columnTintColors, reachedCats } = columnThresholds(
    columns,
    members,
    threshold,
    taskCategories,
  );
  const tint = (column: string | null) =>
    thresholdTintStyle(columnTintColors.get(column) ?? []);

  const renderCell = (column: string | null, status: TaskStatus) => {
    const cell = columnTasks(tasks, column, query, sort).filter(
      (t) => t.status === status,
    );
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
                  onOpen={() => onOpenTask(task)}
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

  return (
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
            columns.map((column) => (
              <ColumnHeader
                key={columnKey(column)}
                column={column}
                scope="col"
                totals={taskTotals(members(column))}
                style={tint(column)}
                className="w-[12.5%]"
              />
            ))}
        </tr>
      </thead>
      <tbody>
        {transposed
          ? columns.map((column) => (
              <tr key={columnKey(column)}>
                <ColumnHeader
                  column={column}
                  scope="row"
                  totals={taskTotals(members(column))}
                  style={tint(column)}
                  className="w-48"
                />
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
  );
}

export type { WeekColumnsProps };
