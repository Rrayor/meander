import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { QUERY_KEYS } from "@/api/queryKeys";
import { MAX_TASK_TITLE_LENGTH, createTask } from "@/api/tasks";

const ERROR_MESSAGES: Record<string, string> = {
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estHours, setEstHours] = useState("");
  const [estMinutes, setEstMinutes] = useState("");
  const [validationError, setValidationError] = useState<string>();

  const create = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      onClose();
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setValidationError(undefined);
    if (!title.trim()) {
      setValidationError(ERROR_MESSAGES["task title is required"]);
      return;
    }
    const hours = estHours.trim() === "" ? 0 : Number(estHours);
    const minutes = estMinutes.trim() === "" ? 0 : Number(estMinutes);
    if (
      !Number.isInteger(hours) ||
      !Number.isInteger(minutes) ||
      hours < 0 ||
      minutes < 0
    ) {
      setValidationError("Estimated time must be a positive whole number");
      return;
    }
    const total = hours * 60 + minutes;
    const hasEstimate = estHours.trim() !== "" || estMinutes.trim() !== "";
    create.mutate({
      title,
      description: description || null,
      estimated_minutes: hasEstimate ? total : null,
    });
  };

  const error =
    validationError ??
    (create.error
      ? (ERROR_MESSAGES[String(create.error)] ?? String(create.error))
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
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="new-task-title-input"
              className="text-xs font-medium text-text-muted"
            >
              Title *
            </label>
            <input
              id="new-task-title-input"
              autoFocus
              type="text"
              maxLength={MAX_TASK_TITLE_LENGTH}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Renew passport"
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none ring-primary placeholder:text-text-muted focus:border-primary focus:ring-1"
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details, links, or context"
              className="w-full resize-none rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
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
                  value={estHours}
                  onChange={(e) => setEstHours(e.target.value)}
                  placeholder="0"
                  className="w-20 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
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
                  value={estMinutes}
                  onChange={(e) => setEstMinutes(e.target.value)}
                  placeholder="0"
                  className="w-20 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
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
