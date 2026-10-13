import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { QUERY_KEYS } from "@/api/queryKeys";
import {
  MAX_DURATION_MINUTES,
  MAX_TASK_DESCRIPTION_LENGTH,
  MAX_TASK_TITLE_LENGTH,
  createTask,
} from "@/api/tasks";
import type { ErrorCode } from "@/api/bindings";
import { ApiError } from "@/api/transport";

const optionalDurationPart = (unit: string) =>
  z.string().regex(/^\d*$/, `${unit} must be a positive whole number`);

const DURATION_RANGE_MESSAGE = `Estimated time must be between 1 minute and ${
  MAX_DURATION_MINUTES / 60
} hours`;

const schema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Task title is required")
      .max(
        MAX_TASK_TITLE_LENGTH,
        `Task title must be ${MAX_TASK_TITLE_LENGTH} characters or fewer`,
      ),
    description: z
      .string()
      .max(
        MAX_TASK_DESCRIPTION_LENGTH,
        `Description must be ${MAX_TASK_DESCRIPTION_LENGTH.toLocaleString()} characters or fewer`,
      ),
    estHours: optionalDurationPart("Hours"),
    estMinutes: optionalDurationPart("Minutes"),
    carryOver: z.enum(["", "carry", "return"]),
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

const SERVER_ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  task_title_required: "Task title is required",
  task_title_too_long: `Task title must be ${MAX_TASK_TITLE_LENGTH} characters or fewer`,
  task_title_invalid_characters: "Task title cannot contain control characters",
  estimated_time_out_of_range: DURATION_RANGE_MESSAGE,
  task_description_too_long: `Description must be ${MAX_TASK_DESCRIPTION_LENGTH.toLocaleString()} characters or fewer`,
};

interface NewTaskDialogProps {
  onClose: () => void;
}

export function NewTaskDialog({ onClose }: NewTaskDialogProps) {
  const queryClient = useQueryClient();

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
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { carryOver: "" },
  });

  const create = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      onClose();
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
      description: description.trim() || null,
      estimated_minutes: hasEstimate ? total : null,
      carry_over_rule: carryOver === "" ? null : carryOver,
    });
  };

  const estimateError = errors.estHours?.message ?? errors.estMinutes?.message;
  const serverError =
    create.error instanceof ApiError
      ? (SERVER_ERROR_MESSAGES[create.error.code] ?? create.error.message)
      : create.error
        ? String(create.error)
        : undefined;

  // Backdrop click dismisses for pointer users; Escape (the document keydown
  // listener above) is the keyboard equivalent, so the click-only rules are
  // safe to disable for this element.
  /* eslint-disable jsx-a11y/click-events-have-key-events,
     jsx-a11y/no-static-element-interactions */
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-task-title"
        className="flex w-full max-w-lg flex-col gap-6 rounded-lg border border-border bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2
            id="new-task-title"
            className="font-title text-lg font-semibold text-text"
          >
            New task
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
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
              Title *
            </label>
            <input
              id="new-task-title-input"
              type="text"
              maxLength={MAX_TASK_TITLE_LENGTH}
              // Focus lands on the first field when the dialog opens —
              // standard modal behavior, not the autofocus the rule warns about.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
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
              Description <span className="text-text-muted">(optional)</span>
            </label>
            <textarea
              id="new-task-description"
              rows={3}
              maxLength={MAX_TASK_DESCRIPTION_LENGTH}
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
              Estimated time <span className="text-text-muted">(optional)</span>
            </span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  id="new-task-est-hours"
                  aria-label="Estimated hours"
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
                  h
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="new-task-est-minutes"
                  aria-label="Estimated minutes"
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
                  min
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
              Carry-over rule
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
                  {(
                    [
                      ["", "Ask"],
                      ["carry", "Carry over"],
                      ["return", "Return to backlog"],
                    ] as const
                  ).map(([option, label]) => (
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
                      {label}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-all hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            >
              Create task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
  /* eslint-enable jsx-a11y/click-events-have-key-events,
     jsx-a11y/no-static-element-interactions */
}
