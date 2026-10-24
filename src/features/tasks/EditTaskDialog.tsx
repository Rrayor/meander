import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Controller, useForm } from "react-hook-form";
import type {
  FieldNamesMarkedBoolean,
  UseFormGetValues,
  UseFormRegister,
  UseFormReset,
  UseFormReturn,
} from "react-hook-form";
import { z } from "zod";

import {
  addTaskCategory,
  listTaskCategories,
  removeTaskCategory,
} from "@/api/categories";
import type { Category } from "@/api/categories";
import { QUERY_KEYS } from "@/api/queryKeys";
import {
  MAX_DURATION_MINUTES,
  MAX_TASK_DESCRIPTION_LENGTH,
  MAX_TASK_TITLE_LENGTH,
  deleteTask,
  updateTask,
} from "@/api/tasks";
import type { Task } from "@/api/tasks";
import {
  DURATION_RANGE_MESSAGE,
  SPENT_RANGE_MESSAGE,
  TASK_DESCRIPTION_TOO_LONG_MESSAGE,
  TASK_TITLE_INVALID_CHARACTERS_MESSAGE,
  TASK_TITLE_TOO_LONG_MESSAGE,
  serverErrorMessage,
} from "@/lib/errors";
import { CategoryMultiSelect } from "@/features/categories/CategoryMultiSelect";
import { InstanceCalendar } from "@/features/tasks/InstanceCalendar";
import { NoteList } from "@/features/tasks/NoteList";
import { NotesTabs } from "@/features/tasks/NotesTabs";
import { RepeatScheduleFields } from "@/features/tasks/RepeatScheduleFields";
import type { NewSeries, TaskSeries, UpdateSeries } from "@/api/bindings";
import {
  CarryOverRule,
  DialogMode,
  TaskScope,
  TaskStatus,
  carryOverToWire,
} from "@/lib/enums";
import type { SaveScope } from "@/lib/enums";
import {
  deleteTaskSeries,
  getOrCreateInstance,
  listSeriesCategories,
  listSeriesInstances,
  listTaskSeries,
  truncateTaskSeries,
  updateTaskSeries,
  updateTaskSeriesFrom,
} from "@/api/series";
import {
  NOTES_SECTION_LABEL,
  CANCEL_BUTTON_LABEL,
  DELETE_BUTTON_LABEL,
  DELETE_KEEP_LABEL,
  DELETE_SCOPE_FUTURE_LABEL,
  DELETE_TASK_HEADING,
  DELETE_UNDO_WARNING,
  CARRY_OVER_FIELD_LABEL,
  CATEGORIES_FIELD_LABEL,
  CARRY_OVER_OPTIONS,
  CLOSE_DIALOG_LABEL,
  CLOSE_LABEL,
  DESCRIPTION_FIELD_LABEL,
  EDIT_BUTTON_LABEL,
  EDIT_TASK_HEADING,
  EMPTY_VALUE_LABEL,
  ESTIMATED_HOURS_LABEL,
  ESTIMATED_MINUTES_LABEL,
  ESTIMATED_TIME_LABEL,
  INSTANCE_MATERIALIZING_MESSAGE,
  HOURS_UNIT_LABEL,
  MINUTES_UNIT_LABEL,
  OPTIONAL_FIELD_LABEL,
  SAVE_BUTTON_LABEL,
  SCHEDULED_INSTANCE_PENDING_MESSAGE,
  SPENT_HOURS_LABEL,
  SPENT_MINUTES_LABEL,
  SPENT_TIME_LABEL,
  STATUS_LABELS,
  TASK_STATUS_FIELD_LABEL,
  TITLE_FIELD_LABEL,
  TASK_SCOPE_FUTURE_LABEL,
  TASK_SCOPE_GROUP_LABEL,
  TASK_SCOPE_INSTANCE_LABEL,
  TASK_SCOPE_SERIES_LABEL,
  TITLE_REQUIRED_MESSAGE,
  auditTimestampsLabel,
  describeRecurrence,
  formatMinutes,
  seriesAuditLabel,
} from "@/lib/labels";
import { isScheduledOn } from "@/lib/recurrence";
import {
  codePointsWithin,
  formatDate,
  formatIsoDay,
  todayLocalIso,
  unicodeTrim,
} from "@/lib/utils";

const optionalDurationPart = (unit: string) =>
  z.string().regex(/^\d*$/, `${unit} must be a positive whole number`);

const schema = z
  .object({
    title: z
      .string()
      .transform(unicodeTrim)
      .pipe(
        z
          .string()
          .min(1, TITLE_REQUIRED_MESSAGE)
          .refine((s) => codePointsWithin(s, MAX_TASK_TITLE_LENGTH), {
            message: TASK_TITLE_TOO_LONG_MESSAGE,
          })
          .refine((s) => !/\p{Cc}/u.test(s), {
            message: TASK_TITLE_INVALID_CHARACTERS_MESSAGE,
          }),
      ),
    description: z
      .string()
      .refine((s) => codePointsWithin(s, MAX_TASK_DESCRIPTION_LENGTH), {
        message: TASK_DESCRIPTION_TOO_LONG_MESSAGE,
      }),
    estHours: optionalDurationPart("Hours"),
    estMinutes: optionalDurationPart("Minutes"),
    spentHours: optionalDurationPart("Hours"),
    spentMinutes: optionalDurationPart("Minutes"),
    status: z.enum(TaskStatus),
    carryOver: z.enum(CarryOverRule),
  })
  .superRefine(({ estHours, estMinutes, spentHours, spentMinutes }, ctx) => {
    // The schema CHECK allows 1–1440 minutes for both duration fields.
    for (const [hours, minutes, fields, message] of [
      [
        estHours,
        estMinutes,
        ["estHours", "estMinutes"],
        DURATION_RANGE_MESSAGE,
      ],
      [
        spentHours,
        spentMinutes,
        ["spentHours", "spentMinutes"],
        SPENT_RANGE_MESSAGE,
      ],
    ] as const) {
      if (hours.trim() === "" && minutes.trim() === "") {
        continue;
      }
      const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
      if (total < 1 || total > MAX_DURATION_MINUTES) {
        for (const field of fields) {
          ctx.addIssue({ code: "custom", path: [field], message });
        }
      }
    }
  });

type FormValues = z.infer<typeof schema>;

const minutesToParts = (total: number | null) => ({
  hours: total == null ? "" : String(Math.floor(total / 60)),
  minutes: total == null ? "" : String(total % 60),
});

interface TaskDetailsViewProps {
  viewed: Task;
  pendingIso: string | null;
  materializing: boolean;
  materializeError?: string;
  categories: Category[];
  seriesRow: TaskSeries | undefined;
  // The segment producing a pending picked date — its values, not the
  // living series', back the unpersisted-occurrence display.
  pendingSegment: TaskSeries | undefined;
  seriesSegments: TaskSeries[] | undefined;
  seriesInstances: Task[] | undefined;
  onPick: (picked: Task | null, iso: string) => void;
  onClose: () => void;
  onDelete: () => void;
  deletePrompt?: ReactNode;
}

function DeleteConfirmPanel({
  isSeries,
  pendingIso,
  scheduledDate,
  deleteScope,
  error,
  deleting,
  onScopeChange,
  onCancel,
  onConfirm,
}: Readonly<{
  isSeries: boolean;
  pendingIso: string | null;
  scheduledDate: string | null;
  deleteScope: TaskScope;
  error: string | null | undefined;
  deleting: boolean;
  onScopeChange: (scope: TaskScope) => void;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-surface-raised/60 p-4">
      <h3 className="text-sm font-semibold text-danger">
        {DELETE_TASK_HEADING}
      </h3>
      {isSeries && (
        <fieldset className="flex flex-col gap-2">
          {[
            {
              value: TaskScope.Instance,
              label: TASK_SCOPE_INSTANCE_LABEL,
              shown: pendingIso === null,
            },
            {
              value: TaskScope.Series,
              label: TASK_SCOPE_SERIES_LABEL,
              shown: true,
            },
            {
              value: TaskScope.Future,
              label: DELETE_SCOPE_FUTURE_LABEL,
              shown: (pendingIso ?? scheduledDate) !== null,
            },
          ]
            .filter(({ shown }) => shown)
            .map(({ value, label }) => (
              <label
                key={value}
                className="flex items-center gap-2 text-sm text-text"
              >
                <input
                  type="radio"
                  name="task-delete-scope"
                  value={value}
                  checked={deleteScope === value}
                  onChange={() => onScopeChange(value)}
                  className="accent-danger"
                />
                {label}
              </label>
            ))}
        </fieldset>
      )}
      <p className="text-xs text-text-muted">{DELETE_UNDO_WARNING}</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-4 py-1.5 text-sm text-text transition-colors hover:bg-surface-raised"
        >
          {DELETE_KEEP_LABEL}
        </button>
        <button
          type="button"
          disabled={
            deleting ||
            (isSeries &&
              deleteScope === TaskScope.Instance &&
              pendingIso !== null)
          }
          onClick={onConfirm}
          className="rounded-md bg-danger px-4 py-1.5 text-sm font-medium text-on-primary transition-colors hover:brightness-110 disabled:opacity-50"
        >
          {DELETE_BUTTON_LABEL}
        </button>
      </div>
    </div>
  );
}

function PendingOccurrence({
  segment,
  materializing,
  materializeError,
}: Readonly<{
  segment: TaskSeries | undefined;
  materializing: boolean;
  materializeError: string | undefined;
}>) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-text-muted italic">
          {materializing
            ? INSTANCE_MATERIALIZING_MESSAGE
            : SCHEDULED_INSTANCE_PENDING_MESSAGE}
        </p>
        {materializeError && (
          <p role="alert" className="text-sm text-danger">
            {materializeError}
          </p>
        )}
      </div>
      {segment && <PendingSharedFields segment={segment} />}
    </>
  );
}

function PendingSharedFields({ segment }: Readonly<{ segment: TaskSeries }>) {
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

function TaskDetailsView({
  viewed,
  pendingIso,
  materializing,
  materializeError,
  categories,
  seriesRow,
  pendingSegment,
  seriesSegments,
  seriesInstances,
  onPick,
  onClose,
  onDelete,
  deletePrompt,
}: Readonly<TaskDetailsViewProps>) {
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
                  backgroundColor: `${category.color ?? "#859490"}26`,
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
          selectedIso={pendingIso ?? viewed.scheduled_date}
          onPick={onPick}
        />
      )}
      {notesSection}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
        >
          {DELETE_BUTTON_LABEL}
        </button>
        <div className="flex items-center gap-2">
          <p className="text-xs text-text-muted">
            {auditTimestampsLabel(
              formatDate(viewed.created_at),
              formatDate(viewed.updated_at),
            )}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-raised"
          >
            {CLOSE_LABEL}
          </button>
        </div>
      </div>
      {deletePrompt}
    </div>
  );
}

interface EditTaskDialogProps {
  task: Task;
  onClose: () => void;
}

// Entering series scope reseeds the shared fields from the series — the
// form defaults hold the opened instance's values, which may be custom
// edits (spec §146: series scope edits the shared fields, not one
// instance's overrides). Leaving restores the instance's own values so a
// scope round-trip can't overwrite them. The ref guards against reseeding
// on a later refetch, which would clobber typed edits — and the shared
// controls stay disabled until the row arrives (seriesFieldsPending in
// the component) so nothing is typed before the seed lands.
// Fields shared by every save scope — the only ones allowed to survive a
// scope switch.
const SHARED_FORM_FIELDS: (keyof FormValues)[] = [
  "title",
  "description",
  "estHours",
  "estMinutes",
  "carryOver",
];

function defaultsFor(t: Task): FormValues {
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

// The segment that produces a pending picked date — a pre-cutoff date
// belongs to an earlier segment and shows its values, not the living
// series' — plus that segment's categories.
function usePendingSegment(
  familySegments: TaskSeries[] | undefined,
  pendingIso: string | null,
) {
  const pendingSegment =
    pendingIso !== null
      ? familySegments?.find((s) =>
          isScheduledOn(s.recurrence, s.start_date, s.end_date, pendingIso),
        )
      : undefined;
  const { data: pendingCats } = useQuery({
    queryKey: QUERY_KEYS.seriesCategories(pendingSegment?.id ?? -1),
    queryFn: () => listSeriesCategories(pendingSegment!.id),
    enabled: pendingSegment !== undefined,
  });
  return { pendingSegment, pendingCats };
}

function seriesUpdatePayload(
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

function toMinutes(hours: string, minutes: string) {
  return hours.trim() === "" && minutes.trim() === ""
    ? null
    : (Number(hours) || 0) * 60 + (Number(minutes) || 0);
}

// The delete scope picks the command: an instance (or a non-series task)
// drops its row, the series scope removes the whole chain, and the
// future scope truncates the series at the viewed date (spec §154).
function deleteForScope({
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

function invalidateSeriesQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  viewedSeriesId: number | null,
  livingSeriesId: number | null | undefined,
) {
  for (const key of [
    QUERY_KEYS.tasks,
    QUERY_KEYS.taskSeries,
    QUERY_KEYS.seriesInstances(viewedSeriesId!),
    QUERY_KEYS.seriesCategories(livingSeriesId!),
    QUERY_KEYS.allTaskCategories,
  ]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

function useMaterializeInstance({
  queryClient,
  viewedSeriesId,
  editAfterMaterializeRef,
  onMaterialized,
  startEditing,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
  viewedSeriesId: number | null;
  editAfterMaterializeRef: RefObject<boolean>;
  onMaterialized: (created: Task) => void;
  startEditing: (created: Task) => void;
}) {
  return useMutation({
    mutationFn: ({ iso, seriesId }: { iso: string; seriesId: number }) =>
      getOrCreateInstance(seriesId, iso),
    onSuccess: (created) => {
      onMaterialized(created);
      if (editAfterMaterializeRef.current) {
        editAfterMaterializeRef.current = false;
        startEditing(created);
      }
    },
    onError: () => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.seriesInstances(viewedSeriesId!),
      });
    },
  });
}

function useSeriesScopeSeed({
  saveScope,
  seriesRow,
  reset,
  getValues,
  dirtyFields,
  instanceDefaults,
}: {
  saveScope: SaveScope;
  seriesRow: TaskSeries | undefined;
  reset: UseFormReset<FormValues>;
  getValues: UseFormGetValues<FormValues>;
  dirtyFields: FieldNamesMarkedBoolean<FormValues>;
  instanceDefaults: FormValues;
}) {
  const seeded = useRef(false);
  useEffect(() => {
    // Values the user already typed survive a scope switch in either
    // direction — only untouched fields take the target scope's stored
    // values (series row for Series/Future, viewed row for Instance).
    // Per-instance fields (status, spent) are not shared and never
    // carry over — an invalid draft there must not follow into a series
    // save and block it.
    const values = getValues();
    const overlay: Partial<FormValues> = {};
    for (const key of SHARED_FORM_FIELDS) {
      if (dirtyFields[key] === true) {
        Object.assign(overlay, { [key]: values[key] });
      }
    }
    if (saveScope === TaskScope.Instance) {
      if (!seeded.current) return;
      seeded.current = false;
      reset({ ...instanceDefaults, ...overlay });
      return;
    }
    if (seeded.current || seriesRow === undefined) return;
    seeded.current = true;
    const seriesEstimate = minutesToParts(seriesRow.estimated_minutes);
    reset({
      ...instanceDefaults,
      title: seriesRow.title,
      description: seriesRow.description ?? "",
      estHours: seriesEstimate.hours,
      estMinutes: seriesEstimate.minutes,
      carryOver: (seriesRow.carry_over_rule ??
        CarryOverRule.Ask) as CarryOverRule,
      ...overlay,
    });
  }, [saveScope, seriesRow, reset, getValues, dirtyFields, instanceDefaults]);
}

// The selection is derived state: stored associations minus the chips the
// user removed plus the ones they added. Deriving it (rather than seeding
// state once) keeps picks intact when the query resolves late *and* lets
// a refetch update what chips show — e.g. after a category is recolored.
// Local category overrides belong to the viewed scope — keying the draft
// by scope+id means switching instances or scopes never carries a
// previous selection across.
function useScopedCategories({
  saveScope,
  seriesId,
  viewedId,
  seriesCats,
  initialCategories,
}: {
  saveScope: SaveScope;
  seriesId: number | null;
  viewedId: number;
  seriesCats: Category[] | undefined;
  initialCategories: Category[] | undefined;
}) {
  const categoryKey =
    saveScope !== TaskScope.Instance
      ? `series-${seriesId}`
      : `task-${viewedId}`;
  const [categoryDraft, setCategoryDraft] = useState<{
    key: string;
    removedIds: ReadonlySet<number>;
    picked: Category[];
  }>({ key: categoryKey, removedIds: new Set(), picked: [] });
  const removedIds =
    categoryDraft.key === categoryKey
      ? categoryDraft.removedIds
      : new Set<number>();
  const picked = categoryDraft.key === categoryKey ? categoryDraft.picked : [];
  const stored =
    saveScope !== TaskScope.Instance
      ? (seriesCats ?? [])
      : (initialCategories ?? []);
  const storedIds = new Set(stored.map((c) => c.id));
  const categories = [
    ...stored.filter((c) => !removedIds.has(c.id)),
    ...picked.filter((c) => !storedIds.has(c.id)),
  ];
  const onCategoriesChange = (next: Category[]) => {
    const nextIds = new Set(next.map((c) => c.id));
    setCategoryDraft({
      key: categoryKey,
      removedIds: new Set(
        stored.filter((c) => !nextIds.has(c.id)).map((c) => c.id),
      ),
      picked: next.filter((c) => !storedIds.has(c.id)),
    });
  };
  return { categories, stored, onCategoriesChange };
}

// Only the future scope locks the schedule start — to the viewed date
// the split anchors on.
const lockedStartFor = (scope: SaveScope, viewedDate: string | null) =>
  scope === TaskScope.Future ? (viewedDate ?? undefined) : undefined;

const SAVE_SCOPE_OPTIONS: { value: TaskScope; label: string }[] = [
  { value: TaskScope.Instance, label: TASK_SCOPE_INSTANCE_LABEL },
  { value: TaskScope.Series, label: TASK_SCOPE_SERIES_LABEL },
  { value: TaskScope.Future, label: TASK_SCOPE_FUTURE_LABEL },
];

// The "apply changes to" radios. The future scope needs a viewed date to
// anchor the split on, so it's muted and disabled without one.
function SaveScopeFieldset({
  saveScope,
  futureDisabled,
  onChange,
}: Readonly<{
  saveScope: SaveScope;
  futureDisabled: boolean;
  onChange: (scope: SaveScope) => void;
}>) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-xs font-medium tracking-wider text-text-muted uppercase">
        {TASK_SCOPE_GROUP_LABEL}
      </legend>
      {SAVE_SCOPE_OPTIONS.map(({ value, label }) => {
        const disabled = value === TaskScope.Future && futureDisabled;
        return (
          <div key={value} className="flex items-center gap-2">
            <label
              className={`flex items-center gap-2 text-sm ${
                disabled ? "text-text-muted" : "text-text"
              }`}
            >
              <input
                type="radio"
                name="task-save-scope"
                value={value}
                checked={saveScope === value}
                disabled={disabled}
                onChange={() => onChange(value)}
                className="accent-primary"
              />
              {label}
            </label>
          </div>
        );
      })}
    </fieldset>
  );
}

function EditTaskForm({
  form,
  task,
  viewedDate,
  categories,
  saveScope,
  seriesRow,
  seriesError,
  serverError,
  seriesFieldsPending,
  seriesSaveBlocked,
  submitting,
  onScopeChange,
  onAttachSchedule,
  onDraftSchedule,
  onCategoriesChange,
  onSubmit,
  onClose,
}: Readonly<{
  form: UseFormReturn<FormValues>;
  task: Task;
  viewedDate: string | null;
  categories: Category[];
  saveScope: SaveScope;
  seriesRow: TaskSeries | undefined;
  seriesError: string | null;
  serverError: string | null | undefined;
  seriesFieldsPending: boolean;
  seriesSaveBlocked: boolean;
  submitting: boolean;
  onScopeChange: (scope: SaveScope) => void;
  onAttachSchedule: (next: NewSeries | null, error: string | null) => void;
  onDraftSchedule: (next: NewSeries | null, error: string | null) => void;
  onCategoriesChange: (next: Category[]) => void;
  onSubmit: (values: FormValues) => void;
  onClose: () => void;
}>) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = form;
  const estimateError = errors.estHours?.message ?? errors.estMinutes?.message;
  const spentError = errors.spentHours?.message ?? errors.spentMinutes?.message;
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="edit-task-title-input"
          className="text-xs font-medium text-text-muted"
        >
          {TITLE_FIELD_LABEL} *
        </label>
        <input
          id="edit-task-title-input"
          type="text"
          disabled={seriesFieldsPending}
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? "edit-task-title-error" : undefined}
          className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none ring-primary placeholder:text-text-muted focus:border-primary focus:ring-1"
          {...register("title")}
        />
        {errors.title && (
          <p
            id="edit-task-title-error"
            role="alert"
            className="text-sm text-danger"
          >
            {errors.title.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="edit-task-description"
          className="text-xs font-medium text-text-muted"
        >
          {DESCRIPTION_FIELD_LABEL}{" "}
          <span className="text-text-muted">{OPTIONAL_FIELD_LABEL}</span>
        </label>
        <textarea
          id="edit-task-description"
          rows={3}
          disabled={seriesFieldsPending}
          aria-invalid={!!errors.description}
          aria-describedby={
            errors.description ? "edit-task-description-error" : undefined
          }
          className="w-full resize-none rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
          {...register("description")}
        />
        {errors.description && (
          <p
            id="edit-task-description-error"
            role="alert"
            className="text-sm text-danger"
          >
            {errors.description.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-text-muted">
          {CATEGORIES_FIELD_LABEL}{" "}
          <span className="text-text-muted">{OPTIONAL_FIELD_LABEL}</span>
        </span>
        <CategoryMultiSelect
          idPrefix="edit-task"
          selected={categories}
          onChange={onCategoriesChange}
          disabled={seriesFieldsPending}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-text-muted">
            {ESTIMATED_TIME_LABEL}{" "}
            <span className="text-text-muted">{OPTIONAL_FIELD_LABEL}</span>
          </span>
          <DurationField
            register={register}
            idPrefix="edit-task-est"
            hoursLabel={ESTIMATED_HOURS_LABEL}
            minutesLabel={ESTIMATED_MINUTES_LABEL}
            hoursField="estHours"
            minutesField="estMinutes"
            errorId="edit-task-estimate-error"
            invalid={!!estimateError}
            disabled={seriesFieldsPending}
          />
          {estimateError && (
            <p
              id="edit-task-estimate-error"
              role="alert"
              className="text-sm text-danger"
            >
              {estimateError}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-text-muted">
            {SPENT_TIME_LABEL}{" "}
            <span className="text-text-muted">{OPTIONAL_FIELD_LABEL}</span>
          </span>
          <DurationField
            register={register}
            idPrefix="edit-task-spent"
            hoursLabel={SPENT_HOURS_LABEL}
            minutesLabel={SPENT_MINUTES_LABEL}
            hoursField="spentHours"
            minutesField="spentMinutes"
            errorId="edit-task-spent-error"
            invalid={!!spentError}
            disabled={saveScope !== TaskScope.Instance}
          />
          {spentError && (
            <p
              id="edit-task-spent-error"
              role="alert"
              className="text-sm text-danger"
            >
              {spentError}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span
          id="edit-task-status-label"
          className="text-xs font-medium text-text-muted"
        >
          {TASK_STATUS_FIELD_LABEL}
        </span>
        <Controller
          name="status"
          control={control}
          render={({ field: { value, onChange } }) => (
            // Status and spent time stay per-instance — the series
            // row doesn't carry them, so a series save can't apply
            // them and the controls are disabled.
            <div
              role="radiogroup"
              aria-labelledby="edit-task-status-label"
              className={`flex gap-1 rounded-lg border border-border bg-surface-raised p-1 ${
                saveScope !== TaskScope.Instance ? "opacity-50" : ""
              }`}
            >
              {Object.values(TaskStatus).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={value === option}
                  disabled={saveScope !== TaskScope.Instance}
                  onClick={() => onChange(option)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors ${
                    value === option
                      ? "bg-primary text-on-primary"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  {STATUS_LABELS[option]}
                </button>
              ))}
            </div>
          )}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span
          id="edit-task-carry-over-label"
          className="text-xs font-medium text-text-muted"
        >
          {CARRY_OVER_FIELD_LABEL}
        </span>
        <Controller
          name="carryOver"
          control={control}
          render={({ field: { value, onChange } }) => (
            <div
              role="radiogroup"
              aria-labelledby="edit-task-carry-over-label"
              className="flex gap-1 rounded-lg border border-border bg-surface-raised p-1"
            >
              {CARRY_OVER_OPTIONS.map(({ value: option, label }) => (
                <button
                  key={option || "ask"}
                  type="button"
                  role="radio"
                  aria-checked={value === option}
                  disabled={seriesFieldsPending}
                  onClick={() => onChange(option)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors ${
                    value === option
                      ? "bg-primary text-on-primary"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        />
      </div>
      {task.series_id !== null && (
        <SaveScopeFieldset
          saveScope={saveScope}
          futureDisabled={viewedDate === null}
          onChange={onScopeChange}
        />
      )}
      {task.series_id === null && (
        <RepeatScheduleFields
          idPrefix="edit-task"
          onChange={(next, error) => {
            onAttachSchedule(next, error);
          }}
        />
      )}
      {task.series_id !== null &&
        saveScope !== TaskScope.Instance &&
        seriesRow !== undefined && (
          <RepeatScheduleFields
            // Remount per scope and anchor so switching scopes
            // reseeds and a different viewed date re-locks the
            // start at its cutoff.
            key={`${saveScope}-${viewedDate}`}
            idPrefix="edit-series"
            initial={{
              recurrence: seriesRow.recurrence,
              start_date: seriesRow.start_date,
              end_date: seriesRow.end_date,
            }}
            lockedStartDate={lockedStartFor(saveScope, viewedDate)}
            onChange={(next, error) => {
              onDraftSchedule(next, error);
            }}
          />
        )}
      {serverError && (
        <p role="alert" className="text-sm text-danger">
          {serverError}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-text-muted">
          {auditTimestampsLabel(
            formatDate(task.created_at),
            formatDate(task.updated_at),
          )}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
          >
            {CANCEL_BUTTON_LABEL}
          </button>
          <button
            type="submit"
            disabled={submitting || seriesError !== null || seriesSaveBlocked}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-all hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          >
            {SAVE_BUTTON_LABEL}
          </button>
        </div>
      </div>
    </form>
  );
}

function DurationField({
  idPrefix,
  hoursLabel,
  minutesLabel,
  hoursField,
  minutesField,
  errorId,
  invalid,
  disabled = false,
  register,
}: Readonly<{
  idPrefix: string;
  hoursLabel: string;
  minutesLabel: string;
  hoursField: "estHours" | "spentHours";
  minutesField: "estMinutes" | "spentMinutes";
  errorId: string;
  invalid: boolean;
  disabled?: boolean;
  register: UseFormRegister<FormValues>;
}>) {
  return (
    <div className={`flex items-center gap-4 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2">
        <input
          id={`${idPrefix}-hours`}
          aria-label={hoursLabel}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          type="number"
          placeholder="0"
          disabled={disabled}
          className="w-20 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
          {...register(hoursField)}
        />
        <label
          htmlFor={`${idPrefix}-hours`}
          className="text-xs text-text-muted"
        >
          {HOURS_UNIT_LABEL}
        </label>
      </div>
      <div className="flex items-center gap-2">
        <input
          id={`${idPrefix}-minutes`}
          aria-label={minutesLabel}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          type="number"
          placeholder="0"
          disabled={disabled}
          className="w-20 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
          {...register(minutesField)}
        />
        <label
          htmlFor={`${idPrefix}-minutes`}
          className="text-xs text-text-muted"
        >
          {MINUTES_UNIT_LABEL}
        </label>
      </div>
    </div>
  );
}

export function EditTaskDialog({
  task,
  onClose,
}: Readonly<EditTaskDialogProps>) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<DialogMode>(DialogMode.View);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Which instance the read-only view is showing — the opened task until
  // the calendar picks a different date. `pendingIso` marks a picked
  // scheduled date whose instance is still being materialized (or whose
  // creation failed); while set, the fields give way to the status panel.
  const [viewed, setViewed] = useState<Task>(task);
  const [pendingIso, setPendingIso] = useState<string | null>(null);
  // Set when the Edit click should start edit mode once the pending
  // instance materializes.
  const editAfterMaterialize = useRef(false);

  const instanceDefaults = useMemo(() => defaultsFor(viewed), [viewed]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: instanceDefaults,
  });
  const {
    setFocus,
    reset,
    getValues,
    formState: { dirtyFields },
  } = form;

  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (mode === DialogMode.Edit) {
      setFocus("title");
    } else {
      // Read-only mode has no field to focus — move focus onto the dialog
      // itself so keyboard users aren't stranded behind it.
      dialogRef.current?.focus();
    }
  }, [mode, setFocus]);

  const { data: initialCategories } = useQuery({
    queryKey: QUERY_KEYS.taskCategories(viewed.id),
    queryFn: () => listTaskCategories(viewed.id),
  });
  const { data: taskSeries } = useQuery({
    queryKey: QUERY_KEYS.taskSeries,
    queryFn: listTaskSeries,
    enabled: task.series_id !== null,
  });
  const viewedSeries = taskSeries?.find((s) => s.id === viewed.series_id);
  // The living continuation of a segmented series: saves, seeds, and
  // materialization always target it, never an earlier segment.
  const livingSeriesId =
    viewedSeries?.succeeded_by ?? viewed.series_id ?? task.series_id;
  const seriesRow = taskSeries?.find((s) => s.id === livingSeriesId);
  // Every segment of the conceptual series — the living row plus the
  // earlier segments — so the calendar shows the full schedule.
  const familySegments = taskSeries?.filter(
    (s) =>
      livingSeriesId !== null &&
      (s.id === livingSeriesId || s.succeeded_by === livingSeriesId),
  );
  const { pendingSegment, pendingCats } = usePendingSegment(
    familySegments,
    pendingIso,
  );
  const viewTitle =
    pendingIso !== null
      ? ((pendingSegment ?? seriesRow)?.title ?? viewed.title)
      : viewed.title;
  const { data: seriesInstances } = useQuery({
    queryKey: QUERY_KEYS.seriesInstances(viewed.series_id!),
    queryFn: () => listSeriesInstances(viewed.series_id!),
    enabled: viewed.series_id !== null,
  });
  // Save scope: instance edits today's task; series writes the shared
  // fields + schedule + categories onto the series and every instance.
  const [saveScope, setSaveScope] = useState<SaveScope>(TaskScope.Instance);
  const { data: seriesCats, error: seriesCatsError } = useQuery({
    queryKey: QUERY_KEYS.seriesCategories(livingSeriesId!),
    queryFn: () => listSeriesCategories(livingSeriesId!),
    // Also fetched in view mode: a pending (unpersisted) occurrence
    // displays the living series' categories.
    enabled: livingSeriesId !== null,
  });
  // The series-scope schedule draft: null = untouched (use the stored
  // schedule), cleared = the user collapsed the section (a series needs a
  // schedule — saving is disabled until one exists again).
  const [seriesDraft, setSeriesDraft] = useState<NewSeries | null>(null);
  const [seriesCleared, setSeriesCleared] = useState(false);
  const [seriesDraftError, setSeriesDraftError] = useState<string | null>(null);
  useSeriesScopeSeed({
    saveScope,
    seriesRow,
    reset,
    getValues,
    dirtyFields,
    instanceDefaults,
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteScope, setDeleteScope] = useState<TaskScope>(TaskScope.Instance);
  const [series, setSeries] = useState<NewSeries | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const { categories, stored, onCategoriesChange } = useScopedCategories({
    saveScope,
    seriesId: livingSeriesId,
    viewedId: viewed.id,
    seriesCats,
    initialCategories,
  });

  const update = useMutation({
    mutationFn: async (input: Parameters<typeof updateTask>[1]) => {
      await updateTask(viewed.id, input);
      const next = new Set(categories.map((c) => c.id));
      const prev = new Set(stored.map((c) => c.id));
      await Promise.all([
        ...categories
          .filter((c) => !prev.has(c.id))
          .map((c) => addTaskCategory(viewed.id, c.id)),
        ...stored
          .filter((c) => !next.has(c.id))
          .map((c) => removeTaskCategory(viewed.id, c.id)),
      ]);
    },
    onSuccess: onClose,
    onSettled: () => {
      // Also on failure: update_task may have committed before a category
      // association rejected, so the list must reflect what was saved.
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.taskCategories(viewed.id),
      });
    },
  });

  const invalidateSeriesScope = () =>
    invalidateSeriesQueries(queryClient, viewed.series_id, livingSeriesId);

  // Picking a scheduled-but-unpersisted date materializes its instance in
  // the background (spec: the instance exists once the user wants to edit
  // it). The pick stays pending until the row arrives, then the view swaps
  // to it — on failure the date keeps the pending panel plus the error.
  const materialize = useMaterializeInstance({
    queryClient,
    viewedSeriesId: viewed.series_id,
    editAfterMaterializeRef: editAfterMaterialize,
    onMaterialized: (created) => {
      setViewed(created);
      setPendingIso(null);
      invalidateSeriesScope();
    },
    startEditing: (created) => {
      reset(defaultsFor(created));
      setMode(DialogMode.Edit);
    },
  });

  const updateSeries = useMutation({
    mutationFn: (input: UpdateSeries) =>
      updateTaskSeries(livingSeriesId!, input),
    onSuccess: onClose,
    onSettled: invalidateSeriesScope,
  });

  const updateSeriesFrom = useMutation({
    mutationFn: ({
      fromDate,
      input,
    }: {
      fromDate: string;
      input: UpdateSeries;
    }) => updateTaskSeriesFrom(livingSeriesId!, fromDate, input),
    onSuccess: onClose,
    onSettled: invalidateSeriesScope,
  });

  // Delete runs against the *viewed* instance — picking another persisted
  // date in the calendar moves the target with it.
  const remove = useMutation({
    mutationFn: () =>
      deleteForScope({
        deleteScope,
        seriesId: livingSeriesId,
        taskId: viewed.id,
        scheduledDate: viewed.scheduled_date,
        pendingIso,
      }),
    onSuccess: onClose,
    onSettled: invalidateSeriesScope,
  });

  const onSubmit = (values: FormValues) => {
    const shared = {
      title: values.title,
      description: unicodeTrim(values.description) || null,
      estimated_minutes: toMinutes(values.estHours, values.estMinutes),
      carry_over_rule: carryOverToWire(values.carryOver),
    };
    if (saveScope !== TaskScope.Instance) {
      const payload = seriesUpdatePayload(
        shared,
        seriesDraft,
        seriesRow!,
        categories.map((c) => c.id),
      );
      // "This and future" splits the series at the viewed date; the
      // backend anchors the new series on fromDate (spec §146).
      if (saveScope === TaskScope.Future) {
        updateSeriesFrom.mutate({
          fromDate: viewed.scheduled_date!,
          input: payload,
        });
      } else {
        updateSeries.mutate(payload);
      }
      return;
    }
    update.mutate({
      ...shared,
      spent_minutes: toMinutes(values.spentHours, values.spentMinutes),
      status: values.status,
      series,
    });
  };

  // The category error only belongs to series scope — a failed load
  // shouldn't linger on the instance form after switching back.
  const serverError = serverErrorMessage(
    update.error ??
      updateSeries.error ??
      updateSeriesFrom.error ??
      (saveScope !== TaskScope.Instance ? seriesCatsError : null),
  );
  // While the series row is loading, the shared fields still hold the
  // opened instance's values — editing them before the seed lands would
  // lose the input to the reset. They stay disabled until it arrives.
  const seriesFieldsPending =
    saveScope !== TaskScope.Instance && seriesRow === undefined;
  // A series save needs a schedule: the stored one (untouched draft) or a
  // valid edited one — collapsing the section disables saving. It also
  // waits for the series category query: submitting before it resolves
  // would send an empty set and erase every instance's associations, and
  // a failed load is surfaced instead of treated as "no categories".
  const seriesSaveBlocked =
    saveScope !== TaskScope.Instance &&
    (seriesRow === undefined ||
      seriesCats === undefined ||
      seriesCleared ||
      seriesDraftError !== null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={CLOSE_DIALOG_LABEL}
        onClick={onClose}
        tabIndex={-1}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60"
      />
      <dialog
        ref={dialogRef}
        open
        tabIndex={-1}
        aria-labelledby="edit-task-title"
        className="relative m-0 flex max-h-[90vh] w-full max-w-lg flex-col gap-6 overflow-y-auto rounded-lg border border-border bg-surface p-6 text-text shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2
            id="edit-task-title"
            className="font-title text-lg font-semibold text-text"
          >
            {mode === DialogMode.View ? viewTitle : EDIT_TASK_HEADING}
          </h2>
          <div className="flex items-center gap-1">
            {mode === DialogMode.View && pendingIso !== null && (
              <button
                type="button"
                onClick={() => {
                  // Edit intent on a scheduled-only date is what
                  // materializes the instance (spec §231) — a past
                  // date materializes for notes only, staying in
                  // view mode.
                  editAfterMaterialize.current = pendingIso >= todayLocalIso();
                  // The producing segment owns the row — a pre-cutoff
                  // date belongs to an earlier segment, not the living
                  // series.
                  materialize.mutate({
                    iso: pendingIso,
                    seriesId: pendingSegment?.id ?? livingSeriesId!,
                  });
                }}
                aria-label={EDIT_BUTTON_LABEL}
                className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            )}
            {mode === DialogMode.View &&
              pendingIso === null &&
              // Past instances stay viewable but read-only (spec §232);
              // a task without a scheduled date is always editable.
              (viewed.scheduled_date === null ||
                viewed.scheduled_date >= todayLocalIso()) && (
                <button
                  type="button"
                  onClick={() => {
                    // Seed the form from the viewed instance — it may not
                    // be the task the dialog opened on.
                    reset(instanceDefaults);
                    setMode(DialogMode.Edit);
                  }}
                  aria-label={EDIT_BUTTON_LABEL}
                  className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              )}
            <button
              type="button"
              onClick={onClose}
              aria-label={CLOSE_LABEL}
              className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {mode === DialogMode.View ? (
          <TaskDetailsView
            viewed={viewed}
            pendingIso={pendingIso}
            materializing={materialize.isPending}
            materializeError={serverErrorMessage(materialize.error)}
            categories={pendingIso !== null ? (pendingCats ?? []) : categories}
            seriesRow={seriesRow}
            pendingSegment={pendingSegment}
            seriesSegments={familySegments}
            seriesInstances={seriesInstances}
            onPick={(picked, iso) => {
              if (picked) {
                setViewed(picked);
                setPendingIso(null);
              } else {
                // Viewing alone must not write: materialize only on an
                // explicit edit of the scheduled-only date (spec §231).
                setPendingIso(iso);
              }
            }}
            onClose={onClose}
            onDelete={() => {
              setDeleteScope(TaskScope.Instance);
              setConfirmingDelete(true);
            }}
            deletePrompt={
              confirmingDelete ? (
                <DeleteConfirmPanel
                  isSeries={task.series_id !== null}
                  pendingIso={pendingIso}
                  scheduledDate={viewed.scheduled_date}
                  deleteScope={deleteScope}
                  error={serverErrorMessage(remove.error)}
                  deleting={remove.isPending}
                  onScopeChange={setDeleteScope}
                  onCancel={() => setConfirmingDelete(false)}
                  onConfirm={() => remove.mutate()}
                />
              ) : null
            }
          />
        ) : (
          <EditTaskForm
            form={form}
            task={task}
            viewedDate={viewed.scheduled_date}
            categories={categories}
            saveScope={saveScope}
            seriesRow={seriesRow}
            seriesError={seriesError}
            serverError={serverError}
            seriesFieldsPending={seriesFieldsPending}
            seriesSaveBlocked={seriesSaveBlocked}
            submitting={
              update.isPending ||
              updateSeries.isPending ||
              updateSeriesFrom.isPending
            }
            onScopeChange={setSaveScope}
            onAttachSchedule={(next, error) => {
              setSeries(next);
              setSeriesError(error);
            }}
            onDraftSchedule={(next, error) => {
              setSeriesDraft(next);
              setSeriesCleared(next === null);
              setSeriesDraftError(error);
            }}
            onCategoriesChange={onCategoriesChange}
            onSubmit={onSubmit}
            onClose={onClose}
          />
        )}
      </dialog>
    </div>
  );
}
