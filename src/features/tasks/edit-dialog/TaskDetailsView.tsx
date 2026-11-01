import { useState } from "react";
import type { ReactNode } from "react";

import type { Category } from "@/api/categories";
import type { Task } from "@/api/tasks";
import type { TaskSeries } from "@/api/bindings";
import {
  ButtonVariant,
  CarryOverRule,
  TaskPlacement,
  TaskStatus,
} from "@/lib/enums";
import {
  CARRY_OVER_FIELD_LABEL,
  CARRY_OVER_OPTIONS,
  CATEGORIES_FIELD_LABEL,
  CLOSE_LABEL,
  DATE_FIELD_LABEL,
  DELETE_BUTTON_LABEL,
  DESCRIPTION_FIELD_LABEL,
  EMPTY_VALUE_LABEL,
  ESTIMATED_TIME_LABEL,
  MOVE_TO_BACKLOG_LABEL,
  MOVE_TO_DATE_LABEL,
  NOTES_SECTION_LABEL,
  SPENT_TIME_LABEL,
  STATUS_LABELS,
  TASK_STATUS_FIELD_LABEL,
  auditTimestampsLabel,
  describeRecurrence,
  formatMinutes,
  seriesAuditLabel,
} from "@/lib/labels";
import { formatDate, formatIsoDay } from "@/lib/utils";
import { InstanceCalendar } from "@/features/tasks/InstanceCalendar";
import { NoteList } from "@/features/tasks/NoteList";
import { NotesTabs } from "@/features/tasks/NotesTabs";
import { Button } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/Input";
import { ERROR_TEXT } from "@/shared/ui/styles";

import { PendingOccurrence } from "./PendingOccurrence";

// A category with no stored color renders a fully muted chip here —
// unlike TaskCard, which falls back to DEFAULT_CATEGORY_COLOR, the
// details view leaves text and dot uncolored; this neutral tint only
// backs the pill so it still reads as a chip (deliberate since the
// view was introduced, not the spec'd accent default).
const UNCOLORED_CHIP_TINT = "#859490";

export interface TaskDetailsViewProps {
  viewed: Task;
  pendingIso: string | null;
  materializing: boolean;
  materializeError?: string;
  categories: Category[];
  seriesRow: TaskSeries | undefined;
  skippedDates?: string[];
  // The segment producing a pending picked date — its values, not the
  // living series', back the unpersisted-occurrence display.
  pendingSegment: TaskSeries | undefined;
  seriesSegments: TaskSeries[] | undefined;
  seriesInstances: Task[] | undefined;
  onPick: (picked: Task | null, iso: string) => void;
  onClose: () => void;
  onDelete: () => void;
  onMoveToBacklog: () => void;
  onSchedule: (date: string) => void;
  scheduleError?: string;
  moveError?: string;
  deletePrompt?: ReactNode;
}

export function TaskDetailsView({
  viewed,
  pendingIso,
  materializing,
  materializeError,
  categories,
  seriesRow,
  skippedDates,
  pendingSegment,
  seriesSegments,
  seriesInstances,
  onPick,
  onClose,
  onDelete,
  onMoveToBacklog,
  onSchedule,
  scheduleError,
  moveError,
  deletePrompt,
}: Readonly<TaskDetailsViewProps>) {
  const [pickedDate, setPickedDate] = useState(viewed.scheduled_date ?? "");
  let notesSection: ReactNode = null;
  if (pendingIso === null) {
    if (viewed.series_id !== null && seriesRow) {
      notesSection = <NotesTabs taskId={viewed.id} seriesId={seriesRow.id} />;
    } else if (viewed.series_id === null) {
      notesSection = (
        <section aria-label={NOTES_SECTION_LABEL}>
          <h3 className="mb-2 text-sm font-medium text-text">
            {NOTES_SECTION_LABEL}
          </h3>
          <NoteList key={viewed.id} target={{ taskId: viewed.id }} />
        </section>
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {pendingIso !== null ? (
        <PendingOccurrence
          segment={pendingSegment ?? seriesRow}
          materializing={materializing}
          materializeError={materializeError}
        />
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wider text-text-muted uppercase">
              {DESCRIPTION_FIELD_LABEL}
            </span>
            <p className="text-sm text-text">
              {viewed.description || EMPTY_VALUE_LABEL}
            </p>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium tracking-wider text-text-muted uppercase">
                {TASK_STATUS_FIELD_LABEL}
              </span>
              <span className="text-sm">
                {STATUS_LABELS[viewed.status as TaskStatus]}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium tracking-wider text-text-muted uppercase">
                {ESTIMATED_TIME_LABEL}
              </span>
              <span className="text-sm">
                {viewed.estimated_minutes === null
                  ? EMPTY_VALUE_LABEL
                  : formatMinutes(viewed.estimated_minutes)}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium tracking-wider text-text-muted uppercase">
                {SPENT_TIME_LABEL}
              </span>
              <span className="text-sm">
                {viewed.spent_minutes === null
                  ? EMPTY_VALUE_LABEL
                  : formatMinutes(viewed.spent_minutes)}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium tracking-wider text-text-muted uppercase">
                {CARRY_OVER_FIELD_LABEL}
              </span>
              <span className="text-sm">
                {CARRY_OVER_OPTIONS.find(
                  (o) =>
                    o.value === (viewed.carry_over_rule ?? CarryOverRule.Ask),
                )?.label ?? EMPTY_VALUE_LABEL}
              </span>
            </div>
          </div>
        </>
      )}
      {/* Categories are shared too: pending dates show the series' set,
          persisted instances their own. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium tracking-wider text-text-muted uppercase">
          {CATEGORIES_FIELD_LABEL}
        </span>
        {categories.length === 0 ? (
          <span className="text-sm">{EMPTY_VALUE_LABEL}</span>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {categories.map((category) => (
              <li
                key={category.id}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
                style={{
                  color: category.color ?? undefined,
                  backgroundColor: `${category.color ?? UNCOLORED_CHIP_TINT}26`,
                }}
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: category.color ?? undefined,
                  }}
                />
                {category.title}
              </li>
            ))}
          </ul>
        )}
      </div>
      {(pendingSegment ?? seriesRow) && (
        <p className="border-t border-border pt-4 text-sm text-text-muted">
          {seriesAuditLabel(
            describeRecurrence((pendingSegment ?? seriesRow)!.recurrence),
            formatIsoDay((pendingSegment ?? seriesRow)!.start_date),
            (pendingSegment ?? seriesRow)!.end_date === null
              ? null
              : formatIsoDay((pendingSegment ?? seriesRow)!.end_date!),
            formatDate((pendingSegment ?? seriesRow)!.created_at),
            formatDate((pendingSegment ?? seriesRow)!.updated_at),
          )}
        </p>
      )}
      {seriesRow && seriesInstances && seriesSegments && (
        <InstanceCalendar
          series={seriesSegments}
          instances={seriesInstances}
          skipped={skippedDates}
          selectedIso={pendingIso ?? viewed.scheduled_date}
          onPick={onPick}
        />
      )}
      {notesSection}
      {(moveError ?? scheduleError) && (
        <p role="alert" className={ERROR_TEXT}>
          {moveError ?? scheduleError}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={ButtonVariant.Ghost}
            onClick={onDelete}
            className="flex items-center gap-1.5 px-3 text-danger hover:bg-danger/10 hover:text-danger"
          >
            {DELETE_BUTTON_LABEL}
          </Button>
          {pendingIso === null &&
            viewed.placement !== TaskPlacement.Backlog && (
              <Button
                type="button"
                variant={ButtonVariant.Secondary}
                onClick={onMoveToBacklog}
                className="px-3"
              >
                {MOVE_TO_BACKLOG_LABEL}
              </Button>
            )}
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              aria-label={DATE_FIELD_LABEL}
              value={pickedDate}
              onChange={(e) => setPickedDate(e.target.value)}
              className="w-auto bg-surface px-2 py-1.5"
            />
            <Button
              type="button"
              variant={ButtonVariant.Secondary}
              onClick={() => onSchedule(pickedDate)}
              disabled={!pickedDate}
              className="px-3"
            >
              {MOVE_TO_DATE_LABEL}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-text-muted">
            {auditTimestampsLabel(
              formatDate(viewed.created_at),
              formatDate(viewed.updated_at),
            )}
          </p>
          <Button
            type="button"
            variant={ButtonVariant.Secondary}
            onClick={onClose}
          >
            {CLOSE_LABEL}
          </Button>
        </div>
      </div>
      {deletePrompt}
    </div>
  );
}
