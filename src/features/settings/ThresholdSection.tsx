import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { globalThreshold, setGlobalThreshold } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import {
  SAVE_BUTTON_LABEL,
  THRESHOLD_CLEAR_LABEL,
  THRESHOLD_COLOR_DEFAULT,
  THRESHOLD_COLOR_LABEL,
  THRESHOLD_FIELD_LABEL,
  THRESHOLD_HEADING,
  THRESHOLD_HEADING_ID,
  THRESHOLD_HINT,
  formatMinutes,
} from "@/lib/labels";
import { errorMessage } from "@/lib/utils";

/// The global per-day estimate threshold (spec §295–§298): the user sets
/// a daily minutes budget and a tint color; unset means no tint.
export function ThresholdSection() {
  const queryClient = useQueryClient();
  const { data: stored } = useQuery({
    queryKey: QUERY_KEYS.globalThreshold,
    queryFn: globalThreshold,
  });
  // Draft fields — undefined means "mirror the stored value".
  const [draftMinutes, setDraftMinutes] = useState<number | null>();
  const [draftColor, setDraftColor] = useState<string>();
  const minutes = draftMinutes ?? stored?.minutes ?? null;
  const color = draftColor ?? stored?.color ?? THRESHOLD_COLOR_DEFAULT;

  const save = useMutation({
    mutationFn: (v: { minutes: number | null; color: string | null }) =>
      setGlobalThreshold(v.minutes, v.color),
    onSuccess: () => {
      setDraftMinutes(undefined);
      setDraftColor(undefined);
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.globalThreshold,
      });
      // The save bumps the profile's updated_at — refresh the row.
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.profiles });
    },
  });

  const dirty =
    minutes !== (stored?.minutes ?? null) || color !== stored?.color;

  return (
    <section aria-labelledby={THRESHOLD_HEADING_ID}>
      <h2
        id={THRESHOLD_HEADING_ID}
        className="text-base font-semibold text-text"
      >
        {THRESHOLD_HEADING}
      </h2>
      <p className="mt-1 text-sm text-text-muted">{THRESHOLD_HINT}</p>
      <div className="mt-4 flex items-center gap-4 rounded-lg bg-surface p-4">
        <label className="text-sm text-text-muted">
          {THRESHOLD_FIELD_LABEL}
          <input
            type="number"
            min={1}
            max={24 * 60}
            value={minutes ?? ""}
            onChange={(e) =>
              setDraftMinutes(
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
            className="mt-1 block w-28 rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm text-text"
          />
        </label>
        {minutes != null && (
          <span className="self-end pb-2 text-sm text-text-muted">
            {formatMinutes(minutes)}
          </span>
        )}
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-text-muted">
          {THRESHOLD_COLOR_LABEL}
          <input
            type="color"
            value={color}
            onChange={(e) => setDraftColor(e.target.value)}
            className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent"
          />
        </label>
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
          onClick={() => {
            setDraftMinutes(null);
            save.mutate({ minutes: null, color: null });
          }}
          className="rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
        >
          {THRESHOLD_CLEAR_LABEL}
        </button>
        <button
          type="button"
          disabled={!dirty || minutes == null || save.isPending}
          onClick={() => save.mutate({ minutes, color })}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {SAVE_BUTTON_LABEL}
        </button>
      </div>
    </section>
  );
}
