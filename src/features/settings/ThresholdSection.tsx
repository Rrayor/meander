import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { globalThreshold, setGlobalThreshold } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import { Weekday } from "@/lib/enums";
import { CATEGORY_COLORS, MAX_DURATION_MINUTES } from "@/lib/constants";
import {
  CUSTOM_COLOR_GRADIENT,
  CUSTOM_COLOR_LABEL,
  CUSTOM_COLOR_PICKER_LABEL,
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
  categorySwatchLabel,
  formatMinutes,
} from "@/lib/labels";
import { errorMessage } from "@/lib/utils";

const schema = z.object({
  minutes: z.number().int().min(1).max(MAX_DURATION_MINUTES).nullable(),
  color: z.string(),
  day_minutes: z.record(
    z.string(),
    z.number().int().min(1).max(MAX_DURATION_MINUTES).nullable(),
  ),
});
type FormValues = z.infer<typeof schema>;

/// The global per-day estimate threshold (spec §295–§298): the user sets
/// a daily minutes budget and a tint color; unset means no tint. The
/// color can be a palette swatch or a fully custom pick (spec §283).
export function ThresholdSection() {
  const queryClient = useQueryClient();
  const colorInputRef = useRef<HTMLInputElement>(null);
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
  const customSelected = !(CATEGORY_COLORS as readonly string[]).includes(
    color,
  );

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
          <label className="text-sm text-text-muted">
            {THRESHOLD_FIELD_LABEL}
            <input
              type="number"
              min={1}
              max={MAX_DURATION_MINUTES}
              aria-invalid={minutesTouched && invalid}
              aria-describedby={
                minutesTouched && invalid
                  ? THRESHOLD_MINUTES_ERROR_ID
                  : undefined
              }
              {...register("minutes", {
                setValueAs: (v: string) => (v === "" ? null : Number(v)),
              })}
              className="mt-1 block w-28 rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm text-text aria-invalid:border-error"
            />
          </label>
          {minutes != null && !invalid && (
            <span className="self-end pb-2 text-sm text-text-muted">
              {formatMinutes(minutes)}
            </span>
          )}
        </div>
        {minutesTouched && invalid && (
          <p
            id={THRESHOLD_MINUTES_ERROR_ID}
            role="alert"
            className="mt-2 text-sm text-error"
          >
            {formatMinutes(1)}–{formatMinutes(MAX_DURATION_MINUTES)}
          </p>
        )}
        {/* §291 — per-weekday overrides; an empty field inherits the
            global minutes shown as the placeholder. */}
        <fieldset className="mt-4">
          <legend className="text-sm text-text-muted">
            {THRESHOLD_DAYS_FIELDSET_LABEL}
          </legend>
          <div className="mt-2 flex gap-2">
            {WEEKDAY_OPTIONS.map((o) => (
              <label
                key={o.value}
                className="text-center text-xs text-text-muted"
              >
                {o.short}
                <input
                  type="number"
                  min={1}
                  max={MAX_DURATION_MINUTES}
                  placeholder={minutes != null ? String(minutes) : ""}
                  aria-label={o.label}
                  aria-invalid={errors.day_minutes?.[o.value] != null}
                  aria-describedby={
                    errors.day_minutes?.[o.value] != null
                      ? THRESHOLD_DAYS_ERROR_ID
                      : undefined
                  }
                  {...register(`day_minutes.${o.value}`, {
                    setValueAs: (v: string) => (v === "" ? null : Number(v)),
                  })}
                  className="mt-1 block w-16 rounded-md border border-border bg-surface-raised px-2 py-1 text-sm text-text placeholder:text-text-muted"
                />
              </label>
            ))}
          </div>
          {errors.day_minutes && (
            <p
              id={THRESHOLD_DAYS_ERROR_ID}
              role="alert"
              className="mt-2 text-sm text-error"
            >
              {formatMinutes(1)}–{formatMinutes(MAX_DURATION_MINUTES)}
            </p>
          )}
        </fieldset>
        <fieldset className="mt-4 text-sm text-text-muted">
          <legend className="sr-only">{THRESHOLD_COLOR_LABEL}</legend>
          <div
            className="flex items-center gap-1.5"
            role="radiogroup"
            aria-label={THRESHOLD_COLOR_LABEL}
          >
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={categorySwatchLabel(c)}
                onClick={() => setValue("color", c, { shouldDirty: true })}
                style={{ backgroundColor: c }}
                className={`h-6 w-6 rounded-full transition-transform ${
                  color === c
                    ? "ring-2 ring-text ring-offset-2 ring-offset-surface"
                    : "hover:scale-110"
                }`}
              />
            ))}
            {/* The button is the radiogroup member so the custom pick
                reports aria-checked to AT; the color input overlays it
                for pointer interaction and keeps its native semantics. */}
            <div className="group relative ml-2">
              <button
                type="button"
                role="radio"
                aria-checked={customSelected}
                aria-label={CUSTOM_COLOR_LABEL}
                onClick={(e) => {
                  if (e.target === e.currentTarget)
                    colorInputRef.current?.click();
                }}
                className={`h-6 w-6 rounded-full transition-transform focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                  customSelected
                    ? "ring-2 ring-text ring-offset-2 ring-offset-surface"
                    : "group-hover:scale-110"
                }`}
                style={{
                  background: customSelected ? color : CUSTOM_COLOR_GRADIENT,
                }}
              />
              <input
                ref={colorInputRef}
                type="color"
                tabIndex={-1}
                aria-label={CUSTOM_COLOR_PICKER_LABEL}
                value={customSelected ? color : THRESHOLD_COLOR_DEFAULT}
                onChange={(e) =>
                  setValue("color", e.target.value, { shouldDirty: true })
                }
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
          </div>
        </fieldset>
      </div>
      {save.isError && (
        <p role="alert" className="mt-3 text-sm text-error">
          {errorMessage(save.error)}
        </p>
      )}
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          disabled={stored?.minutes == null}
          onClick={() =>
            save.mutate({ minutes: null, color: null, dayMinutes: {} })
          }
          className="rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
        >
          {THRESHOLD_CLEAR_LABEL}
        </button>
        <button
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
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {SAVE_BUTTON_LABEL}
        </button>
      </div>
    </section>
  );
}
