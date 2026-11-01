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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { currentProfile } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import { addTaskToWeek, deleteTask, listTasks, moveTask } from "@/api/tasks";
import type { Task } from "@/api/tasks";
import { TaskRow } from "@/features/backlog/TaskRow";
import { matchesSearch, sortTasks } from "@/features/board/viewFilters";
import { ViewToolbar } from "@/features/board/ViewToolbar";
import { EditTaskDialog } from "@/features/tasks/EditTaskDialog";
import { NewTaskDialog } from "@/features/tasks/NewTaskDialog";
import { TaskSort } from "@/lib/enums";
import {
  ADD_TASK_LABEL,
  BACKLOG_HEADING,
  BACKLOG_SUBTITLE,
  EMPTY_BACKLOG_MESSAGE,
  PAGINATION_LABEL,
  PAGINATION_NEXT_LABEL,
  PAGINATION_PREVIOUS_LABEL,
  pageXOfYLabel,
} from "@/lib/labels";
import { errorMessage } from "@/lib/utils";
import { EmptyState } from "@/shared/patterns/EmptyState";
import { PageHeader } from "@/shared/patterns/PageHeader";
import { Paged } from "@/shared/patterns/Pagination";
import { Button } from "@/shared/ui/Button";
import { ERROR_TEXT } from "@/shared/ui/styles";

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
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TaskSort>(TaskSort.Manual);
  const scoped = allTasks?.filter(
    (t) => t.series_id === null || anchorBySeries.get(t.series_id) === t.id,
  );
  // View-time transforms only (spec §360/§364) — search narrows and
  // the pick reorders the slice; manual order stays the stored truth.
  // `tasks` stays undefined until the list resolves — an empty
  // array here would flash the empty state during loading.
  const tasks =
    scoped &&
    sortTasks(
      scoped.filter((t) => matchesSearch(t, query)),
      sort,
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
      <PageHeader title={BACKLOG_HEADING} description={BACKLOG_SUBTITLE} />
      <section className="flex-1 overflow-y-auto p-6">
        <div className="mb-4">
          <Button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="rounded-lg px-3 py-2 font-medium transition-colors duration-150 ease-out"
          >
            {ADD_TASK_LABEL}
          </Button>
        </div>
        {(error ?? addToWeek.error ?? del.error ?? move.error) && (
          <p role="alert" className={ERROR_TEXT}>
            {errorMessage(
              (error ?? addToWeek.error ?? del.error ?? move.error)!,
            )}
          </p>
        )}
        {/* The toolbar follows the unfiltered list — a search that
            yields nothing must not hide the control that produced it. */}
        {scoped && scoped.length > 0 && (
          <ViewToolbar
            query={query}
            onQuery={setQuery}
            sort={sort}
            onSort={setSort}
          />
        )}
        {tasks?.length === 0 && (
          <EmptyState title={EMPTY_BACKLOG_MESSAGE} className="h-full" />
        )}
        {tasks && tasks.length > 0 && (
          <Paged
            key={`${profile?.id}-${sort}-${query}`}
            items={tasks}
            navLabel={PAGINATION_LABEL}
            previousLabel={PAGINATION_PREVIOUS_LABEL}
            nextLabel={PAGINATION_NEXT_LABEL}
            formatPageIndicator={pageXOfYLabel}
          >
            {(pageItems) => (
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
                        sortLocked={sort !== TaskSort.Manual}
                        onAddToWeek={() => addToWeek.mutate(task.id)}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
          </Paged>
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
