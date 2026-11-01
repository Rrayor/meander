import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { globalThreshold, setGlobalThreshold } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import { ButtonVariant, Weekday } from "@/lib/enums";
import { MAX_DURATION_MINUTES } from "@/lib/constants";
import {
  SAVE_BUTTON_LABEL,
  THRESHOLD_CLEAR_LABEL,
  THRESHOLD_COLOR_DEFAULT,
  THRESHOLD_COLOR_LABEL,
  THRESHOLD_FIELD_LABEL,
  THRESHOLD_HEADING,
  THRESHOLD_HEADING_ID,
  THRESHOLD_HINT,
  THRESHOLD_MINUTES_ERROR_ID,
  THRESHOLD_DAYS_ERROR_ID,
  THRESHOLD_DAYS_FIELDSET_LABEL,
  WEEKDAY_OPTIONS,
  formatMinutes,
} from "@/lib/labels";
import { errorMessage } from "@/lib/utils";
import { ColorRadios } from "@/features/settings/ColorRadios";
import { Button } from "@/shared/ui/Button";
import { Field } from "@/shared/ui/Field";
import { Fieldset } from "@/shared/ui/Fieldset";
import { Input } from "@/shared/ui/Input";
import { ERROR_TEXT } from "@/shared/ui/styles";

const schema = z.object({
  minutes: z.number().int().min(1).max(MAX_DURATION_MINUTES).nullable(),
  color: z.string(),
  day_minutes: z.record(
    z.string(),
    z.number().int().min(1).max(MAX_DURATION_MINUTES).nullable(),
  ),
});
type FormValues = z.infer<typeof schema>;

const setValueAs = (v: string) => (v === "" ? null : Number(v));

/// The global per-day estimate threshold (spec §295–§298): the user sets
/// a daily minutes budget and a tint color; unset means no tint. The
/// color can be a palette swatch or a fully custom pick (spec §283).
export function ThresholdSection() {
  const queryClient = useQueryClient();
  const { data: stored } = useQuery({
    queryKey: QUERY_KEYS.globalThreshold,
    queryFn: globalThreshold,
  });
  // `values` keeps the persisted row as the baseline: when the query
  // refetches after a save, the form resets its dirty tracking to it.
  // It must be memoized — a fresh object each render makes RHF reset
  // the form on every state change, wiping errors and edits.
  const persisted = useMemo<FormValues>(
    () => ({
      minutes: stored?.minutes ?? null,
      color: stored?.color ?? THRESHOLD_COLOR_DEFAULT,
      day_minutes: Object.fromEntries(
        WEEKDAY_OPTIONS.map((o) => [
          o.value,
          stored?.day_minutes?.[o.value] ?? null,
        ]),
      ),
    }),
    [stored],
  );
  const {
    register,
    setValue,
    watch,
    handleSubmit,
    formState: { errors, isDirty, touchedFields },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    values: persisted,
  });
  const minutes = watch("minutes");
  const color = watch("color");
  const minutesTouched = touchedFields.minutes === true;
  const invalid = errors.minutes != null;
  const minutesInvalid = minutesTouched && invalid;
  const daysInvalid = errors.day_minutes != null;

  const save = useMutation({
    mutationFn: async (v: {
      minutes: number | null;
      color: string | null;
      dayMinutes: Partial<Record<Weekday, number>>;
    }) => setGlobalThreshold(v.minutes, v.color, v.dayMinutes),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.globalThreshold,
      });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.profiles });
    },
  });

  const dayField = (o: (typeof WEEKDAY_OPTIONS)[number]) => {
    const dayError = errors.day_minutes?.[o.value];
    return (
      // One Field.Root per control: a root names a single control, so
      // each day input needs its own (see DurationField for the same
      // structure). The visible short caption is a plain span — the
      // input's accessible name stays the full-day aria-label.
      <Field.Root key={o.value} invalid={dayError != null}>
        <span className="text-center text-xs text-text-muted">{o.short}</span>
        <Field.Control
          render={
            <Input className="w-16 px-2 py-1 placeholder:text-text-muted" />
          }
          type="number"
          min={1}
          max={MAX_DURATION_MINUTES}
          placeholder={minutes != null ? String(minutes) : ""}
          aria-label={o.label}
          {...register(`day_minutes.${o.value}`, { setValueAs })}
        />
      </Field.Root>
    );
  };

  return (
    <section aria-labelledby={THRESHOLD_HEADING_ID}>
      <h2
        id={THRESHOLD_HEADING_ID}
        className="text-base font-semibold text-text"
      >
        {THRESHOLD_HEADING}
      </h2>
      <p className="mt-1 text-sm text-text-muted">{THRESHOLD_HINT}</p>
      <div className="mt-4 rounded-lg bg-surface p-4">
        <div className="flex items-center gap-4">
          <Field.Root invalid={minutesInvalid}>
            <Field.Label className="text-sm font-normal">
              {THRESHOLD_FIELD_LABEL}
            </Field.Label>
            <Field.Control
              render={<Input className="w-28 py-1.5" />}
              type="number"
              min={1}
              max={MAX_DURATION_MINUTES}
              {...register("minutes", { setValueAs })}
            />
            {minutesInvalid && (
              <Field.Error match={true} id={THRESHOLD_MINUTES_ERROR_ID}>
                {formatMinutes(1)}–{formatMinutes(MAX_DURATION_MINUTES)}
              </Field.Error>
            )}
          </Field.Root>
          {minutes != null && !invalid && (
            <span className="self-end pb-2 text-sm text-text-muted">
              {formatMinutes(minutes)}
            </span>
          )}
        </div>
        {/* §291 — per-weekday overrides; an empty field inherits the
            global minutes shown as the placeholder. */}
        <Field.Root
          invalid={daysInvalid}
          render={<Fieldset.Root className="mt-4" />}
        >
          <Fieldset.Legend className="text-sm font-normal">
            {THRESHOLD_DAYS_FIELDSET_LABEL}
          </Fieldset.Legend>
          <div className="mt-2 flex gap-2">{WEEKDAY_OPTIONS.map(dayField)}</div>
          {daysInvalid && (
            <Field.Error match={true} id={THRESHOLD_DAYS_ERROR_ID}>
              {formatMinutes(1)}–{formatMinutes(MAX_DURATION_MINUTES)}
            </Field.Error>
          )}
        </Field.Root>
        <ColorRadios
          label={THRESHOLD_COLOR_LABEL}
          value={color}
          onChange={(c) => setValue("color", c, { shouldDirty: true })}
        />
      </div>
      {save.isError && (
        <p role="alert" className={cn("mt-3", ERROR_TEXT)}>
          {errorMessage(save.error)}
        </p>
      )}
      <div className="mt-4 flex gap-3">
        <Button
          type="button"
          variant={ButtonVariant.Ghost}
          className="px-3"
          disabled={stored?.minutes == null}
          onClick={() =>
            save.mutate({ minutes: null, color: null, dayMinutes: {} })
          }
        >
          {THRESHOLD_CLEAR_LABEL}
        </Button>
        <Button
          type="button"
          disabled={!isDirty || save.isPending}
          // handleSubmit revalidates on click even for untouched fields —
          // invalid minutes surface the alert instead of reaching the wire.
          onClick={() =>
            void handleSubmit((v) => {
              const days = Object.fromEntries(
                Object.entries(v.day_minutes).filter(([, m]) => m != null) as [
                  string,
                  number,
                ][],
              ) as Partial<Record<Weekday, number>>;
              save.mutate({
                minutes: v.minutes,
                color: v.color,
                dayMinutes: days,
              });
            })()
          }
        >
          {SAVE_BUTTON_LABEL}
        </Button>
      </div>
    </section>
  );
}
