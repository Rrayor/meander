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
import { CalendarPlus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { currentProfile } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import {
  ADD_TASK_LABEL,
  ADD_TO_WEEK_LABEL,
  EMPTY_BACKLOG_MESSAGE,
  STATUS_LABELS,
  addToWeekLabel,
  deleteTaskLabel,
  editTaskLabel,
  formatMinutes,
  reorderLabel,
} from "@/lib/labels";
import { errorMessage } from "@/lib/utils";
import { addTaskToWeek, deleteTask, listTasks, moveTask } from "@/api/tasks";
import type { Task } from "@/api/tasks";
import { DeleteButton } from "@/components/DeleteButton";
import { EditTaskDialog } from "@/features/tasks/EditTaskDialog";
import { NewTaskDialog } from "@/features/tasks/NewTaskDialog";
import { Pagination } from "@/features/pagination/Pagination";
import { usePagination } from "@/features/pagination/usePagination";

const STATUS_BADGE = {
  todo: "bg-surface-raised text-text-muted",
  in_progress: "bg-threshold-amber/15 text-threshold-amber",
  done: "bg-primary/15 text-primary",
} as const;

function TaskRow({
  task,
  onDelete,
  onEdit,
  onAddToWeek,
  deletePending,
}: Readonly<{
  task: Task;
  onDelete: () => void;
  onEdit: () => void;
  onAddToWeek: () => void;
  deletePending: boolean;
}>) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: task.id });

  return (
    // The row is clickable per the Stitch design (cursor-pointer + hover
    // tint); the title button carries the keyboard/AT affordance, so the
    // li's click handler is pointer-only by design.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- keyboard users reach the same action via the title's <button>
    <li
      ref={setNodeRef}
      onClick={onEdit}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="group flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 transition-colors duration-150 ease-out hover:bg-surface-raised"
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          aria-label={reorderLabel(task.title)}
          onClick={(e) => e.stopPropagation()}
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
        <button
          type="button"
          aria-label={editTaskLabel(task.title)}
          onClick={onEdit}
          className="min-w-0 cursor-pointer truncate rounded text-left text-sm font-medium text-text focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {task.title}
        </button>
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
        <button
          type="button"
          aria-label={addToWeekLabel(task.title)}
          title={ADD_TO_WEEK_LABEL}
          onClick={(e) => {
            e.stopPropagation();
            onAddToWeek();
          }}
          className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-raised hover:text-text focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <CalendarPlus size={16} aria-hidden="true" />
        </button>
        <DeleteButton
          label={deleteTaskLabel(task.title)}
          disabled={deletePending}
          onDelete={onDelete}
        />
      </div>
    </li>
  );
}

export function BacklogPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task>();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const { data: allTasks, error } = useQuery({
    queryKey: QUERY_KEYS.tasks,
    queryFn: listTasks,
  });
  // One backlog entry per series — the anchor row stands in for it.
  // Persisted later instances belong to the series, not the backlog.
  const anchorBySeries = new Map<number, number>();
  for (const t of allTasks ?? []) {
    if (t.series_id === null) continue;
    const current = anchorBySeries.get(t.series_id);
    if (current === undefined || t.id < current) {
      anchorBySeries.set(t.series_id, t.id);
    }
  }
  const tasks = allTasks?.filter(
    (t) => t.series_id === null || anchorBySeries.get(t.series_id) === t.id,
  );
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
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.boardWeeks,
      });
    },
  });

  const addToWeek = useMutation({
    mutationFn: addTaskToWeek,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.boardWeeks,
      });
    },
  });
  const del = useMutation({
    mutationFn: deleteTask,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.boardWeeks,
      });
    },
  });
  const { data: profile } = useQuery({
    queryKey: QUERY_KEYS.currentProfile,
    queryFn: currentProfile,
  });
  const { pageItems, page, pageCount, setPage } = usePagination(
    tasks,
    profile?.id,
  );
  // Failed mutations are scoped to the profile they ran under — reset on
  // a switch so alerts can't leak across. Only a transition between two
  // resolved ids counts: the first profile load must not clear an error
  // raised while it was still pending.
  const { reset: resetDelete } = del;
  const { reset: resetMove } = move;
  const lastProfileId = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (profile?.id == null) return;
    if (
      lastProfileId.current !== undefined &&
      lastProfileId.current !== profile.id
    ) {
      resetDelete();
      resetMove();
      // An open editor bound to the old profile's task must close —
      // submitting it now would hit the scoped update as TaskNotFound.
      // Guard by ownership: the new list can render before currentProfile
      // resolves, and an editor opened there belongs to this profile.
      setEditingTask((open) =>
        open && open.profile_id !== profile.id ? undefined : open,
      );
    }
    lastProfileId.current = profile.id;
  }, [profile?.id, resetDelete, resetMove]);

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
            {ADD_TASK_LABEL}
          </button>
        </div>
        {(error ?? addToWeek.error ?? del.error ?? move.error) && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(
              (error ?? addToWeek.error ?? del.error ?? move.error)!,
            )}
          </p>
        )}
        {tasks?.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-text-muted">{EMPTY_BACKLOG_MESSAGE}</p>
          </div>
        )}
        {tasks && tasks.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={pageItems!.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-1">
                {pageItems!.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    deletePending={del.isPending}
                    onDelete={() => del.mutate(task.id)}
                    onEdit={() => setEditingTask(task)}
                    onAddToWeek={() => addToWeek.mutate(task.id)}
                  />
                ))}
              </ul>
            </SortableContext>
            <Pagination page={page} pageCount={pageCount} onPage={setPage} />
          </DndContext>
        )}
      </section>
      {dialogOpen && <NewTaskDialog onClose={() => setDialogOpen(false)} />}
      {editingTask && (
        <EditTaskDialog
          task={editingTask}
          onClose={() => setEditingTask(undefined)}
        />
      )}
    </>
  );
}
