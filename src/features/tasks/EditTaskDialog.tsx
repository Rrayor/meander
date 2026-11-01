import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PenLine } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { listTaskCategories } from "@/api/categories";
import { QUERY_KEYS } from "@/api/queryKeys";
import type { Task } from "@/api/tasks";
import { serverErrorMessage } from "@/lib/errors";
import type { NewSeries } from "@/api/bindings";
import { DialogMode, TaskScope } from "@/lib/enums";
import type { SaveScope } from "@/lib/enums";
import {
  listSeriesCategories,
  listSeriesInstances,
  listTaskSeries,
  skippedSeriesDates,
} from "@/api/series";
import {
  CLOSE_LABEL,
  EDIT_BUTTON_LABEL,
  EDIT_TASK_HEADING,
} from "@/lib/labels";
import { FormDialog } from "@/shared/patterns/FormDialog";
import { IconButton } from "@/shared/ui/IconButton";

import { DeleteConfirmPanel } from "./edit-dialog/DeleteConfirmPanel";
import { EditTaskForm } from "./edit-dialog/EditTaskForm";
import { TaskDetailsView } from "./edit-dialog/TaskDetailsView";
import {
  useEditTaskActions,
  useMaterializeInstance,
  usePendingSegment,
  useScopedCategories,
  useSeriesScopeSeed,
} from "./edit-dialog/hooks";
import { defaultsFor, schema } from "./edit-dialog/utils";
import type { FormValues } from "./edit-dialog/utils";

interface EditTaskDialogProps {
  task: Task;
  onClose: () => void;
}

export function EditTaskDialog({
  task,
  onClose,
}: Readonly<EditTaskDialogProps>) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<DialogMode>(DialogMode.View);

  // Which instance the read-only view is showing — the opened task until
  // the calendar picks a different date. `pendingIso` marks a picked
  // scheduled date whose instance is still being materialized (or whose
  // creation failed); while set, the fields give way to the status panel.
  const [viewed, setViewed] = useState<Task>(task);
  const [pendingIso, setPendingIso] = useState<string | null>(null);
  // Set when the Edit click should start edit mode once the pending
  // instance materializes.
  const editAfterMaterialize = useRef(false);

  const instanceDefaults = useMemo(() => defaultsFor(viewed), [viewed]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: instanceDefaults,
  });
  const {
    setFocus,
    reset,
    getValues,
    formState: { dirtyFields },
  } = form;

  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The view mode has no field to focus — the popup itself takes
    // initialFocus below; entering edit mode focuses the title like the
    // hand-rolled setFocus-on-open did (post-mount, so no FocusManager
    // race).
    if (mode === DialogMode.Edit) {
      setFocus("title");
    }
  }, [mode, setFocus]);

  const { data: initialCategories } = useQuery({
    queryKey: QUERY_KEYS.taskCategories(viewed.id),
    queryFn: () => listTaskCategories(viewed.id),
  });
  const { data: taskSeries } = useQuery({
    queryKey: QUERY_KEYS.taskSeries,
    queryFn: listTaskSeries,
    enabled: task.series_id !== null,
  });
  const viewedSeries = taskSeries?.find((s) => s.id === viewed.series_id);
  // The living continuation of a segmented series: saves, seeds, and
  // materialization always target it, never an earlier segment.
  const livingSeriesId =
    viewedSeries?.succeeded_by ?? viewed.series_id ?? task.series_id;
  const seriesRow = taskSeries?.find((s) => s.id === livingSeriesId);
  // Every segment of the conceptual series — the living row plus the
  // earlier segments — so the calendar shows the full schedule.
  const skippedDates = useQuery({
    queryKey: QUERY_KEYS.seriesSkipped(livingSeriesId ?? -1),
    queryFn: () => skippedSeriesDates(livingSeriesId ?? -1),
    enabled: livingSeriesId != null,
  }).data;
  const familySegments = taskSeries?.filter(
    (s) =>
      livingSeriesId !== null &&
      (s.id === livingSeriesId || s.succeeded_by === livingSeriesId),
  );
  const { pendingSegment, pendingCats } = usePendingSegment(
    familySegments,
    pendingIso,
  );
  const viewTitle =
    pendingIso !== null
      ? ((pendingSegment ?? seriesRow)?.title ?? viewed.title)
      : viewed.title;
  const { data: seriesInstances } = useQuery({
    queryKey: QUERY_KEYS.seriesInstances(viewed.series_id!),
    queryFn: () => listSeriesInstances(viewed.series_id!),
    enabled: viewed.series_id !== null,
  });
  // Save scope: instance edits today's task; series writes the shared
  // fields + schedule + categories onto the series and every instance.
  const [saveScope, setSaveScope] = useState<SaveScope>(TaskScope.Instance);
  const { data: seriesCats, error: seriesCatsError } = useQuery({
    queryKey: QUERY_KEYS.seriesCategories(livingSeriesId!),
    queryFn: () => listSeriesCategories(livingSeriesId!),
    // Also fetched in view mode: a pending (unpersisted) occurrence
    // displays the living series' categories.
    enabled: livingSeriesId !== null,
  });
  // The series-scope schedule draft: null = untouched (use the stored
  // schedule), cleared = the user collapsed the section (a series needs a
  // schedule — saving is disabled until one exists again).
  const [seriesDraft, setSeriesDraft] = useState<NewSeries | null>(null);
  const [seriesCleared, setSeriesCleared] = useState(false);
  const [seriesDraftError, setSeriesDraftError] = useState<string | null>(null);
  useSeriesScopeSeed({
    saveScope,
    seriesRow,
    reset,
    getValues,
    dirtyFields,
    instanceDefaults,
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteScope, setDeleteScope] = useState<TaskScope>(TaskScope.Instance);
  const [series, setSeries] = useState<NewSeries | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const { categories, stored, onCategoriesChange } = useScopedCategories({
    saveScope,
    seriesId: livingSeriesId,
    viewedId: viewed.id,
    seriesCats,
    initialCategories,
  });

  const {
    update,
    moveToBacklog,
    schedule,
    updateSeries,
    updateSeriesFrom,
    remove,
    submit,
    invalidateSeriesScope,
  } = useEditTaskActions({
    queryClient,
    viewed,
    pendingIso,
    livingSeriesId,
    categories,
    stored,
    series,
    seriesDraft,
    seriesRow,
    saveScope,
    deleteScope,
    onClose,
  });

  // Picking a scheduled-but-unpersisted date materializes its instance in
  // the background (spec: the instance exists once the user wants to edit
  // it). The pick stays pending until the row arrives, then the view swaps
  // to it — on failure the date keeps the pending panel plus the error.
  const materialize = useMaterializeInstance({
    queryClient,
    viewedSeriesId: viewed.series_id,
    editAfterMaterializeRef: editAfterMaterialize,
    onMaterialized: (created) => {
      setViewed(created);
      setPendingIso(null);
      invalidateSeriesScope();
    },
    startEditing: (created) => {
      reset(defaultsFor(created));
      setMode(DialogMode.Edit);
    },
  });

  // The category error only belongs to series scope — a failed load
  // shouldn't linger on the instance form after switching back.
  const serverError = serverErrorMessage(
    update.error ??
      updateSeries.error ??
      updateSeriesFrom.error ??
      (saveScope !== TaskScope.Instance ? seriesCatsError : null),
  );
  // While the series row is loading, the shared fields still hold the
  // opened instance's values — editing them before the seed lands would
  // lose the input to the reset. They stay disabled until it arrives.
  const seriesFieldsPending =
    saveScope !== TaskScope.Instance && seriesRow === undefined;
  // A series save needs a schedule: the stored one (untouched draft) or a
  // valid edited one — collapsing the section disables saving. It also
  // waits for the series category query: submitting before it resolves
  // would send an empty set and erase every instance's associations, and
  // a failed load is surfaced instead of treated as "no categories".
  const seriesSaveBlocked =
    saveScope !== TaskScope.Instance &&
    (seriesRow === undefined ||
      seriesCats === undefined ||
      seriesCleared ||
      seriesDraftError !== null);

  const handleEditIntent = () => {
    if (pendingIso !== null) {
      // Edit intent on a scheduled-only date is what materializes the
      // instance (spec §231).
      editAfterMaterialize.current = true;
      // The producing segment owns the row — a pre-cutoff date belongs
      // to an earlier segment, not the living series.
      materialize.mutate({
        iso: pendingIso,
        seriesId: pendingSegment?.id ?? livingSeriesId!,
      });
      return;
    }
    // Seed the form from the viewed instance — it may not be the task
    // the dialog opened on.
    reset(instanceDefaults);
    setMode(DialogMode.Edit);
  };

  // Escape/outside-press dismissal and the focus trap are Dialog
  // behavior via FormDialog; the caller mounts the dialog conditionally,
  // so `open` is constant. In view mode the popup itself takes
  // initialFocus — there is no field to land on.
  return (
    <FormDialog
      open
      onClose={onClose}
      title={mode === DialogMode.View ? viewTitle : EDIT_TASK_HEADING}
      closeLabel={CLOSE_LABEL}
      popupRef={dialogRef}
      initialFocus={() => dialogRef.current ?? true}
      headerActions={
        mode === DialogMode.View ? (
          <IconButton
            icon={PenLine}
            label={EDIT_BUTTON_LABEL}
            onClick={handleEditIntent}
          />
        ) : undefined
      }
    >
      {mode === DialogMode.View ? (
        <TaskDetailsView
          viewed={viewed}
          pendingIso={pendingIso}
          materializing={materialize.isPending}
          materializeError={serverErrorMessage(materialize.error)}
          categories={pendingIso !== null ? (pendingCats ?? []) : categories}
          seriesRow={seriesRow}
          pendingSegment={pendingSegment}
          seriesSegments={familySegments}
          skippedDates={skippedDates}
          seriesInstances={seriesInstances}
          onPick={(picked, iso) => {
            if (picked) {
              setViewed(picked);
              setPendingIso(null);
            } else {
              // Viewing alone must not write: materialize only on an
              // explicit edit of the scheduled-only date (spec §231).
              setPendingIso(iso);
            }
          }}
          onClose={onClose}
          onMoveToBacklog={() => moveToBacklog.mutate()}
          moveError={serverErrorMessage(moveToBacklog.error)}
          onSchedule={(date) => schedule.mutate(date)}
          scheduleError={serverErrorMessage(schedule.error)}
          onDelete={() => {
            setDeleteScope(TaskScope.Instance);
            setConfirmingDelete(true);
          }}
          deletePrompt={
            confirmingDelete ? (
              <DeleteConfirmPanel
                isSeries={task.series_id !== null}
                pendingIso={pendingIso}
                scheduledDate={viewed.scheduled_date}
                deleteScope={deleteScope}
                error={serverErrorMessage(remove.error)}
                deleting={remove.isPending}
                onScopeChange={setDeleteScope}
                onCancel={() => setConfirmingDelete(false)}
                onConfirm={() => remove.mutate()}
              />
            ) : null
          }
        />
      ) : (
        <EditTaskForm
          form={form}
          task={task}
          viewedDate={viewed.scheduled_date}
          categories={categories}
          saveScope={saveScope}
          seriesRow={seriesRow}
          seriesError={seriesError}
          serverError={serverError}
          seriesFieldsPending={seriesFieldsPending}
          seriesSaveBlocked={seriesSaveBlocked}
          submitting={
            update.isPending ||
            updateSeries.isPending ||
            updateSeriesFrom.isPending
          }
          onScopeChange={setSaveScope}
          onAttachSchedule={(next, error) => {
            setSeries(next);
            setSeriesError(error);
          }}
          onDraftSchedule={(next, error) => {
            setSeriesDraft(next);
            setSeriesCleared(next === null);
            setSeriesDraftError(error);
          }}
          onCategoriesChange={onCategoriesChange}
          onSubmit={submit}
          onClose={onClose}
        />
      )}
    </FormDialog>
  );
}
