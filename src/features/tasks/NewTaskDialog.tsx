import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { addTaskCategory, removeTaskCategory } from "@/api/categories";
import type { Category } from "@/api/categories";
import { QUERY_KEYS } from "@/api/queryKeys";
import {
  MAX_DURATION_MINUTES,
  MAX_TASK_DESCRIPTION_LENGTH,
  MAX_TASK_TITLE_LENGTH,
  createTask,
  updateTask,
} from "@/api/tasks";
import {
  DURATION_RANGE_MESSAGE,
  TASK_DESCRIPTION_TOO_LONG_MESSAGE,
  TASK_TITLE_INVALID_CHARACTERS_MESSAGE,
  TASK_TITLE_TOO_LONG_MESSAGE,
  serverErrorMessage,
} from "@/lib/errors";
import { CategoryMultiSelect } from "@/features/categories/CategoryMultiSelect";
import { RepeatScheduleFields } from "@/features/tasks/RepeatScheduleFields";
import type { NewSeries } from "@/api/bindings";
import { CarryOverRule, TaskStatus, carryOverToWire } from "@/lib/enums";
import {
  CANCEL_BUTTON_LABEL,
  CARRY_OVER_FIELD_LABEL,
  CATEGORIES_FIELD_LABEL,
  CARRY_OVER_OPTIONS,
  CLOSE_DIALOG_LABEL,
  CLOSE_LABEL,
  CREATE_TASK_LABEL,
  DESCRIPTION_FIELD_LABEL,
  ESTIMATED_HOURS_LABEL,
  ESTIMATED_MINUTES_LABEL,
  ESTIMATED_TIME_LABEL,
  HOURS_UNIT_LABEL,
  MINUTES_UNIT_LABEL,
  NEW_TASK_HEADING,
  OPTIONAL_FIELD_LABEL,
  TITLE_FIELD_LABEL,
  TITLE_REQUIRED_MESSAGE,
} from "@/lib/labels";
import { codePointsWithin, unicodeTrim } from "@/lib/utils";

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
    carryOver: z.enum(CarryOverRule),
  })
  .superRefine(({ estHours, estMinutes }, ctx) => {
    if (estHours.trim() === "" && estMinutes.trim() === "") {
      return;
    }
    const total = (Number(estHours) || 0) * 60 + (Number(estMinutes) || 0);
    if (total < 1 || total > MAX_DURATION_MINUTES) {
      for (const field of ["estHours", "estMinutes"] as const) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: DURATION_RANGE_MESSAGE,
        });
      }
    }
  });

type FormValues = z.infer<typeof schema>;

interface NewTaskDialogProps {
  onClose: () => void;
}

export function NewTaskDialog({ onClose }: Readonly<NewTaskDialogProps>) {
  const queryClient = useQueryClient();
  const [categories, setCategories] = useState<Category[]>([]);
  const [series, setSeries] = useState<NewSeries | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  // Once the create retried task is linked to a series its schedule is no
  // longer editable here — same rule as the edit dialog (series editing is
  // a later milestone).
  const [linkedToSeries, setLinkedToSeries] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const {
    register,
    control,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { carryOver: CarryOverRule.Ask },
  });

  // Focus lands on the first field when the dialog opens — standard modal
  // behavior.
  useEffect(() => {
    setFocus("title");
  }, [setFocus]);

  // Set once create_task succeeds: a failed association leaves the task in
  // place, so a retry must reconcile with it — update the (possibly edited)
  // fields and diff the already-linked categories — never insert a
  // duplicate row. Refs keep the values consistent within the in-flight
  // mutation's own callbacks (a state update could lag behind them).
  const createdId = useRef<number | undefined>(undefined);
  const createdHasSeries = useRef(false);
  const linkedIds = useRef(new Set<number>());

  const create = useMutation({
    mutationFn: async (input: Parameters<typeof createTask>[0]) => {
      let task;
      if (createdId.current === undefined) {
        task = await createTask(input);
        createdId.current = task.id;
      } else {
        // Retry: persist the current field values onto the existing row. A
        // schedule can still be attached while the task is plain; once it is
        // linked, re-sending one would trip already_in_series — the section
        // is hidden by then anyway.
        task = await updateTask(createdId.current, {
          ...input,
          series: createdHasSeries.current ? null : input.series,
          spent_minutes: null,
          status: TaskStatus.Todo,
        });
      }
      if (task.series_id != null) {
        createdHasSeries.current = true;
        setLinkedToSeries(true);
        // The section unmounts now — a schedule edit made while the create
        // was in flight must not leave a stale error disabling the retry.
        setSeries(null);
        setSeriesError(null);
      }
      const taskId = task.id ?? createdId.current;
      const wanted = new Set(categories.map((c) => c.id));
      await Promise.all([
        ...categories
          .filter((c) => !linkedIds.current.has(c.id))
          .map((c) =>
            addTaskCategory(taskId, c.id).then(() =>
              linkedIds.current.add(c.id),
            ),
          ),
        ...[...linkedIds.current]
          .filter((id) => !wanted.has(id))
          .map((id) =>
            removeTaskCategory(taskId, id).then(() =>
              linkedIds.current.delete(id),
            ),
          ),
      ]);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.boardWeeks,
      });
      onClose();
    },
    onError: () => {
      // The task may already exist even though the mutation failed —
      // refresh the list so the backlog shows what was actually saved.
      if (createdId.current !== undefined) {
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
        void queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.boardWeeks,
        });
      }
    },
  });

  const onSubmit = ({
    title,
    description,
    estHours,
    estMinutes,
    carryOver,
  }: FormValues) => {
    const hasEstimate = estHours.trim() !== "" || estMinutes.trim() !== "";
    const total = (Number(estHours) || 0) * 60 + (Number(estMinutes) || 0);
    create.mutate({
      title,
      description: unicodeTrim(description) || null,
      estimated_minutes: hasEstimate ? total : null,
      carry_over_rule: carryOverToWire(carryOver),
      series,
    });
  };

  const estimateError = errors.estHours?.message ?? errors.estMinutes?.message;
  const serverError = serverErrorMessage(create.error);

  // The backdrop is a real button (pointer + keyboard dismiss) and the panel
  // a native <dialog>; Escape is handled by the document listener above.
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
        aria-labelledby="new-task-title"
        className="relative m-0 flex max-h-[90vh] w-full max-w-lg flex-col gap-6 overflow-y-auto rounded-lg border border-border bg-surface p-6 text-text shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2
            id="new-task-title"
            className="font-title text-lg font-semibold text-text"
          >
            {NEW_TASK_HEADING}
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
              htmlFor="new-task-title-input"
              className="text-xs font-medium text-text-muted"
            >
              {TITLE_FIELD_LABEL} *
            </label>
            <input
              id="new-task-title-input"
              type="text"
              placeholder="e.g. Renew passport"
              aria-invalid={!!errors.title}
              aria-describedby={
                errors.title ? "new-task-title-error" : undefined
              }
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none ring-primary placeholder:text-text-muted focus:border-primary focus:ring-1"
              {...register("title")}
            />
            {errors.title && (
              <p
                id="new-task-title-error"
                role="alert"
                className="text-sm text-danger"
              >
                {errors.title.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="new-task-description"
              className="text-xs font-medium text-text-muted"
            >
              {DESCRIPTION_FIELD_LABEL}{" "}
              <span className="text-text-muted">{OPTIONAL_FIELD_LABEL}</span>
            </label>
            <textarea
              id="new-task-description"
              rows={3}
              placeholder="Add details, links, or context"
              aria-invalid={!!errors.description}
              aria-describedby={
                errors.description ? "new-task-description-error" : undefined
              }
              className="w-full resize-none rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
              {...register("description")}
            />
            {errors.description && (
              <p
                id="new-task-description-error"
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
              idPrefix="new-task"
              selected={categories}
              onChange={setCategories}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-muted">
              {ESTIMATED_TIME_LABEL}{" "}
              <span className="text-text-muted">{OPTIONAL_FIELD_LABEL}</span>
            </span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  id="new-task-est-hours"
                  aria-label={ESTIMATED_HOURS_LABEL}
                  aria-invalid={!!errors.estHours}
                  aria-describedby={
                    estimateError ? "new-task-estimate-error" : undefined
                  }
                  type="number"
                  placeholder="0"
                  className="w-20 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
                  {...register("estHours")}
                />
                <label
                  htmlFor="new-task-est-hours"
                  className="text-xs text-text-muted"
                >
                  {HOURS_UNIT_LABEL}
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="new-task-est-minutes"
                  aria-label={ESTIMATED_MINUTES_LABEL}
                  aria-invalid={!!errors.estMinutes}
                  aria-describedby={
                    estimateError ? "new-task-estimate-error" : undefined
                  }
                  type="number"
                  placeholder="0"
                  className="w-20 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
                  {...register("estMinutes")}
                />
                <label
                  htmlFor="new-task-est-minutes"
                  className="text-xs text-text-muted"
                >
                  {MINUTES_UNIT_LABEL}
                </label>
              </div>
            </div>
            {estimateError && (
              <p
                id="new-task-estimate-error"
                role="alert"
                className="text-sm text-danger"
              >
                {estimateError}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span
              id="new-task-carry-over-label"
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
                  aria-labelledby="new-task-carry-over-label"
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
          {!linkedToSeries && (
            <RepeatScheduleFields
              idPrefix="new-task"
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
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
            >
              {CANCEL_BUTTON_LABEL}
            </button>
            <button
              type="submit"
              disabled={create.isPending || seriesError !== null}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-all hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            >
              {CREATE_TASK_LABEL}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
