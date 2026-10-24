import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  setWeekStart as setWeekStartCommand,
  weekStart as fetchWeekStart,
} from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import { Weekday } from "@/lib/enums";
import {
  SAVE_BUTTON_LABEL,
  WEEKDAY_OPTIONS,
  WEEK_START_HEADING,
  WEEK_START_HEADING_ID,
  WEEK_START_LABEL,
} from "@/lib/labels";
import { errorMessage } from "@/lib/utils";

export function WeekStartSection() {
  const queryClient = useQueryClient();
  const { data: weekStart } = useQuery({
    queryKey: QUERY_KEYS.weekStart,
    queryFn: fetchWeekStart,
  });
  const [selected, setSelected] = useState<Weekday>();
  const stored = weekStart ?? Weekday.Monday;
  const current = selected ?? stored;
  // Selecting the stored value is no draft — save must stay disabled or it
  // would write the same value and still bump updated_at.
  const dirty = selected !== undefined && selected !== stored;

  const save = useMutation({
    mutationFn: setWeekStartCommand,
    onSuccess: () => {
      setSelected(undefined);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.weekStart });
      // set_week_start bumps the profile's updated_at — refresh the row.
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.profiles });
    },
  });

  return (
    <section
      aria-labelledby={WEEK_START_HEADING_ID}
      className="flex flex-col gap-3"
    >
      <h2 id={WEEK_START_HEADING_ID} className="text-lg font-semibold">
        {WEEK_START_HEADING}
      </h2>
      <div className="flex items-end gap-3">
        <label className="flex flex-col gap-1.5" htmlFor="week-start-select">
          <span className="text-xs font-medium text-text-muted">
            {WEEK_START_LABEL}
          </span>
          <select
            id="week-start-select"
            value={current}
            onChange={(e) => setSelected(e.target.value as Weekday)}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text"
          >
            {WEEKDAY_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => save.mutate(current)}
          disabled={save.isPending || !dirty}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-on-primary transition-colors disabled:opacity-50"
        >
          {SAVE_BUTTON_LABEL}
        </button>
      </div>
      {save.isError && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(save.error)}
        </p>
      )}
    </section>
  );
}
