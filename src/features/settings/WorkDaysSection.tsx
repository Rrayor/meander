import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  setWorkDays as setWorkDaysCommand,
  weekStart as fetchWeekStart,
  workDays as fetchWorkDays,
} from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import { ComponentSize, Weekday } from "@/lib/enums";
import {
  SAVE_BUTTON_LABEL,
  WEEKDAY_OPTIONS,
  WORK_DAYS_DEFAULT,
  WORK_DAYS_FIELD_LABEL,
  WORK_DAYS_HEADING,
  WORK_DAYS_HEADING_ID,
  weekdaysFrom,
} from "@/lib/labels";
import { errorMessage } from "@/lib/utils";
import { WeekdayPicker } from "@/shared/patterns/WeekdayPicker";
import { Button } from "@/shared/ui/Button";

const sameDays = (a: readonly Weekday[], b: readonly Weekday[]) =>
  a.length === b.length && a.every((d) => b.includes(d));

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
  const baseline = stored ?? WORK_DAYS_DEFAULT;
  const days: Weekday[] = [...(selected ?? baseline)];

  const save = useMutation({
    mutationFn: setWorkDaysCommand,
    onSuccess: () => {
      setSelected(undefined);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.workDays });
      // set_work_days bumps the profile's updated_at — refresh the row.
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.profiles });
    },
  });

  // WeekdayPicker enforces "at least one" via minSelected — the deselect
  // that would empty the set never reaches onChange.
  const handleDaysChange = (next: Weekday[]) =>
    // Toggling back to the stored set clears the draft instead of
    // enabling a no-op save that would still bump updated_at.
    setSelected(sameDays(next, baseline) ? undefined : next);

  const dirty = selected !== undefined && !sameDays(selected, baseline);

  const orderedDays = weekdaysFrom(weekStart);

  return (
    <section
      aria-labelledby={WORK_DAYS_HEADING_ID}
      className="flex flex-col gap-3"
    >
      <h2 id={WORK_DAYS_HEADING_ID} className="text-lg font-semibold">
        {WORK_DAYS_HEADING}
      </h2>
      <div className="flex items-end gap-3">
        <WeekdayPicker
          aria-label={WORK_DAYS_FIELD_LABEL}
          value={days}
          onChange={handleDaysChange}
          order={orderedDays.map((o) => o.value)}
          formatDay={(day) => {
            const option = orderedDays.find((o) => o.value === day);
            return { label: option?.label ?? day, short: option?.short ?? day };
          }}
          minSelected={1}
          className="gap-1.5"
          chipClassName="data-[pressed]:border-primary"
        />
        <Button
          type="button"
          size={ComponentSize.Sm}
          className="px-4"
          onClick={() =>
            save.mutate(
              WEEKDAY_OPTIONS.map((o) => o.value).filter((v) =>
                days.includes(v),
              ),
            )
          }
          disabled={save.isPending || !dirty}
        >
          {SAVE_BUTTON_LABEL}
        </Button>
      </div>
      {save.isError && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(save.error)}
        </p>
      )}
    </section>
  );
}
