import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
import { RepeatScheduleFields } from "@/features/tasks/RepeatScheduleFields";
import type { NewSeries } from "@/api/bindings";
import {
  CANCEL_BUTTON_LABEL,
  CARRY_OVER_FIELD_LABEL,
  CATEGORIES_FIELD_LABEL,
  CARRY_OVER_OPTIONS,
  CLOSE_DIALOG_LABEL,
  CLOSE_LABEL,
  DESCRIPTION_FIELD_LABEL,
  EDIT_TASK_HEADING,
  ESTIMATED_HOURS_LABEL,
  ESTIMATED_MINUTES_LABEL,
  ESTIMATED_TIME_LABEL,
  HOURS_UNIT_LABEL,
  MINUTES_UNIT_LABEL,
  OPTIONAL_FIELD_LABEL,
  SAVE_BUTTON_LABEL,
  SPENT_HOURS_LABEL,
  SPENT_MINUTES_LABEL,
  SPENT_TIME_LABEL,
  STATUS_LABELS,
  TASK_STATUS_FIELD_LABEL,
  TITLE_FIELD_LABEL,
  TITLE_REQUIRED_MESSAGE,
  auditTimestampsLabel,
} from "@/lib/labels";
import { codePointsWithin, formatDate, unicodeTrim } from "@/lib/utils";

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

interface EditTaskDialogProps {
  task: Task;
  onClose: () => void;
}

export function EditTaskDialog({
  task,
  onClose,
}: Readonly<EditTaskDialogProps>) {
  const queryClient = useQueryClient();

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

  useEffect(() => {
    setFocus("title");
  }, [setFocus]);

  const { data: initialCategories } = useQuery({
    queryKey: QUERY_KEYS.taskCategories(task.id),
    queryFn: () => listTaskCategories(task.id),
  });
  // The selection is derived state: stored associations minus the chips the
  // user removed plus the ones they added. Deriving it (rather than seeding
  // state once) keeps picks intact when the query resolves late *and* lets
  // a refetch update what chips show — e.g. after a category is recolored.
  const [removedIds, setRemovedIds] = useState<ReadonlySet<number>>(new Set());
  const [picked, setPicked] = useState<Category[]>([]);
  const [series, setSeries] = useState<NewSeries | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const stored = initialCategories ?? [];
  const storedIds = new Set(stored.map((c) => c.id));
  const categories = [
    ...stored.filter((c) => !removedIds.has(c.id)),
    ...picked.filter((c) => !storedIds.has(c.id)),
  ];
  const onCategoriesChange = (next: Category[]) => {
    const nextIds = new Set(next.map((c) => c.id));
    setRemovedIds(
      new Set(stored.filter((c) => !nextIds.has(c.id)).map((c) => c.id)),
    );
    setPicked(next.filter((c) => !storedIds.has(c.id)));
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

  const toMinutes = (hours: string, minutes: string) =>
    hours.trim() === "" && minutes.trim() === ""
      ? null
      : (Number(hours) || 0) * 60 + (Number(minutes) || 0);

  const onSubmit = (values: FormValues) => {
    update.mutate({
      title: values.title,
      description: unicodeTrim(values.description) || null,
      estimated_minutes: toMinutes(values.estHours, values.estMinutes),
      spent_minutes: toMinutes(values.spentHours, values.spentMinutes),
      carry_over_rule: values.carryOver === "" ? null : values.carryOver,
      status: values.status,
      series,
    });
  };

  const estimateError = errors.estHours?.message ?? errors.estMinutes?.message;
  const spentError = errors.spentHours?.message ?? errors.spentMinutes?.message;
  const serverError = serverErrorMessage(update.error);

  const durationField = (
    idPrefix: string,
    hoursLabel: string,
    minutesLabel: string,
    hoursField: "estHours" | "spentHours",
    minutesField: "estMinutes" | "spentMinutes",
    errorId: string,
    invalid: boolean,
  ) => (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <input
          id={`${idPrefix}-hours`}
          aria-label={hoursLabel}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          type="number"
          placeholder="0"
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
        open
        aria-labelledby="edit-task-title"
        className="relative m-0 flex max-h-[90vh] w-full max-w-lg flex-col gap-6 overflow-y-auto rounded-lg border border-border bg-surface p-6 text-text shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2
            id="edit-task-title"
            className="font-title text-lg font-semibold text-text"
          >
            {EDIT_TASK_HEADING}
          </h2>
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
                <span className="text-text-muted">{OPTIONAL_FIELD_LABEL}</span>
              </span>
              {durationField(
                "edit-task-est",
                ESTIMATED_HOURS_LABEL,
                ESTIMATED_MINUTES_LABEL,
                "estHours",
                "estMinutes",
                "edit-task-estimate-error",
                !!estimateError,
              )}
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
              {durationField(
                "edit-task-spent",
                SPENT_HOURS_LABEL,
                SPENT_MINUTES_LABEL,
                "spentHours",
                "spentMinutes",
                "edit-task-spent-error",
                !!spentError,
              )}
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
                <div
                  role="radiogroup"
                  aria-labelledby="edit-task-status-label"
                  className="flex gap-1 rounded-lg border border-border bg-surface-raised p-1"
                >
                  {(["todo", "in_progress", "done"] as const).map((option) => (
                    <button
                      key={option}
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
          {task.series_id === null && (
            <RepeatScheduleFields
              idPrefix="edit-task"
              onChange={(next, error) => {
                setSeries(next);
                setSeriesError(error);
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
                disabled={update.isPending || seriesError !== null}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-all hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              >
                {SAVE_BUTTON_LABEL}
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </div>
  );
}
