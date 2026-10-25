import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import type { Task, TaskSeries } from "@/api/bindings";
import { MonthNav } from "@/features/calendar/MonthNav";
import { monthCells, monthOfIso, shiftMonth } from "@/lib/calendar";
import { weekStart as fetchWeekStart } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import { Weekday } from "@/lib/enums";
import {
  CALENDAR_LEGEND_PERSISTED,
  CALENDAR_LEGEND_SCHEDULED,
  weekdaysFrom,
} from "@/lib/labels";
import { isScheduledOn } from "@/lib/recurrence";
import { todayLocalIso } from "@/lib/utils";

interface InstanceCalendarProps {
  // The earlier segments plus the living series — a date is
  // scheduled when any segment's window produces it.
  series: TaskSeries[];
  instances: Task[];
  selectedIso: string | null;
  onPick: (task: Task | null, iso: string) => void;
}

export function InstanceCalendar({
  series,
  instances,
  selectedIso,
  onPick,
}: Readonly<InstanceCalendarProps>) {
  const { data: weekStart = Weekday.Monday } = useQuery({
    queryKey: QUERY_KEYS.weekStart,
    queryFn: fetchWeekStart,
  });
  const weekOrder = weekdaysFrom(weekStart);

  const anchor = selectedIso ?? todayLocalIso();
  const [month, setMonth] = useState(() => monthOfIso(anchor));

  const cells = useMemo(() => monthCells(month, weekStart), [month, weekStart]);

  const pick = (iso: string) =>
    onPick(instances.find((t) => t.scheduled_date === iso) ?? null, iso);

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4">
      <MonthNav
        month={month}
        onShift={(delta) => setMonth((m) => shiftMonth(m, delta))}
      />
      <div className="mt-3 grid grid-cols-7 gap-1">
        {weekOrder.map((w) => (
          <span key={w.value} className="text-center text-xs text-text-muted">
            {w.short}
          </span>
        ))}
        {cells.map(({ iso, inMonth, day }) => {
          // A persisted instance stays reachable even if its date no
          // longer matches the schedule (e.g. after a series edit).
          const persisted = instances.some((t) => t.scheduled_date === iso);
          const scheduled =
            persisted ||
            series.some((segment) =>
              isScheduledOn(
                segment.recurrence,
                segment.start_date,
                segment.end_date,
                iso,
              ),
            );
          if (!scheduled) {
            // Padding days outside the month stay blank — showing them
            // faded fails contrast and adds noise.
            if (!inMonth) return <span key={iso} />;
            return (
              <span
                key={iso}
                className="py-1 text-center text-xs text-text-muted"
              >
                {day}
              </span>
            );
          }
          const selected = iso === selectedIso;
          // Stitch design: a filled dot marks a persisted instance, a
          // hollow ring a merely-scheduled occurrence.
          let markerClass: string;
          if (persisted) {
            markerClass = selected ? "bg-on-primary" : "bg-primary";
          } else {
            markerClass = selected
              ? "border border-on-primary bg-transparent"
              : "border border-primary bg-transparent";
          }
          return (
            <button
              key={iso}
              type="button"
              // Day-of-month alone is ambiguous across adjacent months.
              aria-label={iso}
              aria-current={selected ? "date" : undefined}
              onClick={() => pick(iso)}
              className={`flex flex-col items-center rounded-md py-1 text-center text-xs transition-colors ${
                selected
                  ? "bg-primary font-medium text-on-primary"
                  : "text-text hover:bg-surface"
              } ${inMonth ? "" : "opacity-50"}`}
            >
              {day}
              <span
                aria-hidden="true"
                className={`mt-0.5 h-1.5 w-1.5 rounded-full ${markerClass}`}
              />
            </button>
          );
        })}
      </div>
      <p className="mt-3 flex items-center gap-4 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-primary"
          />
          {CALENDAR_LEGEND_PERSISTED}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full border border-primary bg-transparent"
          />
          {CALENDAR_LEGEND_SCHEDULED}
        </span>
      </p>
    </div>
  );
}
