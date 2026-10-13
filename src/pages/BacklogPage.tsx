import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { QUERY_KEYS } from "@/api/queryKeys";
import { listTasks, moveTask } from "@/api/tasks";
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

function TaskRow({ task }: Readonly<{ task: Task }>) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: task.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center justify-between gap-3 rounded-md px-3 py-2 transition-colors duration-150 ease-out hover:bg-surface-raised"
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          aria-label={`Reorder ${task.title}`}
          className="cursor-grab touch-none rounded p-0.5 text-text-muted hover:text-text focus:outline-none focus:ring-1 focus:ring-primary active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </button>
        <span className="truncate text-sm font-medium text-text">
          {task.title}
        </span>
      </div>
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
  );
}

export function BacklogPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const { data: tasks, error } = useQuery({
    queryKey: QUERY_KEYS.tasks,
    queryFn: listTasks,
  });
  const move = useMutation({
    mutationFn: ({
      taskId,
      beforeId,
      afterId,
    }: {
      taskId: number;
      beforeId: number | null;
      afterId: number | null;
    }) => moveTask(taskId, beforeId, afterId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
    },
  });

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!tasks || !over || active.id === over.id) {
      return;
    }
    const ids = tasks.map((t) => t.id);
    const target = arrayMove(
      ids,
      ids.indexOf(Number(active.id)),
      ids.indexOf(Number(over.id)),
    );
    const at = target.indexOf(Number(active.id));
    const previous = queryClient.getQueryData<Task[]>(QUERY_KEYS.tasks);
    if (previous) {
      const byId = new Map(previous.map((t) => [t.id, t]));
      queryClient.setQueryData(
        QUERY_KEYS.tasks,
        target.map((id) => byId.get(id)!),
      );
    }
    move.mutate({
      taskId: Number(active.id),
      beforeId: at > 0 ? target[at - 1] : null,
      afterId: at < target.length - 1 ? target[at + 1] : null,
    });
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
        {tasks?.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-text-muted">
              No tasks yet — created tasks will appear here.
            </p>
          </div>
        )}
        {tasks && tasks.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={tasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-1">
                {tasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </section>
      {dialogOpen && <NewTaskDialog onClose={() => setDialogOpen(false)} />}
    </>
  );
}
