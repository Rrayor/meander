import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { NotesTabs } from "@/features/tasks/NotesTabs";
import { RepeatScheduleFields } from "@/features/tasks/RepeatScheduleFields";
import type { NewSeries, TaskSeries, UpdateSeries } from "@/api/bindings";
import {
  deleteTaskSeries,
  listSeriesCategories,
  listSeriesInstances,
  listTaskSeries,
  truncateTaskSeries,
  updateTaskSeries,
} from "@/api/series";
import {
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
  TASK_SCOPE_COMING_SOON_HINT,
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
import {
  codePointsWithin,
  formatDate,
  formatIsoDay,
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
    status: z.enum(["todo", "in_progress", "done"]),
    carryOver: z.enum(["", "carry", "return"]),
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
  categories: Category[];
  seriesRow: TaskSeries | undefined;
  seriesInstances: Task[] | undefined;
  onPick: (picked: Task | null, iso: string) => void;
  onClose: () => void;
  onDelete: () => void;
  deletePrompt?: ReactNode;
}

function TaskDetailsView({
  viewed,
  pendingIso,
  categories,
  seriesRow,
  seriesInstances,
  onPick,
  onClose,
  onDelete,
  deletePrompt,
}: Readonly<TaskDetailsViewProps>) {
  return (
    <div className="flex flex-col gap-4">
      {pendingIso !== null ? (
        <p className="text-sm text-text-muted italic">
          {SCHEDULED_INSTANCE_PENDING_MESSAGE}
        </p>
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
              <span className="text-sm">{STATUS_LABELS[viewed.status]}</span>
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
                  (o) => o.value === (viewed.carry_over_rule ?? ""),
                )?.label ?? EMPTY_VALUE_LABEL}
              </span>
            </div>
          </div>
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
        </>
      )}
      {seriesRow && (
        <p className="border-t border-border pt-4 text-sm text-text-muted">
          {seriesAuditLabel(
            describeRecurrence(seriesRow.recurrence),
            formatIsoDay(seriesRow.start_date),
            seriesRow.end_date === null
              ? null
              : formatIsoDay(seriesRow.end_date),
            formatDate(seriesRow.created_at),
            formatDate(seriesRow.updated_at),
          )}
        </p>
      )}
      {seriesRow && seriesInstances && (
        <InstanceCalendar
          series={seriesRow}
          instances={seriesInstances}
          selectedIso={pendingIso ?? viewed.scheduled_date}
          onPick={onPick}
        />
      )}
      {viewed.series_id !== null && <NotesTabs />}
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

export function EditTaskDialog({
  task,
  onClose,
}: Readonly<EditTaskDialogProps>) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"view" | "edit">("view");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const estimate = minutesToParts(task.estimated_minutes);
  const spent = minutesToParts(task.spent_minutes);
  const {
    register,
    control,
    handleSubmit,
    setFocus,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      title: task.title,
      description: task.description ?? "",
      estHours: estimate.hours,
      estMinutes: estimate.minutes,
      spentHours: spent.hours,
      spentMinutes: spent.minutes,
      status: task.status,
      carryOver: task.carry_over_rule ?? "",
    },
  });

  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (mode === "edit") {
      setFocus("title");
    } else {
      // Read-only mode has no field to focus — move focus onto the dialog
      // itself so keyboard users aren't stranded behind it.
      dialogRef.current?.focus();
    }
  }, [mode, setFocus]);

  // Which instance the read-only view is showing — the opened task until the
  // calendar picks a different persisted date or an unpersisted one (then
  // `pendingIso` is set and the fields give way to the empty state).
  const [viewed, setViewed] = useState<Task>(task);
  const [pendingIso, setPendingIso] = useState<string | null>(null);

  const { data: initialCategories } = useQuery({
    queryKey: QUERY_KEYS.taskCategories(viewed.id),
    queryFn: () => listTaskCategories(viewed.id),
  });
  const { data: taskSeries } = useQuery({
    queryKey: QUERY_KEYS.taskSeries,
    queryFn: listTaskSeries,
    enabled: task.series_id !== null,
  });
  const { data: seriesInstances } = useQuery({
    queryKey: QUERY_KEYS.seriesInstances(task.series_id!),
    queryFn: () => listSeriesInstances(task.series_id!),
    enabled: task.series_id !== null,
  });
  const seriesRow = taskSeries?.find((s) => s.id === task.series_id);
  // Save scope: instance edits today's task; series writes the shared
  // fields + schedule + categories onto the series and every instance.
  const [saveScope, setSaveScope] = useState<"instance" | "series">("instance");
  const { data: seriesCats, error: seriesCatsError } = useQuery({
    queryKey: QUERY_KEYS.seriesCategories(task.series_id!),
    queryFn: () => listSeriesCategories(task.series_id!),
    enabled: task.series_id !== null && saveScope === "series",
  });
  // The series-scope schedule draft: null = untouched (use the stored
  // schedule), cleared = the user collapsed the section (a series needs a
  // schedule — saving is disabled until one exists again).
  const [seriesDraft, setSeriesDraft] = useState<NewSeries | null>(null);
  const [seriesCleared, setSeriesCleared] = useState(false);
  const [seriesDraftError, setSeriesDraftError] = useState<string | null>(null);
  // Entering series scope reseeds the shared fields from the series — the
  // form defaults hold the opened instance's values, which may be custom
  // edits (spec §146: series scope edits the shared fields, not one
  // instance's overrides). Instance-only spent/status keep the opened
  // task's values so they stay valid while disabled. The ref guards
  // against reseeding on a later refetch, which would clobber typed edits.
  const seriesScopeSeeded = useRef(false);
  useEffect(() => {
    if (saveScope !== "series") {
      seriesScopeSeeded.current = false;
      return;
    }
    if (seriesScopeSeeded.current || seriesRow === undefined) return;
    seriesScopeSeeded.current = true;
    const seriesEstimate = minutesToParts(seriesRow.estimated_minutes);
    reset({
      title: seriesRow.title,
      description: seriesRow.description ?? "",
      estHours: seriesEstimate.hours,
      estMinutes: seriesEstimate.minutes,
      spentHours: spent.hours,
      spentMinutes: spent.minutes,
      status: task.status,
      carryOver: seriesRow.carry_over_rule,
    });
  }, [saveScope, seriesRow, reset, spent.hours, spent.minutes, task.status]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteScope, setDeleteScope] = useState<
    "instance" | "series" | "future"
  >("instance");
  // The selection is derived state: stored associations minus the chips the
  // user removed plus the ones they added. Deriving it (rather than seeding
  // state once) keeps picks intact when the query resolves late *and* lets
  // a refetch update what chips show — e.g. after a category is recolored.
  // Local category overrides belong to the viewed scope — keying the draft
  // by scope+id means switching instances or scopes never carries a
  // previous selection across.
  const categoryKey =
    saveScope === "series" ? `series-${task.series_id}` : `task-${viewed.id}`;
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
  const [series, setSeries] = useState<NewSeries | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const stored =
    saveScope === "series" ? (seriesCats ?? []) : (initialCategories ?? []);
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

  const update = useMutation({
    mutationFn: async (input: Parameters<typeof updateTask>[1]) => {
      await updateTask(task.id, input);
      const next = new Set(categories.map((c) => c.id));
      const prev = new Set(stored.map((c) => c.id));
      await Promise.all([
        ...categories
          .filter((c) => !prev.has(c.id))
          .map((c) => addTaskCategory(task.id, c.id)),
        ...stored
          .filter((c) => !next.has(c.id))
          .map((c) => removeTaskCategory(task.id, c.id)),
      ]);
    },
    onSuccess: onClose,
    onSettled: () => {
      // Also on failure: update_task may have committed before a category
      // association rejected, so the list must reflect what was saved.
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.taskCategories(task.id),
      });
    },
  });

  const invalidateSeriesScope = () => {
    for (const key of [
      QUERY_KEYS.tasks,
      QUERY_KEYS.taskSeries,
      QUERY_KEYS.seriesInstances(task.series_id!),
      QUERY_KEYS.seriesCategories(task.series_id!),
      QUERY_KEYS.allTaskCategories,
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const updateSeries = useMutation({
    mutationFn: (input: UpdateSeries) =>
      updateTaskSeries(task.series_id!, input),
    onSuccess: onClose,
    onSettled: invalidateSeriesScope,
  });

  // Delete runs against the *viewed* instance — picking another persisted
  // date in the calendar moves the target with it.
  const remove = useMutation({
    mutationFn: async () => {
      const seriesId = task.series_id;
      if (seriesId === null || deleteScope === "instance") {
        return deleteTask(viewed.id);
      }
      if (deleteScope === "series") {
        return deleteTaskSeries(seriesId);
      }
      const fromIso = pendingIso ?? viewed.scheduled_date;
      return truncateTaskSeries(seriesId, fromIso!);
    },
    onSuccess: onClose,
    onSettled: invalidateSeriesScope,
  });

  const toMinutes = (hours: string, minutes: string) =>
    hours.trim() === "" && minutes.trim() === ""
      ? null
      : (Number(hours) || 0) * 60 + (Number(minutes) || 0);

  const onSubmit = (values: FormValues) => {
    const shared = {
      title: values.title,
      description: unicodeTrim(values.description) || null,
      estimated_minutes: toMinutes(values.estHours, values.estMinutes),
      carry_over_rule: values.carryOver === "" ? null : values.carryOver,
    };
    if (saveScope === "series") {
      const schedule = seriesDraft ?? {
        recurrence: seriesRow!.recurrence,
        start_date: seriesRow!.start_date,
        end_date: seriesRow!.end_date,
      };
      updateSeries.mutate({
        ...shared,
        recurrence: schedule.recurrence,
        start_date: schedule.start_date,
        end_date: schedule.end_date,
        category_ids: categories.map((c) => c.id),
      });
      return;
    }
    update.mutate({
      ...shared,
      spent_minutes: toMinutes(values.spentHours, values.spentMinutes),
      status: values.status,
      series,
    });
  };

  const estimateError = errors.estHours?.message ?? errors.estMinutes?.message;
  const spentError = errors.spentHours?.message ?? errors.spentMinutes?.message;
  const serverError = serverErrorMessage(
    update.error ?? updateSeries.error ?? seriesCatsError,
  );
  // A series save needs a schedule: the stored one (untouched draft) or a
  // valid edited one — collapsing the section disables saving. It also
  // waits for the series category query: submitting before it resolves
  // would send an empty set and erase every instance's associations, and
  // a failed load is surfaced instead of treated as "no categories".
  const seriesSaveBlocked =
    saveScope === "series" &&
    (seriesRow === undefined ||
      seriesCats === undefined ||
      seriesCleared ||
      seriesDraftError !== null);

  const durationField = (options: {
    idPrefix: string;
    hoursLabel: string;
    minutesLabel: string;
    hoursField: "estHours" | "spentHours";
    minutesField: "estMinutes" | "spentMinutes";
    errorId: string;
    invalid: boolean;
    disabled?: boolean;
  }) => {
    const {
      idPrefix,
      hoursLabel,
      minutesLabel,
      hoursField,
      minutesField,
      errorId,
      invalid,
      disabled = false,
    } = options;
    return (
      <div
        className={`flex items-center gap-4 ${disabled ? "opacity-50" : ""}`}
      >
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
  };

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
            {mode === "view" ? viewed.title : EDIT_TASK_HEADING}
          </h2>
          <div className="flex items-center gap-1">
            {mode === "view" &&
              viewed.id === task.id &&
              pendingIso === null && (
                <button
                  type="button"
                  onClick={() => setMode("edit")}
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-text transition-colors hover:bg-surface-raised"
                >
                  {EDIT_BUTTON_LABEL}
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
        {mode === "view" ? (
          <TaskDetailsView
            viewed={viewed}
            pendingIso={pendingIso}
            categories={categories}
            seriesRow={seriesRow}
            seriesInstances={seriesInstances}
            onPick={(picked, iso) => {
              if (picked) {
                setViewed(picked);
                setPendingIso(null);
              } else {
                setPendingIso(iso);
              }
            }}
            onClose={onClose}
            onDelete={() => {
              setDeleteScope("instance");
              setConfirmingDelete(true);
            }}
            deletePrompt={
              confirmingDelete ? (
                <div className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-surface-raised/60 p-4">
                  <h3 className="text-sm font-semibold text-danger">
                    {DELETE_TASK_HEADING}
                  </h3>
                  {task.series_id !== null && (
                    <fieldset className="flex flex-col gap-2">
                      {[
                        {
                          value: "instance",
                          label: TASK_SCOPE_INSTANCE_LABEL,
                          shown: pendingIso === null,
                        },
                        {
                          value: "series",
                          label: TASK_SCOPE_SERIES_LABEL,
                          shown: true,
                        },
                        {
                          value: "future",
                          label: DELETE_SCOPE_FUTURE_LABEL,
                          shown: (pendingIso ?? viewed.scheduled_date) !== null,
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
                              onChange={() =>
                                setDeleteScope(
                                  value as "instance" | "series" | "future",
                                )
                              }
                              className="accent-danger"
                            />
                            {label}
                          </label>
                        ))}
                    </fieldset>
                  )}
                  <p className="text-xs text-text-muted">
                    {DELETE_UNDO_WARNING}
                  </p>
                  {serverErrorMessage(remove.error) && (
                    <p role="alert" className="text-sm text-danger">
                      {serverErrorMessage(remove.error)}
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="rounded-md border border-border px-4 py-1.5 text-sm text-text transition-colors hover:bg-surface-raised"
                    >
                      {DELETE_KEEP_LABEL}
                    </button>
                    <button
                      type="button"
                      disabled={
                        remove.isPending ||
                        (task.series_id !== null &&
                          deleteScope === "instance" &&
                          pendingIso !== null)
                      }
                      onClick={() => remove.mutate()}
                      className="rounded-md bg-danger px-4 py-1.5 text-sm font-medium text-on-primary transition-colors hover:brightness-110 disabled:opacity-50"
                    >
                      {DELETE_BUTTON_LABEL}
                    </button>
                  </div>
                </div>
              ) : null
            }
          />
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
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
                aria-invalid={!!errors.title}
                aria-describedby={
                  errors.title ? "edit-task-title-error" : undefined
                }
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
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-text-muted">
                  {ESTIMATED_TIME_LABEL}{" "}
                  <span className="text-text-muted">
                    {OPTIONAL_FIELD_LABEL}
                  </span>
                </span>
                {durationField({
                  idPrefix: "edit-task-est",
                  hoursLabel: ESTIMATED_HOURS_LABEL,
                  minutesLabel: ESTIMATED_MINUTES_LABEL,
                  hoursField: "estHours",
                  minutesField: "estMinutes",
                  errorId: "edit-task-estimate-error",
                  invalid: !!estimateError,
                })}
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
                  <span className="text-text-muted">
                    {OPTIONAL_FIELD_LABEL}
                  </span>
                </span>
                {durationField({
                  idPrefix: "edit-task-spent",
                  hoursLabel: SPENT_HOURS_LABEL,
                  minutesLabel: SPENT_MINUTES_LABEL,
                  hoursField: "spentHours",
                  minutesField: "spentMinutes",
                  errorId: "edit-task-spent-error",
                  invalid: !!spentError,
                  disabled: saveScope === "series",
                })}
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
                      saveScope === "series" ? "opacity-50" : ""
                    }`}
                  >
                    {(["todo", "in_progress", "done"] as const).map(
                      (option) => (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={value === option}
                          disabled={saveScope === "series"}
                          onClick={() => onChange(option)}
                          className={`flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors ${
                            value === option
                              ? "bg-primary text-on-primary"
                              : "text-text-muted hover:text-text"
                          }`}
                        >
                          {STATUS_LABELS[option]}
                        </button>
                      ),
                    )}
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
              <fieldset className="flex flex-col gap-2">
                <legend className="text-xs font-medium tracking-wider text-text-muted uppercase">
                  {TASK_SCOPE_GROUP_LABEL}
                </legend>
                {[
                  { value: "instance", label: TASK_SCOPE_INSTANCE_LABEL },
                  { value: "series", label: TASK_SCOPE_SERIES_LABEL },
                  { value: "future", label: TASK_SCOPE_FUTURE_LABEL },
                ].map(({ value, label }) => (
                  <div key={value} className="flex items-center gap-2">
                    <label
                      className={`flex items-center gap-2 text-sm ${
                        value === "future" ? "text-text-muted" : "text-text"
                      }`}
                    >
                      <input
                        type="radio"
                        name="task-save-scope"
                        value={value}
                        checked={saveScope === value}
                        disabled={value === "future"}
                        onChange={() =>
                          setSaveScope(value as "instance" | "series")
                        }
                        className="accent-primary"
                      />
                      {label}
                    </label>
                    {value === "future" && (
                      <span className="text-xs text-text-muted italic">
                        {TASK_SCOPE_COMING_SOON_HINT}
                      </span>
                    )}
                  </div>
                ))}
              </fieldset>
            )}
            {task.series_id === null && (
              <RepeatScheduleFields
                idPrefix="edit-task"
                onChange={(next, error) => {
                  setSeries(next);
                  setSeriesError(error);
                }}
              />
            )}
            {task.series_id !== null &&
              saveScope === "series" &&
              seriesRow !== undefined && (
                <RepeatScheduleFields
                  idPrefix="edit-series"
                  initial={{
                    recurrence: seriesRow.recurrence,
                    start_date: seriesRow.start_date,
                    end_date: seriesRow.end_date,
                  }}
                  onChange={(next, error) => {
                    setSeriesDraft(next);
                    setSeriesCleared(next === null);
                    setSeriesDraftError(error);
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
                  disabled={
                    update.isPending ||
                    updateSeries.isPending ||
                    seriesError !== null ||
                    seriesSaveBlocked
                  }
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-all hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                >
                  {SAVE_BUTTON_LABEL}
                </button>
              </div>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
