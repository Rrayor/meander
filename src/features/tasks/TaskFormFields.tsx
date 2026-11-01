import { Controller } from "react-hook-form";
import type { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import type { ReactNode } from "react";

import type { Category } from "@/api/categories";
import { CategoryMultiSelect } from "@/features/categories/CategoryMultiSelect";
import type { TaskFormValues } from "@/features/tasks/formSchema";
import {
  CARRY_OVER_FIELD_LABEL,
  CARRY_OVER_OPTIONS,
  CATEGORIES_FIELD_LABEL,
  DESCRIPTION_FIELD_LABEL,
  ESTIMATED_HOURS_LABEL,
  ESTIMATED_MINUTES_LABEL,
  ESTIMATED_TIME_LABEL,
  OPTIONAL_FIELD_LABEL,
  TITLE_FIELD_LABEL,
  HOURS_UNIT_LABEL,
  MINUTES_UNIT_LABEL,
} from "@/lib/labels";
import { DurationField } from "@/shared/patterns/DurationField";
import { Field } from "@/shared/ui/Field";
import { Fieldset } from "@/shared/ui/Fieldset";
import { Input } from "@/shared/ui/Input";
import { RadioGroup } from "@/shared/ui/RadioGroup";
import { Textarea } from "@/shared/ui/Textarea";

interface TaskFormFieldsProps {
  /** Element-id prefix — `"new-task"` yields `new-task-title-input`,
      `new-task-estimate-error`, … (e2e selectors depend on these ids). */
  idPrefix: string;
  register: UseFormRegister<TaskFormValues>;
  control: Control<TaskFormValues>;
  errors: FieldErrors<TaskFormValues>;
  categories: Category[];
  onCategoriesChange: (next: Category[]) => void;
  /** Locks every field while the edit form waits on the series seed. */
  disabled?: boolean;
  titlePlaceholder?: string;
  descriptionPlaceholder?: string;
  /** Rendered beside the estimate in a two-column row — the edit form's
      spent pair. */
  estimateCompanion?: ReactNode;
  /** Inserted between the duration row and carry-over — the edit form's
      status radios. */
  children?: ReactNode;
}

// The field block shared by the new- and edit-task forms: title,
// description, categories, the h/min estimate pair, and the carry-over
// rule. The edit form injects its spent/status fields through
// `estimateCompanion`/`children`; the new form uses neither.
export function TaskFormFields({
  idPrefix,
  register,
  control,
  errors,
  categories,
  onCategoriesChange,
  disabled = false,
  titlePlaceholder,
  descriptionPlaceholder,
  estimateCompanion,
  children,
}: Readonly<TaskFormFieldsProps>) {
  // The pair shares one alert — matching the describedby wiring of the
  // hand-rolled inputs this replaces.
  const estimateError = errors.estHours?.message ?? errors.estMinutes?.message;
  const estimate = (
    <DurationField
      label={`${ESTIMATED_TIME_LABEL} ${OPTIONAL_FIELD_LABEL}`}
      idPrefix={`${idPrefix}-est`}
      names={{ hours: "estHours", minutes: "estMinutes" }}
      register={register}
      captions={{ hours: HOURS_UNIT_LABEL, minutes: MINUTES_UNIT_LABEL }}
      inputLabels={{
        hours: ESTIMATED_HOURS_LABEL,
        minutes: ESTIMATED_MINUTES_LABEL,
      }}
      error={estimateError}
      errorId={`${idPrefix}-estimate-error`}
      disabled={disabled}
    />
  );
  return (
    <>
      <Field.Root invalid={errors.title != null}>
        <Field.Label>{TITLE_FIELD_LABEL} *</Field.Label>
        <Field.Control
          // The new-task title is the one full-opacity placeholder —
          // FIELD_SURFACE defaults to /60 (see the migration note).
          render={<Input className="placeholder:text-text-muted" />}
          id={`${idPrefix}-title-input`}
          type="text"
          placeholder={titlePlaceholder}
          disabled={disabled}
          {...register("title")}
        />
        {errors.title != null && (
          <Field.Error match={true} id={`${idPrefix}-title-error`}>
            {errors.title.message}
          </Field.Error>
        )}
      </Field.Root>
      <Field.Root invalid={errors.description != null}>
        <Field.Label>
          {DESCRIPTION_FIELD_LABEL}{" "}
          <span className="text-text-muted">{OPTIONAL_FIELD_LABEL}</span>
        </Field.Label>
        <Field.Control
          render={<Textarea rows={3} />}
          id={`${idPrefix}-description`}
          placeholder={descriptionPlaceholder}
          disabled={disabled}
          {...register("description")}
        />
        {errors.description != null && (
          <Field.Error match={true} id={`${idPrefix}-description-error`}>
            {errors.description.message}
          </Field.Error>
        )}
      </Field.Root>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-text-muted">
          {CATEGORIES_FIELD_LABEL}{" "}
          <span className="text-text-muted">{OPTIONAL_FIELD_LABEL}</span>
        </span>
        <CategoryMultiSelect
          idPrefix={idPrefix}
          selected={categories}
          onChange={onCategoriesChange}
          disabled={disabled}
        />
      </div>
      {estimateCompanion != null ? (
        <div className="grid grid-cols-2 gap-4">
          {estimate}
          {estimateCompanion}
        </div>
      ) : (
        estimate
      )}
      {children}
      <Fieldset.Root className="flex flex-col gap-1.5">
        <Fieldset.Legend id={`${idPrefix}-carry-over-label`}>
          {CARRY_OVER_FIELD_LABEL}
        </Fieldset.Legend>
        <Controller
          name="carryOver"
          control={control}
          render={({ field }) => (
            <RadioGroup.Root
              aria-labelledby={`${idPrefix}-carry-over-label`}
              className="gap-1 rounded-lg border border-border bg-surface-raised p-1"
              value={field.value}
              onValueChange={field.onChange}
              disabled={disabled}
            >
              {CARRY_OVER_OPTIONS.map(({ value: option, label }) => (
                <RadioGroup.Radio
                  key={option || "ask"}
                  value={option}
                  className="flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium data-[checked]:bg-primary data-[checked]:text-on-primary data-[unchecked]:text-text-muted data-[unchecked]:hover:text-text"
                >
                  {label}
                </RadioGroup.Radio>
              ))}
            </RadioGroup.Root>
          )}
        />
      </Fieldset.Root>
    </>
  );
}
