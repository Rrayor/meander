import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";

import { CATEGORY_COLORS } from "@/api/categories";
import { globalThreshold, setGlobalThreshold } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import { MAX_DURATION_MINUTES } from "@/api/tasks";
import {
  SAVE_BUTTON_LABEL,
  THRESHOLD_CLEAR_LABEL,
  THRESHOLD_COLOR_DEFAULT,
  THRESHOLD_COLOR_LABEL,
  THRESHOLD_CUSTOM_COLOR_LABEL,
  THRESHOLD_FIELD_LABEL,
  THRESHOLD_HEADING,
  THRESHOLD_HEADING_ID,
  THRESHOLD_HINT,
  formatMinutes,
} from "@/lib/labels";
import { errorMessage } from "@/lib/utils";

const minutesSchema = z.number().int().min(1).max(MAX_DURATION_MINUTES);

/// The global per-day estimate threshold (spec §295–§298): the user sets
/// a daily minutes budget and a tint color; unset means no tint. The
/// color can be a palette swatch or a fully custom pick (spec §283).
export function ThresholdSection() {
  const queryClient = useQueryClient();
  const { data: stored } = useQuery({
    queryKey: QUERY_KEYS.globalThreshold,
    queryFn: globalThreshold,
  });
  // Draft fields — undefined means "mirror the stored value"; a cleared
  // input is null, which must NOT fall back to the stored minutes.
  const [draftMinutes, setDraftMinutes] = useState<number | null>();
  const [draftColor, setDraftColor] = useState<string>();
  const [touched, setTouched] = useState(false);
  const minutes =
    draftMinutes === undefined ? (stored?.minutes ?? null) : draftMinutes;
  const color = draftColor ?? stored?.color ?? THRESHOLD_COLOR_DEFAULT;
  const invalid = minutes != null && !minutesSchema.safeParse(minutes).success;

  const save = useMutation({
    mutationFn: (v: { minutes: number | null; color: string | null }) =>
      setGlobalThreshold(v.minutes, v.color),
    onSuccess: () => {
      setDraftMinutes(undefined);
      setDraftColor(undefined);
      setTouched(false);
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.globalThreshold,
      });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.profiles });
    },
  });

  const dirty =
    minutes !== (stored?.minutes ?? null) ||
    color !== (stored?.color ?? THRESHOLD_COLOR_DEFAULT);

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
              value={minutes ?? ""}
              aria-invalid={touched && invalid}
              onChange={(e) =>
                setDraftMinutes(
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
              onBlur={() => setTouched(true)}
              className="mt-1 block w-28 rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm text-text aria-invalid:border-error"
            />
          </label>
          {minutes != null && !invalid && (
            <span className="self-end pb-2 text-sm text-text-muted">
              {formatMinutes(minutes)}
            </span>
          )}
        </div>
        {touched && invalid && (
          <p role="alert" className="mt-2 text-sm text-error">
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
                aria-label={c}
                onClick={() => setDraftColor(c)}
                style={{ backgroundColor: c }}
                className={`h-6 w-6 rounded-full transition-transform ${
                  color === c
                    ? "ring-2 ring-text ring-offset-2 ring-offset-surface"
                    : "hover:scale-110"
                }`}
              />
            ))}
            <input
              type="color"
              value={color}
              aria-label={THRESHOLD_CUSTOM_COLOR_LABEL}
              onChange={(e) => setDraftColor(e.target.value)}
              className="ml-2 h-7 w-7 cursor-pointer rounded border border-border bg-transparent"
            />
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
          disabled={!dirty || minutes == null || invalid || save.isPending}
          onClick={() => save.mutate({ minutes, color })}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {SAVE_BUTTON_LABEL}
        </button>
      </div>
    </section>
  );
}
