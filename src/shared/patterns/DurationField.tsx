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

// Call sites whose inputs were originally aria-labeled (task
// estimate/spent) pass `inputLabels`: aria-label wins over the htmlFor
// caption, so the accessible name stays the full "Estimated hours"-style
// name while the visible caption remains "h"/"min".
// One entry per input: `key` doubles as the `names` key, the
// `{idPrefix}-{key}` id suffix, and the `captions` lookup. Mapped so
// the Field.Root pair cell is written once.
const UNITS = [{ key: "hours" }, { key: "minutes" }] as const;

interface DurationFieldProps<T extends FieldValues> {
  label: string;
  /** Unit captions naming the two controls — callers pass the labels
   * registry copy (`HOURS_UNIT_LABEL` / `MINUTES_UNIT_LABEL`); shared/
   * cannot import it. */
  captions: { hours: string; minutes: string };
  idPrefix: string;
  names: { hours: Path<T>; minutes: Path<T> };
  register: UseFormRegister<T>;
  /** Accessible names for the two inputs. Set when the visible "h"/"min"
      caption must not be the input's name — see the caption note above. */
  inputLabels?: { hours: string; minutes: string };
  error?: string;
  /** Explicit id for the error alert — call sites whose tests reference
      the alert by id pass it; an id is generated otherwise. */
  errorId?: string;
  disabled?: boolean;
}

export function DurationField<T extends FieldValues>({
  label,
  captions,
  idPrefix,
  names,
  register,
  inputLabels,
  error,
  errorId,
  disabled = false,
}: Readonly<DurationFieldProps<T>>) {
  const invalid = error != null;
  return (
    <Field.Root
      invalid={invalid}
      disabled={disabled}
      render={<Fieldset.Root disabled={disabled} />}
    >
      <Fieldset.Legend>{label}</Fieldset.Legend>
      <div className={cn("flex items-center gap-4", disabled && "opacity-50")}>
        {UNITS.map((unit) => {
          const unitId = `${idPrefix}-${unit.key}`;
          return (
            <Field.Root
              key={unit.key}
              invalid={invalid}
              className="flex-row items-center gap-2"
            >
              <Field.Control
                render={<Input className="w-20" />}
                id={unitId}
                type="number"
                placeholder="0"
                aria-label={inputLabels?.[unit.key]}
                {...register(names[unit.key])}
              />
              <label htmlFor={unitId} className="text-xs text-text-muted">
                {captions[unit.key]}
              </label>
            </Field.Root>
          );
        })}
      </div>
      {error != null && (
        <Field.Error match={true} id={errorId}>
          {error}
        </Field.Error>
      )}
    </Field.Root>
  );
}

export type { DurationFieldProps };
