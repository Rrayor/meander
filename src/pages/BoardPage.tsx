import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { cn } from "cn";
import { useState } from "react";

import type { Category, Task } from "@/api/bindings";
import { listTaskCategories } from "@/api/categories";
import { currentProfile, globalThreshold, weekStart } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import { currentDatabasePath } from "@/api/settings";
import { boardMove, listPendingCarryOver, listWeekTasks } from "@/api/tasks";
import { BoardHeader } from "@/features/board/BoardHeader";
import { CarryOverPrompt } from "@/features/board/CarryOverPrompt";
import { ViewToolbar } from "@/features/board/ViewToolbar";
import { WeekColumns } from "@/features/board/WeekColumns";
import { decodeCellId, taskTotals } from "@/features/board/boardGrid";
import { EditTaskDialog } from "@/features/tasks/EditTaskDialog";
import { NewTaskDialog } from "@/features/tasks/NewTaskDialog";
import {
  BoardLayout,
  ButtonVariant,
  ComponentSize,
  TaskPlacement,
  TaskSort,
  TaskStatus,
  Weekday,
} from "@/lib/enums";
import { BOARD_SAVING_LABEL, TRANSPOSE_LAYOUT_LABEL } from "@/lib/labels";
import { serverErrorMessage } from "@/lib/errors";
import { errorMessage, todayLocalIso, weekDates } from "@/lib/utils";
import { Button } from "@/shared/ui/Button";
import { ERROR_TEXT } from "@/shared/ui/styles";

const layoutKey = (dbPath: string | undefined, profileId: number | undefined) =>
  `meander.boardLayout.${dbPath ?? "?"}.${profileId ?? 0}`;

// Spec §312–§316: 8 columns — the standing weekly backlog plus seven
// weekday columns anchored at the configured week start — and three
// state rows whose heights follow their contents. The page owns the
// route-level state (viewed week, view filters, layout orientation,
// dialogs) and the board-move mutation; rendering lives in
// features/board.
export function BoardPage() {
  const [editingTask, setEditingTask] = useState<Task>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TaskSort>(TaskSort.Manual);
  const todayIso = todayLocalIso();
  const [anchor, setAnchor] = useState(todayIso);

  const { data: start, error: startError } = useQuery({
    queryKey: QUERY_KEYS.weekStart,
    queryFn: weekStart,
  });
  const days = weekDates(anchor, start ?? Weekday.Monday);
  const { data: threshold, error: thresholdError } = useQuery({
    queryKey: QUERY_KEYS.globalThreshold,
    queryFn: globalThreshold,
  });
  const { data: tasks, error: weekError } = useQuery({
    queryKey: QUERY_KEYS.boardWeek(days[0]),
    queryFn: () => listWeekTasks(days[0]),
  });
  const error = startError ?? weekError ?? thresholdError;
  const isCurrentWeek =
    days[0] === weekDates(todayIso, start ?? Weekday.Monday)[0];

  // null column = the weekly backlog bucket, a standing container of
  // current state — rendered only on the current week's board
  // (spec §336/§348/§354), never on past or future weeks.
  // The carry-over prompt only ever opens on the current week's board.
  const { data: pending } = useQuery({
    queryKey: QUERY_KEYS.pendingCarryOver,
    queryFn: listPendingCarryOver,
    enabled: isCurrentWeek,
  });
  const columns: (string | null)[] = isCurrentWeek ? [null, ...days] : days;

  const sensors = useSensors(
    // A small distance keeps plain clicks opening the dialog while a
    // real drag gesture takes over.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  // §368 — the orientation is a per-profile setting, persisted so
  // the choice survives restarts without leaking between profiles.
  const { data: profile } = useQuery({
    queryKey: QUERY_KEYS.currentProfile,
    queryFn: currentProfile,
  });
  const { data: dbPath } = useQuery({
    queryKey: QUERY_KEYS.dbPath,
    queryFn: currentDatabasePath,
  });
  const [transposed, setTransposed] = useState(false);
  // Seed from storage when the profile id resolves — React's
  // documented adjust-state-during-render alternative to an
  // effect-side setState; switching profiles re-reads that
  // profile's own saved orientation.
  const [layoutFor, setLayoutFor] = useState<number | undefined>(undefined);
  if (
    profile !== undefined &&
    dbPath !== undefined &&
    layoutFor !== profile?.id
  ) {
    setLayoutFor(profile?.id);
    setTransposed(
      localStorage.getItem(layoutKey(dbPath, profile?.id)) ===
        BoardLayout.DayRows,
    );
  }
  const toggleLayout = () =>
    setTransposed((t) => {
      const next = !t;
      localStorage.setItem(
        layoutKey(dbPath, profile?.id),
        next ? BoardLayout.DayRows : BoardLayout.StatusRows,
      );
      return next;
    });

  // Task→category associations ride the same query keys as the card
  // chips, so this dedupes against them rather than adding a new read.
  const categoryQueries = useQueries({
    queries: (tasks ?? []).map((t) => ({
      queryKey: QUERY_KEYS.taskCategories(t.id),
      queryFn: () => listTaskCategories(t.id),
    })),
  });
  const taskCategories = new Map<number, Category[]>(
    (tasks ?? []).map((t, i) => [t.id, categoryQueries[i]?.data ?? []]),
  );
  const categoryError = categoryQueries.find((q) => q.error)?.error;
  const boardError = error ?? categoryError ?? null;

  const queryClient = useQueryClient();
  const move = useMutation({
    mutationFn: ({
      taskId,
      placement,
      date,
      status,
    }: {
      taskId: number;
      placement: TaskPlacement;
      date: string | null;
      status: TaskStatus;
    }) => boardMove(taskId, placement, date, status),
    onMutate: async ({ taskId, placement, date, status }) => {
      // §451: optimistic — the card relocates the moment it drops;
      // the query refetches to confirm.
      await queryClient.cancelQueries({
        queryKey: QUERY_KEYS.boardWeek(days[0]),
      });
      queryClient.setQueryData<Task[]>(QUERY_KEYS.boardWeek(days[0]), (old) =>
        (old ?? []).map((t) =>
          t.id === taskId
            ? {
                ...t,
                placement,
                scheduled_date: date,
                status,
              }
            : t,
        ),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.boardWeeks,
      });
    },
  });

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const { date, status, placement } = decodeCellId(String(over.id));
    const task = tasks?.find((t) => t.id === active.id);
    if (!task) return;
    if (
      task.placement === placement &&
      task.scheduled_date === date &&
      task.status === status
    ) {
      return;
    }
    move.mutate({ taskId: task.id, placement, date, status });
  };

  return (
    <>
      <BoardHeader
        week={days}
        anchorIso={anchor}
        weekStart={start ?? Weekday.Monday}
        isCurrentWeek={isCurrentWeek}
        totals={taskTotals(tasks ?? [])}
        onNavigate={setAnchor}
        onAddTask={() => setDialogOpen(true)}
      />
      {(boardError != null || move.isError) && (
        <p role="alert" className={cn("px-6 pt-4", ERROR_TEXT)}>
          {serverErrorMessage(boardError ?? move.error) ??
            errorMessage(boardError ?? move.error)}
        </p>
      )}
      {/* §451: drops move instantly — a status line announces the
          save in flight so a relocating card never looks silent. */}
      {move.isPending && (
        <output className="px-6 pt-4 text-sm text-text-muted">
          {BOARD_SAVING_LABEL}
        </output>
      )}
      <ViewToolbar
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
      />
      <Button
        type="button"
        variant={ButtonVariant.Secondary}
        size={ComponentSize.Sm}
        aria-label={TRANSPOSE_LAYOUT_LABEL}
        aria-pressed={transposed}
        disabled={profile === undefined || dbPath === undefined}
        onClick={toggleLayout}
        className="mx-6 mt-3 w-fit px-2 py-1 text-xs font-normal text-text-muted"
      >
        {TRANSPOSE_LAYOUT_LABEL}
      </Button>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable regions need tabIndex=0 so keyboard users can scroll them (axe scrollable-region-focusable) */}
      <section tabIndex={0} className="flex-1 overflow-auto p-6">
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <WeekColumns
            columns={columns}
            transposed={transposed}
            tasks={tasks ?? []}
            query={query}
            sort={sort}
            threshold={threshold}
            taskCategories={taskCategories}
            onOpenTask={setEditingTask}
          />
        </DndContext>
      </section>
      {isCurrentWeek && !promptDismissed && (pending?.length ?? 0) > 0 && (
        <CarryOverPrompt
          tasks={pending ?? []}
          onDone={() => setPromptDismissed(true)}
        />
      )}
      {editingTask && (
        <EditTaskDialog
          task={editingTask}
          onClose={() => setEditingTask(undefined)}
        />
      )}
      {dialogOpen && <NewTaskDialog onClose={() => setDialogOpen(false)} />}
    </>
  );
}
