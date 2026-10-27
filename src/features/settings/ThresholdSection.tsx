import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { globalThreshold, setGlobalThreshold } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
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
  categorySwatchLabel,
  formatMinutes,
} from "@/lib/labels";
import { errorMessage } from "@/lib/utils";

const schema = z.object({
  minutes: z.number().int().min(1).max(MAX_DURATION_MINUTES).nullable(),
  color: z.string(),
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
  const {
    register,
    setValue,
    watch,
    formState: { errors, isDirty, touchedFields },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    values: {
      minutes: stored?.minutes ?? null,
      color: stored?.color ?? THRESHOLD_COLOR_DEFAULT,
    },
  });
  const minutes = watch("minutes");
  const color = watch("color");
  const minutesTouched = touchedFields.minutes === true;
  const invalid = errors.minutes != null;
  const customSelected = !(CATEGORY_COLORS as readonly string[]).includes(
    color,
  );

  const save = useMutation({
    mutationFn: (v: { minutes: number | null; color: string | null }) =>
      setGlobalThreshold(v.minutes, v.color),
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
          onClick={() => save.mutate({ minutes: null, color: null })}
          className="rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
        >
          {THRESHOLD_CLEAR_LABEL}
        </button>
        <button
          type="button"
          disabled={!isDirty || minutes == null || invalid || save.isPending}
          onClick={() => save.mutate({ minutes, color })}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {SAVE_BUTTON_LABEL}
        </button>
      </div>
    </section>
  );
}
