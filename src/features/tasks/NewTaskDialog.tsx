import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { addTaskCategory, removeTaskCategory } from "@/api/categories";
import type { Category } from "@/api/categories";
import { QUERY_KEYS } from "@/api/queryKeys";
import { createTask, updateTask } from "@/api/tasks";
import { DURATION_RANGE_MESSAGE, serverErrorMessage } from "@/lib/errors";
import { RepeatScheduleFields } from "@/features/tasks/RepeatScheduleFields";
import { TaskFormFields } from "@/features/tasks/TaskFormFields";
import {
  ESTIMATE_DURATION_FIELDS,
  durationPartsToMinutes,
  refineDurationRange,
  taskFieldSchemas,
} from "@/features/tasks/formSchema";
import type { NewSeries } from "@/api/bindings";
import { CarryOverRule, TaskStatus, carryOverToWire } from "@/lib/enums";
import {
  CANCEL_BUTTON_LABEL,
  CLOSE_DIALOG_LABEL,
  CLOSE_LABEL,
  CREATE_TASK_LABEL,
  DESCRIPTION_PLACEHOLDER,
  NEW_TASK_HEADING,
  TITLE_PLACEHOLDER,
} from "@/lib/labels";
import { unicodeTrim } from "@/lib/utils";

const schema = z
  .object(taskFieldSchemas)
  .superRefine(({ estHours, estMinutes }, ctx) => {
    refineDurationRange(
      estHours,
      estMinutes,
      ESTIMATE_DURATION_FIELDS,
      DURATION_RANGE_MESSAGE,
      ctx,
    );
  });

type FormValues = z.infer<typeof schema>;

interface NewTaskDialogProps {
  onClose: () => void;
}

export function NewTaskDialog({ onClose }: Readonly<NewTaskDialogProps>) {
  const queryClient = useQueryClient();
  const [categories, setCategories] = useState<Category[]>([]);
  const [series, setSeries] = useState<NewSeries | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  // Once the create retried task is linked to a series its schedule is no
  // longer editable here — same rule as the edit dialog (series editing is
  // a later milestone).
  const [linkedToSeries, setLinkedToSeries] = useState(false);

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
    setFocus,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { carryOver: CarryOverRule.Ask },
  });

  // Focus lands on the first field when the dialog opens — standard modal
  // behavior.
  useEffect(() => {
    setFocus("title");
  }, [setFocus]);

  // Set once create_task succeeds: a failed association leaves the task in
  // place, so a retry must reconcile with it — update the (possibly edited)
  // fields and diff the already-linked categories — never insert a
  // duplicate row. Refs keep the values consistent within the in-flight
  // mutation's own callbacks (a state update could lag behind them).
  const createdId = useRef<number | undefined>(undefined);
  const createdHasSeries = useRef(false);
  const linkedIds = useRef(new Set<number>());

  const create = useMutation({
    mutationFn: async (input: Parameters<typeof createTask>[0]) => {
      let task;
      if (createdId.current === undefined) {
        task = await createTask(input);
        createdId.current = task.id;
      } else {
        // Retry: persist the current field values onto the existing row. A
        // schedule can still be attached while the task is plain; once it is
        // linked, re-sending one would trip already_in_series — the section
        // is hidden by then anyway.
        task = await updateTask(createdId.current, {
          ...input,
          series: createdHasSeries.current ? null : input.series,
          spent_minutes: null,
          status: TaskStatus.Todo,
        });
      }
      if (task.series_id != null) {
        createdHasSeries.current = true;
        setLinkedToSeries(true);
        // The section unmounts now — a schedule edit made while the create
        // was in flight must not leave a stale error disabling the retry.
        setSeries(null);
        setSeriesError(null);
      }
      const taskId = task.id ?? createdId.current;
      const wanted = new Set(categories.map((c) => c.id));
      await Promise.all([
        ...categories
          .filter((c) => !linkedIds.current.has(c.id))
          .map((c) =>
            addTaskCategory(taskId, c.id).then(() =>
              linkedIds.current.add(c.id),
            ),
          ),
        ...[...linkedIds.current]
          .filter((id) => !wanted.has(id))
          .map((id) =>
            removeTaskCategory(taskId, id).then(() =>
              linkedIds.current.delete(id),
            ),
          ),
      ]);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.boardWeeks,
      });
      onClose();
    },
    onError: () => {
      // The task may already exist even though the mutation failed —
      // refresh the list so the backlog shows what was actually saved.
      if (createdId.current !== undefined) {
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
        void queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.boardWeeks,
        });
      }
    },
  });

  const onSubmit = ({
    title,
    description,
    estHours,
    estMinutes,
    carryOver,
  }: FormValues) => {
    create.mutate({
      title,
      description: unicodeTrim(description) || null,
      estimated_minutes: durationPartsToMinutes(estHours, estMinutes),
      carry_over_rule: carryOverToWire(carryOver),
      series,
    });
  };

  const serverError = serverErrorMessage(create.error);

  // The backdrop is a real button (pointer + keyboard dismiss) and the panel
  // a native <dialog>; Escape is handled by the document listener above.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={CLOSE_DIALOG_LABEL}
        onClick={onClose}
        tabIndex={-1}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60"
      />
      <dialog
        open
        aria-labelledby="new-task-title"
        className="relative m-0 flex max-h-[90vh] w-full max-w-lg flex-col gap-6 overflow-y-auto rounded-lg border border-border bg-surface p-6 text-text shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2
            id="new-task-title"
            className="font-title text-lg font-semibold text-text"
          >
            {NEW_TASK_HEADING}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={CLOSE_LABEL}
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
          <TaskFormFields
            idPrefix="new-task"
            register={register}
            control={control}
            errors={errors}
            categories={categories}
            onCategoriesChange={setCategories}
            titlePlaceholder={TITLE_PLACEHOLDER}
            descriptionPlaceholder={DESCRIPTION_PLACEHOLDER}
          />
          {!linkedToSeries && (
            <RepeatScheduleFields
              idPrefix="new-task"
              onChange={(next, error) => {
                setSeries(next);
                setSeriesError(error);
              }}
            />
          )}
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
              {CANCEL_BUTTON_LABEL}
            </button>
            <button
              type="submit"
              disabled={create.isPending || seriesError !== null}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-all hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            >
              {CREATE_TASK_LABEL}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
