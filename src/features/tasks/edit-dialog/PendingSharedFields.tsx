import type { TaskSeries } from "@/api/bindings";
import { CarryOverRule, TaskStatus } from "@/lib/enums";
import {
  CARRY_OVER_FIELD_LABEL,
  CARRY_OVER_OPTIONS,
  DESCRIPTION_FIELD_LABEL,
  EMPTY_VALUE_LABEL,
  ESTIMATED_TIME_LABEL,
  SPENT_TIME_LABEL,
  STATUS_LABELS,
  TASK_STATUS_FIELD_LABEL,
  formatMinutes,
} from "@/lib/labels";

interface PendingSharedFieldsProps {
  segment: TaskSeries;
}

export function PendingSharedFields({
  segment,
}: Readonly<PendingSharedFieldsProps>) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium tracking-wider text-text-muted uppercase">
          {TASK_STATUS_FIELD_LABEL}
        </span>
        <span className="text-sm">{STATUS_LABELS[TaskStatus.Todo]}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium tracking-wider text-text-muted uppercase">
          {SPENT_TIME_LABEL}
        </span>
        <span className="text-sm">{EMPTY_VALUE_LABEL}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium tracking-wider text-text-muted uppercase">
          {DESCRIPTION_FIELD_LABEL}
        </span>
        <span className="text-sm">
          {segment.description || EMPTY_VALUE_LABEL}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium tracking-wider text-text-muted uppercase">
          {ESTIMATED_TIME_LABEL}
        </span>
        <span className="text-sm">
          {segment.estimated_minutes === null
            ? EMPTY_VALUE_LABEL
            : formatMinutes(segment.estimated_minutes)}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium tracking-wider text-text-muted uppercase">
          {CARRY_OVER_FIELD_LABEL}
        </span>
        <span className="text-sm">
          {
            CARRY_OVER_OPTIONS.find(
              (o) => o.value === (segment.carry_over_rule ?? CarryOverRule.Ask),
            )!.label
          }
        </span>
      </div>
    </div>
  );
}
