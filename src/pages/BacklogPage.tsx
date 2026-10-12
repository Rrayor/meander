import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { QUERY_KEYS } from "@/api/queryKeys";
import { listTasks, reorderTasks } from "@/api/tasks";
import type { Task } from "@/api/tasks";
import { NewTaskDialog } from "@/features/tasks/NewTaskDialog";

const STATUS_LABELS = {
  todo: "Todo",
  in_progress: "In progress",
  done: "Done",
} as const;

const STATUS_BADGE = {
  todo: "bg-surface-raised text-text-muted",
  in_progress: "bg-threshold-amber/15 text-threshold-amber",
  done: "bg-primary/15 text-primary",
} as const;

const formatMinutes = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

export function BacklogPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: tasks, error } = useQuery({
    queryKey: QUERY_KEYS.tasks,
    queryFn: listTasks,
  });
  const reorder = useMutation({
    mutationFn: reorderTasks,
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.tasks });
      const previous = queryClient.getQueryData<Task[]>(QUERY_KEYS.tasks);
      if (previous) {
        const byId = new Map(previous.map((t) => [t.id, t]));
        queryClient.setQueryData(
          QUERY_KEYS.tasks,
          orderedIds.map((id) => byId.get(id)!),
        );
      }
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.tasks, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
    },
  });

  const dropOn = (event: React.DragEvent, target: Task) => {
    event.preventDefault();
    const draggedId = Number(event.dataTransfer.getData("text/plain"));
    if (!tasks || !Number.isFinite(draggedId)) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const belowMidpoint = event.clientY > rect.top + rect.height / 2;
    const ids = tasks.map((t) => t.id).filter((id) => id !== draggedId);
    const at = ids.indexOf(target.id) + (belowMidpoint ? 1 : 0);
    ids.splice(at, 0, draggedId);
    reorder.mutate(ids);
  };

  return (
    <>
      <header className="flex items-center border-b border-border px-6 py-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            Backlog
          </h1>
          <p className="text-sm text-text-muted">Tasks waiting to be planned</p>
        </div>
      </header>
      <section className="flex-1 overflow-y-auto p-6">
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary transition-colors duration-150 ease-out hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            Add task
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error instanceof Error ? error.message : String(error)}
          </p>
        )}
        {tasks && tasks.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-text-muted">
              No tasks yet — created tasks will appear here.
            </p>
          </div>
        )}
        {tasks && tasks.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-1">
            {tasks.map((task) => (
              <li
                key={task.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", String(task.id));
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => dropOn(e, task)}
                className="flex cursor-grab items-center justify-between gap-3 rounded-md px-3 py-2 transition-colors duration-150 ease-out hover:bg-surface-raised active:cursor-grabbing"
              >
                <span className="truncate text-sm font-medium text-text">
                  {task.title}
                </span>
                <div className="flex shrink-0 items-center gap-3">
                  {task.estimated_minutes != null && (
                    <span className="text-xs text-text-muted">
                      {formatMinutes(task.estimated_minutes)}
                    </span>
                  )}
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE[task.status]}`}
                  >
                    {STATUS_LABELS[task.status]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {dialogOpen && <NewTaskDialog onClose={() => setDialogOpen(false)} />}
    </>
  );
}
