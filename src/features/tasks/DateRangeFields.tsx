import { Plus, X } from "lucide-react";

import { ButtonVariant, ComponentSize } from "@/lib/enums";
import {
  REPEAT_ENDS_ADD_LABEL,
  REPEAT_ENDS_CLEAR_LABEL,
  REPEAT_ENDS_LABEL,
  REPEAT_STARTS_LABEL,
} from "@/lib/labels";
import { Button } from "@/shared/ui/Button";
import { Field } from "@/shared/ui/Field";
import { IconButton } from "@/shared/ui/IconButton";
import { Input } from "@/shared/ui/Input";

import type { DraftErrors } from "./repeatDraft";

interface DateRangeFieldsProps {
  idPrefix: string;
  startDate: string;
  endDate: string;
  errors: DraftErrors;
  // Fixes the start at the given date — the field stays visible but
  // read-only. A "this and future" split anchors on the viewed instance's
  // date, so the only honest Starts value is that cutoff.
  lockedStartDate?: string;
  onStartChange: (iso: string) => void;
  // `""` clears the end date back to the open-ended state.
  onEndDateChange: (iso: string) => void;
}

// The Starts/Ends date pair. Field parts wire label association,
// aria-invalid, and the role="alert" error to each control; the error ids
// stay explicit so e2e selectors keep working.
export function DateRangeFields({
  idPrefix,
  startDate,
  endDate,
  errors,
  lockedStartDate,
  onStartChange,
  onEndDateChange,
}: Readonly<DateRangeFieldsProps>) {
  return (
    <div className="grid grid-cols-2 gap-3 pt-1">
      <Field.Root invalid={errors.startDate != null}>
        <Field.Label>{REPEAT_STARTS_LABEL}</Field.Label>
        <Field.Control
          render={
            <Input
              className={
                lockedStartDate === undefined
                  ? undefined
                  : "cursor-default opacity-75"
              }
            />
          }
          id={`${idPrefix}-repeat-starts`}
          type="date"
          required
          value={startDate}
          // readOnly keeps the themed text color — WebKit renders
          // disabled inputs in system colors regardless of our classes.
          // The lock prevents the change below.
          readOnly={lockedStartDate !== undefined}
          onChange={(e) => {
            if (lockedStartDate === undefined) {
              onStartChange(e.target.value);
            }
          }}
        />
        {errors.startDate != null && (
          <Field.Error match={true} id={`${idPrefix}-repeat-startDate-error`}>
            {errors.startDate}
          </Field.Error>
        )}
      </Field.Root>
      <Field.Root invalid={errors.endDate != null}>
        <Field.Label>{REPEAT_ENDS_LABEL}</Field.Label>
        {endDate === "" ? (
          <Button
            type="button"
            variant={ButtonVariant.Secondary}
            size={ComponentSize.Sm}
            onClick={() => onEndDateChange(startDate)}
            className="flex w-fit cursor-pointer items-center gap-1.5 border-primary/50 text-primary hover:bg-primary/10"
          >
            <Plus aria-hidden="true" size={16} />
            {REPEAT_ENDS_ADD_LABEL}
          </Button>
        ) : (
          <div className="flex items-center gap-1.5">
            <Field.Control
              render={<Input />}
              id={`${idPrefix}-repeat-ends`}
              type="date"
              min={startDate}
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
            />
            <IconButton
              icon={X}
              label={REPEAT_ENDS_CLEAR_LABEL}
              size={ComponentSize.Sm}
              onClick={() => onEndDateChange("")}
            />
          </div>
        )}
        {errors.endDate != null && (
          <Field.Error match={true} id={`${idPrefix}-repeat-endDate-error`}>
            {errors.endDate}
          </Field.Error>
        )}
      </Field.Root>
    </div>
  );
}
