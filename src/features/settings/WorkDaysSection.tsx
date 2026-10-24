import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  setWorkDays as setWorkDaysCommand,
  weekStart as fetchWeekStart,
  workDays as fetchWorkDays,
} from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import { Weekday } from "@/lib/enums";
import {
  SAVE_BUTTON_LABEL,
  WEEKDAY_OPTIONS,
  WORK_DAYS_DEFAULT,
  WORK_DAYS_FIELD_LABEL,
  WORK_DAYS_HEADING,
  weekdaysFrom,
} from "@/lib/labels";
import { errorMessage } from "@/lib/utils";

export function WorkDaysSection() {
  const queryClient = useQueryClient();
  const { data: weekStart = Weekday.Monday } = useQuery({
    queryKey: QUERY_KEYS.weekStart,
    queryFn: fetchWeekStart,
  });
  const { data: stored } = useQuery({
    queryKey: QUERY_KEYS.workDays,
    queryFn: fetchWorkDays,
  });
  const [selected, setSelected] = useState<Weekday[]>();
  const days: Weekday[] = [...(selected ?? stored ?? WORK_DAYS_DEFAULT)];

  const save = useMutation({
    mutationFn: setWorkDaysCommand,
    onSuccess: () => {
      setSelected(undefined);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.workDays });
      // set_work_days bumps the profile's updated_at — refresh the row.
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.profiles });
    },
  });

  const toggle = (day: Weekday) =>
    setSelected((prev) => {
      const current = prev ?? days;
      if (!current.includes(day)) return [...current, day];
      // At least one work day is required — the last one can't deselect.
      return current.length === 1 ? current : current.filter((d) => d !== day);
    });

  return (
    <section
      aria-labelledby="work-days-heading"
      className="flex flex-col gap-3"
    >
      <h2 id="work-days-heading" className="text-lg font-semibold">
        {WORK_DAYS_HEADING}
      </h2>
      <fieldset
        aria-label={WORK_DAYS_FIELD_LABEL}
        className="flex items-end gap-3"
      >
        <div className="flex items-center gap-1.5">
          {weekdaysFrom(weekStart).map(({ value, label, short }) => {
            const on = days.includes(value);
            return (
              <button
                key={value}
                type="button"
                aria-label={label}
                aria-pressed={on}
                onClick={() => toggle(value)}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-primary ${
                  on
                    ? "border-primary bg-surface text-primary"
                    : "border-border bg-surface-dim text-text-muted hover:text-text"
                }`}
              >
                {short}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() =>
            save.mutate(
              WEEKDAY_OPTIONS.map((o) => o.value).filter((v) =>
                days.includes(v),
              ),
            )
          }
          disabled={save.isPending || selected === undefined}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-on-primary transition-colors disabled:opacity-50"
        >
          {SAVE_BUTTON_LABEL}
        </button>
      </fieldset>
      {save.isError && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(save.error)}
        </p>
      )}
    </section>
  );
}
