import { cn } from "cn";

import { Field } from "../ui/Field";
import { Fieldset } from "../ui/Fieldset";
import { Input } from "../ui/Input";

import type { FieldValues, Path, UseFormRegister } from "react-hook-form";

// Hours + minutes input pair extracted from EditTaskDialog's internal
// DurationField (estimate/spent durations). The group label is a
// Fieldset.Legend — the pair reads "Estimated time: h spinbutton, min
// spinbutton" — and each unit caption is a native <label> associated by
// the id-prefixed control id, so shared/ needs no label imports.
//
// Structure notes (Base UI mechanics, verified against internals):
// - One Field.Root per control is REQUIRED: a root's LabelableProvider
//   holds a single controlId and validation.inputRef, so two
//   Field.Controls under one root collide (same rendered id, crossed
//   names). Each inner root also owns its control's aria-invalid.
// - The OUTER Field.Root renders as the Fieldset.Root (one element
//   carrying both contexts) and hosts the shared Field.Error: nested
//   LabelableProviders inherit the parent's messageIds, so the alert's
//   id lands in BOTH inputs' aria-describedby — the original hand-wired
//   both-inputs-described-by-one-error parity.
// - `invalid` marks the controls but does NOT mount Field.Error
//   (FieldError docstring) — the externally-driven `{error &&
//   <Field.Error match={true}>}` gate is required.
// - `disabled` on the fieldset natively disables both inputs and
//   propagates through FieldsetRootContext to the inner Field.Roots;
//   the row dims via opacity-50 — EditTaskDialog parity.
//
// `names` carries the react-hook-form paths; summing to minutes stays
// in the caller.

interface DurationFieldProps<T extends FieldValues> {
  label: string;
  idPrefix: string;
  names: { hours: Path<T>; minutes: Path<T> };
  register: UseFormRegister<T>;
  error?: string;
  disabled?: boolean;
}

export function DurationField<T extends FieldValues>({
  label,
  idPrefix,
  names,
  register,
  error,
  disabled = false,
}: Readonly<DurationFieldProps<T>>) {
  const hoursId = `${idPrefix}-hours`;
  const minutesId = `${idPrefix}-minutes`;
  return (
    <Field.Root
      invalid={error != null}
      disabled={disabled}
      render={<Fieldset.Root disabled={disabled} />}
    >
      <Fieldset.Legend>{label}</Fieldset.Legend>
      <div className={cn("flex items-center gap-4", disabled && "opacity-50")}>
        <Field.Root
          invalid={error != null}
          className="flex-row items-center gap-2"
        >
          <Field.Control
            render={<Input className="w-20" />}
            id={hoursId}
            type="number"
            placeholder="0"
            {...register(names.hours)}
          />
          <label htmlFor={hoursId} className="text-xs text-text-muted">
            h
          </label>
        </Field.Root>
        <Field.Root
          invalid={error != null}
          className="flex-row items-center gap-2"
        >
          <Field.Control
            render={<Input className="w-20" />}
            id={minutesId}
            type="number"
            placeholder="0"
            {...register(names.minutes)}
          />
          <label htmlFor={minutesId} className="text-xs text-text-muted">
            min
          </label>
        </Field.Root>
      </div>
      {error != null && <Field.Error match={true}>{error}</Field.Error>}
    </Field.Root>
  );
}

export type { DurationFieldProps };
