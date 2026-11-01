import { useMutation, useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type {
  FieldNamesMarkedBoolean,
  UseFormGetValues,
  UseFormReset,
} from "react-hook-form";

import { addTaskCategory, removeTaskCategory } from "@/api/categories";
import type { Category } from "@/api/categories";
import { QUERY_KEYS } from "@/api/queryKeys";
import { returnTaskToBacklog, scheduleTask, updateTask } from "@/api/tasks";
import type { Task } from "@/api/tasks";
import type { NewSeries, TaskSeries, UpdateSeries } from "@/api/bindings";
import {
  getOrCreateInstance,
  listSeriesCategories,
  scheduleOccurrence,
  updateTaskSeries,
  updateTaskSeriesFrom,
} from "@/api/series";
import { CarryOverRule, TaskScope, carryOverToWire } from "@/lib/enums";
import type { SaveScope } from "@/lib/enums";
import { isScheduledOn } from "@/lib/recurrence";
import { unicodeTrim } from "@/lib/utils";
import { durationPartsToMinutes } from "@/features/tasks/formSchema";

import {
  SHARED_FORM_FIELDS,
  deleteForScope,
  invalidateSeriesQueries,
  minutesToParts,
  seriesUpdatePayload,
} from "./utils";
import type { FormValues } from "./utils";

// The segment that produces a pending picked date — a pre-cutoff date
// belongs to an earlier segment and shows its values, not the living
// series' — plus that segment's categories.
export function usePendingSegment(
  familySegments: TaskSeries[] | undefined,
  pendingIso: string | null,
) {
  const pendingSegment =
    pendingIso !== null
      ? familySegments?.find((s) =>
          isScheduledOn(s.recurrence, s.start_date, s.end_date, pendingIso),
        )
      : undefined;
  const { data: pendingCats } = useQuery({
    queryKey: QUERY_KEYS.seriesCategories(pendingSegment?.id ?? -1),
    queryFn: () => listSeriesCategories(pendingSegment!.id),
    enabled: pendingSegment !== undefined,
  });
  return { pendingSegment, pendingCats };
}

export function useMaterializeInstance({
  queryClient,
  viewedSeriesId,
  editAfterMaterializeRef,
  onMaterialized,
  startEditing,
}: {
  queryClient: QueryClient;
  viewedSeriesId: number | null;
  editAfterMaterializeRef: RefObject<boolean>;
  onMaterialized: (created: Task) => void;
  startEditing: (created: Task) => void;
}) {
  return useMutation({
    mutationFn: ({ iso, seriesId }: { iso: string; seriesId: number }) =>
      getOrCreateInstance(seriesId, iso),
    onSuccess: (created) => {
      onMaterialized(created);
      if (editAfterMaterializeRef.current) {
        editAfterMaterializeRef.current = false;
        startEditing(created);
      }
    },
    onError: () => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.seriesInstances(viewedSeriesId!),
      });
    },
  });
}

// Entering series scope reseeds the shared fields from the series — the
// form defaults hold the opened instance's values, which may be custom
// edits (spec §146: series scope edits the shared fields, not one
// instance's overrides). Leaving restores the instance's own values so a
// scope round-trip can't overwrite them. The ref guards against reseeding
// on a later refetch, which would clobber typed edits — and the shared
// controls stay disabled until the row arrives (seriesFieldsPending in
// the component) so nothing is typed before the seed lands.
export function useSeriesScopeSeed({
  saveScope,
  seriesRow,
  reset,
  getValues,
  dirtyFields,
  instanceDefaults,
}: {
  saveScope: SaveScope;
  seriesRow: TaskSeries | undefined;
  skippedDates?: string[];
  reset: UseFormReset<FormValues>;
  getValues: UseFormGetValues<FormValues>;
  dirtyFields: FieldNamesMarkedBoolean<FormValues>;
  instanceDefaults: FormValues;
}) {
  const seeded = useRef(false);
  useEffect(() => {
    // Values the user already typed survive a scope switch in either
    // direction — only untouched fields take the target scope's stored
    // values (series row for Series/Future, viewed row for Instance).
    // Per-instance fields (status, spent) are not shared and never
    // carry over — an invalid draft there must not follow into a series
    // save and block it.
    const values = getValues();
    const overlay: Partial<FormValues> = {};
    for (const key of SHARED_FORM_FIELDS) {
      if (dirtyFields[key] === true) {
        Object.assign(overlay, { [key]: values[key] });
      }
    }
    if (saveScope === TaskScope.Instance) {
      if (!seeded.current) return;
      seeded.current = false;
      reset({ ...instanceDefaults, ...overlay });
      return;
    }
    if (seeded.current || seriesRow === undefined) return;
    seeded.current = true;
    const seriesEstimate = minutesToParts(seriesRow.estimated_minutes);
    reset({
      ...instanceDefaults,
      title: seriesRow.title,
      description: seriesRow.description ?? "",
      estHours: seriesEstimate.hours,
      estMinutes: seriesEstimate.minutes,
      carryOver: (seriesRow.carry_over_rule ??
        CarryOverRule.Ask) as CarryOverRule,
      ...overlay,
    });
  }, [saveScope, seriesRow, reset, getValues, dirtyFields, instanceDefaults]);
}

// The selection is derived state: stored associations minus the chips the
// user removed plus the ones they added. Deriving it (rather than seeding
// state once) keeps picks intact when the query resolves late *and* lets
// a refetch update what chips show — e.g. after a category is recolored.
// Local category overrides belong to the viewed scope — keying the draft
// by scope+id means switching instances or scopes never carries a
// previous selection across.
export function useScopedCategories({
  saveScope,
  seriesId,
  viewedId,
  seriesCats,
  initialCategories,
}: {
  saveScope: SaveScope;
  seriesId: number | null;
  viewedId: number;
  seriesCats: Category[] | undefined;
  initialCategories: Category[] | undefined;
}) {
  const categoryKey =
    saveScope !== TaskScope.Instance
      ? `series-${seriesId}`
      : `task-${viewedId}`;
  const [categoryDraft, setCategoryDraft] = useState<{
    key: string;
    removedIds: ReadonlySet<number>;
    picked: Category[];
  }>({ key: categoryKey, removedIds: new Set(), picked: [] });
  const removedIds =
    categoryDraft.key === categoryKey
      ? categoryDraft.removedIds
      : new Set<number>();
  const picked = categoryDraft.key === categoryKey ? categoryDraft.picked : [];
  const stored =
    saveScope !== TaskScope.Instance
      ? (seriesCats ?? [])
      : (initialCategories ?? []);
  const storedIds = new Set(stored.map((c) => c.id));
  const categories = [
    ...stored.filter((c) => !removedIds.has(c.id)),
    ...picked.filter((c) => !storedIds.has(c.id)),
  ];
  const onCategoriesChange = (next: Category[]) => {
    const nextIds = new Set(next.map((c) => c.id));
    setCategoryDraft({
      key: categoryKey,
      removedIds: new Set(
        stored.filter((c) => !nextIds.has(c.id)).map((c) => c.id),
      ),
      picked: next.filter((c) => !storedIds.has(c.id)),
    });
  };
  return { categories, stored, onCategoriesChange };
}

// The dialog's write side: the mutations plus the submit mapping that
// routes values by save scope. Kept as one hook so the shell stays a
// wiring file.
export function useEditTaskActions({
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
}: {
  queryClient: QueryClient;
  viewed: Task;
  pendingIso: string | null;
  livingSeriesId: number | null;
  categories: Category[];
  stored: Category[];
  series: NewSeries | null;
  seriesDraft: NewSeries | null;
  seriesRow: TaskSeries | undefined;
  saveScope: SaveScope;
  deleteScope: TaskScope;
  onClose: () => void;
}) {
  const invalidateSeriesScope = () =>
    invalidateSeriesQueries(queryClient, viewed.series_id, livingSeriesId);

  const update = useMutation({
    mutationFn: async (input: Parameters<typeof updateTask>[1]) => {
      await updateTask(viewed.id, input);
      const next = new Set(categories.map((c) => c.id));
      const prev = new Set(stored.map((c) => c.id));
      await Promise.all([
        ...categories
          .filter((c) => !prev.has(c.id))
          .map((c) => addTaskCategory(viewed.id, c.id)),
        ...stored
          .filter((c) => !next.has(c.id))
          .map((c) => removeTaskCategory(viewed.id, c.id)),
      ]);
    },
    onSuccess: onClose,
    onSettled: () => {
      // Also on failure: update_task may have committed before a category
      // association rejected, so the list must reflect what was saved.
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.boardWeeks,
      });
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.taskCategories(viewed.id),
      });
    },
  });

  const moveToBacklog = useMutation({
    mutationFn: () => returnTaskToBacklog(viewed.id),
    onSuccess: onClose,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.boardWeeks,
      });
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.pendingCarryOver,
      });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.taskSeries });
    },
  });

  const schedule = useMutation({
    mutationFn: async (date: string) => {
      // A picked-but-unpersisted occurrence must exist before it can be
      // redated — otherwise the move has no row to land on (spec §228).
      if (pendingIso !== null) {
        return scheduleOccurrence(livingSeriesId!, pendingIso, date);
      }
      return scheduleTask(viewed.id, date);
    },
    onSuccess: onClose,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.boardWeeks,
      });
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.pendingCarryOver,
      });
      if (livingSeriesId != null) {
        void queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.seriesSkipped(livingSeriesId),
        });
      }
    },
  });

  const updateSeries = useMutation({
    mutationFn: (input: UpdateSeries) =>
      updateTaskSeries(livingSeriesId!, input),
    onSuccess: onClose,
    onSettled: invalidateSeriesScope,
  });

  const updateSeriesFrom = useMutation({
    mutationFn: ({
      fromDate,
      input,
    }: {
      fromDate: string;
      input: UpdateSeries;
    }) => updateTaskSeriesFrom(livingSeriesId!, fromDate, input),
    onSuccess: onClose,
    onSettled: invalidateSeriesScope,
  });

  // Delete runs against the *viewed* instance — picking another persisted
  // date in the calendar moves the target with it.
  const remove = useMutation({
    mutationFn: () =>
      deleteForScope({
        deleteScope,
        seriesId: livingSeriesId,
        taskId: viewed.id,
        scheduledDate: viewed.scheduled_date,
        pendingIso,
      }),
    onSuccess: onClose,
    onSettled: invalidateSeriesScope,
  });

  const submit = (values: FormValues) => {
    const shared = {
      title: values.title,
      description: unicodeTrim(values.description) || null,
      estimated_minutes: durationPartsToMinutes(
        values.estHours,
        values.estMinutes,
      ),
      carry_over_rule: carryOverToWire(values.carryOver),
    };
    if (saveScope !== TaskScope.Instance) {
      const payload = seriesUpdatePayload(
        shared,
        seriesDraft,
        seriesRow!,
        categories.map((c) => c.id),
      );
      // "This and future" splits the series at the viewed date; the
      // backend anchors the new series on fromDate (spec §146).
      if (saveScope === TaskScope.Future) {
        updateSeriesFrom.mutate({
          fromDate: viewed.scheduled_date!,
          input: payload,
        });
      } else {
        updateSeries.mutate(payload);
      }
      return;
    }
    update.mutate({
      ...shared,
      spent_minutes: durationPartsToMinutes(
        values.spentHours,
        values.spentMinutes,
      ),
      status: values.status,
      series,
    });
  };

  return {
    update,
    moveToBacklog,
    schedule,
    updateSeries,
    updateSeriesFrom,
    remove,
    submit,
    invalidateSeriesScope,
  };
}
