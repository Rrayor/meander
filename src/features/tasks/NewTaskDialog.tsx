import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
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
import {
  ButtonVariant,
  CarryOverRule,
  TaskStatus,
  carryOverToWire,
} from "@/lib/enums";
import {
  CANCEL_BUTTON_LABEL,
  CLOSE_LABEL,
  CREATE_TASK_LABEL,
  DESCRIPTION_PLACEHOLDER,
  NEW_TASK_HEADING,
  TITLE_PLACEHOLDER,
} from "@/lib/labels";
import { unicodeTrim } from "@/lib/utils";
import { FormDialog } from "@/shared/patterns/FormDialog";
import { Button } from "@/shared/ui/Button";

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

// FormDialog's footer row renders outside the body slot, so the submit
// button associates with the form by id rather than by nesting.
const NEW_TASK_FORM_ID = "new-task-form";
// Title input id owned by TaskFormFields (`{idPrefix}-title-input`) —
// the open-focus target below resolves it.
const NEW_TASK_TITLE_INPUT_ID = "new-task-title-input";

interface NewTaskDialogProps {
  onClose: () => void;
}

// Chrome parity comes from the parts: Escape/outside-press dismissal and
// the focus trap are Dialog behavior (the hand-rolled backdrop button and
// document keydown listener are gone). Escape pressed inside the open
// category dropdown still closes only the dropdown — the multiselect
// stopPropagation()s the keydown before it reaches the Dialog's document
// listener.
export function NewTaskDialog({ onClose }: Readonly<NewTaskDialogProps>) {
  const queryClient = useQueryClient();
  const [categories, setCategories] = useState<Category[]>([]);
  const [series, setSeries] = useState<NewSeries | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  // Once the create retried task is linked to a series its schedule is no
  // longer editable here — same rule as the edit dialog (series editing is
  // a later milestone).
  const [linkedToSeries, setLinkedToSeries] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { carryOver: CarryOverRule.Ask },
  });

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

  // The caller mounts this dialog conditionally, so `open` is constant.
  // Focus lands on the title field on open (standard modal behavior —
  // FocusManager owns the mechanism now, not a post-mount setFocus).
  return (
    <FormDialog
      open
      onClose={onClose}
      title={NEW_TASK_HEADING}
      closeLabel={CLOSE_LABEL}
      initialFocus={() => document.getElementById(NEW_TASK_TITLE_INPUT_ID)}
      footer={
        <>
          {/* mousedown preventDefault keeps focus in the field on press —
              otherwise the blur's onTouched validation mounts an alert
              mid-gesture and the footer slides out from under the
              pointer, eating the click. */}
          <Button
            type="button"
            variant={ButtonVariant.Ghost}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClose}
          >
            {CANCEL_BUTTON_LABEL}
          </Button>
          <Button
            type="submit"
            form={NEW_TASK_FORM_ID}
            onMouseDown={(e) => e.preventDefault()}
            disabled={create.isPending || seriesError !== null}
          >
            {CREATE_TASK_LABEL}
          </Button>
        </>
      }
    >
      <form
        id={NEW_TASK_FORM_ID}
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
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
      </form>
    </FormDialog>
  );
}
