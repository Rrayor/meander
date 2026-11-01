import { cn } from "cn";
import { Controller } from "react-hook-form";
import type { Control, UseFormReturn } from "react-hook-form";

import type { Category } from "@/api/categories";
import type { NewSeries, TaskSeries } from "@/api/bindings";
import type { Task } from "@/api/tasks";
import { RepeatScheduleFields } from "@/features/tasks/RepeatScheduleFields";
import { TaskFormFields } from "@/features/tasks/TaskFormFields";
import type { TaskFormValues } from "@/features/tasks/formSchema";
import { ButtonVariant, TaskScope, TaskStatus } from "@/lib/enums";
import type { SaveScope } from "@/lib/enums";
import {
  CANCEL_BUTTON_LABEL,
  OPTIONAL_FIELD_LABEL,
  SAVE_BUTTON_LABEL,
  SPENT_HOURS_LABEL,
  SPENT_MINUTES_LABEL,
  SPENT_TIME_LABEL,
  STATUS_LABELS,
  TASK_STATUS_FIELD_LABEL,
  auditTimestampsLabel,
} from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { DurationField } from "@/shared/patterns/DurationField";
import { Button } from "@/shared/ui/Button";
import { Fieldset } from "@/shared/ui/Fieldset";
import { RadioGroup } from "@/shared/ui/RadioGroup";

import { SaveScopeFieldset } from "./SaveScopeFieldset";
import { lockedStartFor } from "./utils";
import type { FormValues } from "./utils";

interface EditTaskFormProps {
  form: UseFormReturn<FormValues>;
  task: Task;
  viewedDate: string | null;
  categories: Category[];
  saveScope: SaveScope;
  seriesRow: TaskSeries | undefined;
  skippedDates?: string[];
  seriesError: string | null;
  serverError: string | null | undefined;
  seriesFieldsPending: boolean;
  seriesSaveBlocked: boolean;
  submitting: boolean;
  onScopeChange: (scope: SaveScope) => void;
  onAttachSchedule: (next: NewSeries | null, error: string | null) => void;
  onDraftSchedule: (next: NewSeries | null, error: string | null) => void;
  onCategoriesChange: (next: Category[]) => void;
  onSubmit: (values: FormValues) => void;
  onClose: () => void;
}

export function EditTaskForm({
  form,
  task,
  viewedDate,
  categories,
  saveScope,
  seriesRow,
  seriesError,
  serverError,
  seriesFieldsPending,
  seriesSaveBlocked,
  submitting,
  onScopeChange,
  onAttachSchedule,
  onDraftSchedule,
  onCategoriesChange,
  onSubmit,
  onClose,
}: Readonly<EditTaskFormProps>) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = form;
  const spentError = errors.spentHours?.message ?? errors.spentMinutes?.message;
  // Status and spent time stay per-instance — the series row doesn't
  // carry them, so a series save can't apply them and the controls are
  // disabled outside the instance scope.
  const instanceFieldsDisabled = saveScope !== TaskScope.Instance;
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <TaskFormFields
        idPrefix="edit-task"
        register={register}
        // Boundary cast: FormValues is a strict superset of
        // TaskFormValues — the block only reads the shared fields, but
        // Control's internals are invariant under RHF's types.
        control={control as unknown as Control<TaskFormValues>}
        errors={errors}
        categories={categories}
        onCategoriesChange={onCategoriesChange}
        disabled={seriesFieldsPending}
        estimateCompanion={
          <DurationField
            label={`${SPENT_TIME_LABEL} ${OPTIONAL_FIELD_LABEL}`}
            idPrefix="edit-task-spent"
            names={{ hours: "spentHours", minutes: "spentMinutes" }}
            register={register}
            inputLabels={{
              hours: SPENT_HOURS_LABEL,
              minutes: SPENT_MINUTES_LABEL,
            }}
            error={spentError}
            errorId="edit-task-spent-error"
            disabled={instanceFieldsDisabled}
          />
        }
      >
        <Fieldset.Root className="flex flex-col gap-1.5">
          <Fieldset.Legend id="edit-task-status-label">
            {TASK_STATUS_FIELD_LABEL}
          </Fieldset.Legend>
          <Controller
            name="status"
            control={control}
            render={({ field }) => (
              <RadioGroup.Root
                aria-labelledby="edit-task-status-label"
                className={cn(
                  "gap-1 rounded-lg border border-border bg-surface-raised p-1",
                  instanceFieldsDisabled && "opacity-50",
                )}
                value={field.value}
                onValueChange={field.onChange}
                disabled={instanceFieldsDisabled}
              >
                {Object.values(TaskStatus).map((option) => (
                  <RadioGroup.Radio
                    key={option}
                    value={option}
                    // The group's own opacity-50 dims the radios already —
                    // the recipe's per-radio disabled dim must not stack
                    // on top of it.
                    className="flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium data-[disabled]:opacity-100 data-[checked]:bg-primary data-[checked]:text-on-primary data-[unchecked]:text-text-muted data-[unchecked]:hover:text-text"
                  >
                    {STATUS_LABELS[option]}
                  </RadioGroup.Radio>
                ))}
              </RadioGroup.Root>
            )}
          />
        </Fieldset.Root>
      </TaskFormFields>
      {task.series_id !== null && (
        <SaveScopeFieldset
          saveScope={saveScope}
          futureDisabled={viewedDate === null}
          onChange={onScopeChange}
        />
      )}
      {task.series_id === null && (
        <RepeatScheduleFields
          idPrefix="edit-task"
          onChange={(next, error) => {
            onAttachSchedule(next, error);
          }}
        />
      )}
      {task.series_id !== null &&
        saveScope !== TaskScope.Instance &&
        seriesRow !== undefined && (
          <RepeatScheduleFields
            // Remount per scope and anchor so switching scopes
            // reseeds and a different viewed date re-locks the
            // start at its cutoff.
            key={`${saveScope}-${viewedDate}`}
            idPrefix="edit-series"
            initial={{
              recurrence: seriesRow.recurrence,
              start_date: seriesRow.start_date,
              end_date: seriesRow.end_date,
            }}
            lockedStartDate={lockedStartFor(saveScope, viewedDate)}
            onChange={(next, error) => {
              onDraftSchedule(next, error);
            }}
          />
        )}
      {serverError && (
        <p role="alert" className="text-sm text-danger">
          {serverError}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-text-muted">
          {auditTimestampsLabel(
            formatDate(task.created_at),
            formatDate(task.updated_at),
          )}
        </p>
        <div className="flex gap-2">
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
            onMouseDown={(e) => e.preventDefault()}
            disabled={submitting || seriesError !== null || seriesSaveBlocked}
          >
            {SAVE_BUTTON_LABEL}
          </Button>
        </div>
      </div>
    </form>
  );
}
