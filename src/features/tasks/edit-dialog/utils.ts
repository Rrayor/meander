import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { QUERY_KEYS } from "@/api/queryKeys";
import type { TaskSeries, UpdateSeries } from "@/api/bindings";
import { deleteTask } from "@/api/tasks";
import type { Task } from "@/api/tasks";
import { deleteTaskSeries, truncateTaskSeries } from "@/api/series";
import { DURATION_RANGE_MESSAGE, SPENT_RANGE_MESSAGE } from "@/lib/errors";
import {
  ESTIMATE_DURATION_FIELDS,
  SPENT_DURATION_FIELDS,
  durationHoursPart,
  durationMinutesPart,
  refineDurationRange,
  taskFieldSchemas,
} from "@/features/tasks/formSchema";
import { CarryOverRule, TaskScope, TaskStatus } from "@/lib/enums";
import type { SaveScope } from "@/lib/enums";

export const schema = z
  .object({
    ...taskFieldSchemas,
    spentHours: durationHoursPart,
    spentMinutes: durationMinutesPart,
    status: z.enum(TaskStatus),
  })
  .superRefine(({ estHours, estMinutes, spentHours, spentMinutes }, ctx) => {
    // The schema CHECK allows 1–1440 minutes for both duration fields.
    for (const [hours, minutes, fields, message] of [
      [estHours, estMinutes, ESTIMATE_DURATION_FIELDS, DURATION_RANGE_MESSAGE],
      [spentHours, spentMinutes, SPENT_DURATION_FIELDS, SPENT_RANGE_MESSAGE],
    ] as const) {
      refineDurationRange(hours, minutes, fields, message, ctx);
    }
  });

export type FormValues = z.infer<typeof schema>;

// Fields shared by every save scope — the only ones allowed to survive a
// scope switch.
export const SHARED_FORM_FIELDS: (keyof FormValues)[] = [
  "title",
  "description",
  "estHours",
  "estMinutes",
  "carryOver",
];

export const minutesToParts = (total: number | null) => ({
  hours: total == null ? "" : String(Math.floor(total / 60)),
  minutes: total == null ? "" : String(total % 60),
});

export function defaultsFor(t: Task): FormValues {
  const est = minutesToParts(t.estimated_minutes);
  const spt = minutesToParts(t.spent_minutes);
  return {
    title: t.title,
    description: t.description ?? "",
    estHours: est.hours,
    estMinutes: est.minutes,
    spentHours: spt.hours,
    spentMinutes: spt.minutes,
    status: t.status as TaskStatus,
    carryOver: (t.carry_over_rule ?? CarryOverRule.Ask) as CarryOverRule,
  };
}

export function seriesUpdatePayload(
  shared: {
    title: string;
    description: string | null;
    estimated_minutes: number | null;
    carry_over_rule: UpdateSeries["carry_over_rule"];
  },
  seriesDraft: {
    recurrence: UpdateSeries["recurrence"];
    start_date: string;
    end_date: string | null;
  } | null,
  seriesRow: TaskSeries,
  categoryIds: number[],
): UpdateSeries {
  const schedule = seriesDraft ?? {
    recurrence: seriesRow.recurrence,
    start_date: seriesRow.start_date,
    end_date: seriesRow.end_date,
  };
  return {
    ...shared,
    recurrence: schedule.recurrence,
    start_date: schedule.start_date,
    end_date: schedule.end_date,
    category_ids: categoryIds,
  };
}

// The delete scope picks the command: an instance (or a non-series task)
// drops its row, the series scope removes the whole chain, and the
// future scope truncates the series at the viewed date (spec §154).
export function deleteForScope({
  deleteScope,
  seriesId,
  taskId,
  scheduledDate,
  pendingIso,
}: {
  deleteScope: TaskScope;
  seriesId: number | null;
  taskId: number;
  scheduledDate: string | null;
  pendingIso: string | null;
}) {
  if (seriesId === null || deleteScope === TaskScope.Instance) {
    return deleteTask(taskId);
  }
  if (deleteScope === TaskScope.Series) {
    return deleteTaskSeries(seriesId);
  }
  return truncateTaskSeries(seriesId, (pendingIso ?? scheduledDate)!);
}

export function invalidateSeriesQueries(
  queryClient: QueryClient,
  viewedSeriesId: number | null,
  livingSeriesId: number | null | undefined,
) {
  for (const key of [
    QUERY_KEYS.tasks,
    QUERY_KEYS.boardWeeks,
    QUERY_KEYS.taskSeries,
    QUERY_KEYS.seriesInstances(viewedSeriesId!),
    QUERY_KEYS.seriesCategories(livingSeriesId!),
    QUERY_KEYS.allTaskCategories,
  ]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

// Only the future scope locks the schedule start — to the viewed date
// the split anchors on.
export const lockedStartFor = (scope: SaveScope, viewedDate: string | null) =>
  scope === TaskScope.Future ? (viewedDate ?? undefined) : undefined;
