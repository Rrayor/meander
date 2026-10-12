import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { QUERY_KEYS } from "@/api/queryKeys";
import { MAX_TASK_TITLE_LENGTH, createTask } from "@/api/tasks";

const optionalDurationPart = (unit: string) =>
  z
    .string()
    .refine(
      (v) => v.trim() === "" || (Number.isInteger(Number(v)) && Number(v) >= 0),
      `${unit} must be a positive whole number`,
    );

const schema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Task title is required")
    .max(MAX_TASK_TITLE_LENGTH, "Task title must be 200 characters or fewer"),
  description: z.string(),
  estHours: optionalDurationPart("Hours"),
  estMinutes: optionalDurationPart("Minutes"),
});

type FormValues = z.infer<typeof schema>;

const SERVER_ERROR_MESSAGES: Record<string, string> = {
  "task title is required": "Task title is required",
  "task title must be 200 characters or fewer":
    "Task title must be 200 characters or fewer",
  "task title cannot contain control characters":
    "Task title cannot contain control characters",
  "estimated time cannot be negative": "Estimated time cannot be negative",
};

interface NewTaskDialogProps {
  onClose: () => void;
}

export function NewTaskDialog({ onClose }: NewTaskDialogProps) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const create = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      onClose();
    },
  });

  const onSubmit = ({
    title,
    description,
    estHours,
    estMinutes,
  }: FormValues) => {
    const hasEstimate = estHours.trim() !== "" || estMinutes.trim() !== "";
    const total = (Number(estHours) || 0) * 60 + (Number(estMinutes) || 0);
    create.mutate({
      title,
      description: description.trim() || null,
      estimated_minutes: hasEstimate ? total : null,
    });
  };

  const fieldError =
    errors.title?.message ??
    errors.estHours?.message ??
    errors.estMinutes?.message;
  const error =
    fieldError ??
    (create.error
      ? (SERVER_ERROR_MESSAGES[String(create.error)] ?? String(create.error))
      : undefined);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-task-title"
        className="flex w-full max-w-lg flex-col gap-6 rounded-lg border border-border bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
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
              autoFocus
              placeholder="e.g. Renew passport"
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none ring-primary placeholder:text-text-muted focus:border-primary focus:ring-1"
              {...register("title")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="new-task-description"
              className="text-xs font-medium text-text-muted"
            >
              Description <span className="text-text-muted/60">(optional)</span>
            </label>
            <textarea
              id="new-task-description"
              rows={3}
              placeholder="Add details, links, or context"
              className="w-full resize-none rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
              {...register("description")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-muted">
              Estimated time{" "}
              <span className="text-text-muted/60">(optional)</span>
            </span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  id="new-task-est-hours"
                  aria-label="Estimated hours"
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
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
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
}
