import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { useState } from "react";

import type { Task, TaskSeries } from "@/api/bindings";
import { monthOfIso, shiftMonth } from "@/lib/calendar";
import { weekStart as fetchWeekStart } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import { Weekday } from "@/lib/enums";
import {
  CALENDAR_LEGEND_PERSISTED,
  CALENDAR_LEGEND_SCHEDULED,
  CALENDAR_NEXT_LABEL,
  CALENDAR_PREVIOUS_LABEL,
} from "@/lib/labels";
import { isScheduledOn } from "@/lib/recurrence";
import { todayLocalIso } from "@/lib/utils";
import { MonthCalendar } from "@/shared/patterns/MonthCalendar";
import type { MonthCalendarDayState } from "@/shared/patterns/MonthCalendar";

interface InstanceCalendarProps {
  // The earlier segments plus the living series — a date is
  // scheduled when any segment's window produces it.
  series: TaskSeries[];
  instances: Task[];
  skipped?: string[];
  selectedIso: string | null;
  onPick: (task: Task | null, iso: string) => void;
}

// Thin domain wrapper over MonthCalendar: the calendar supplies month
// math, nav, and the weekday header; the cells keep their domain looks
// via renderDay — a persisted instance gets a filled dot, a merely-
// scheduled occurrence a hollow ring, and unscheduled days stay inert
// text rather than selectable buttons.
export function InstanceCalendar({
  series,
  instances,
  skipped,
  selectedIso,
  onPick,
}: Readonly<InstanceCalendarProps>) {
  const { data: weekStart = Weekday.Monday } = useQuery({
    queryKey: QUERY_KEYS.weekStart,
    queryFn: fetchWeekStart,
  });

  const anchor = selectedIso ?? todayLocalIso();
  const [month, setMonth] = useState(() => monthOfIso(anchor));

  const pick = (iso: string) =>
    onPick(instances.find((t) => t.scheduled_date === iso) ?? null, iso);

  const renderDay = (
    cell: { iso: string; day: number; inMonth: boolean },
    { selected }: MonthCalendarDayState,
  ) => {
    // A persisted instance stays reachable even if its date no
    // longer matches the schedule (e.g. after a series edit).
    const persisted = instances.some((t) => t.scheduled_date === cell.iso);
    // A tombstoned date is vacated — a moved-away or skipped
    // occurrence must not still read as "expected" (§228: a move
    // relocates the instance; the old slot is empty, not pending).
    const scheduled =
      persisted ||
      (!skipped?.includes(cell.iso) &&
        series.some((segment) =>
          isScheduledOn(
            segment.recurrence,
            segment.start_date,
            segment.end_date,
            cell.iso,
          ),
        ));
    if (!scheduled) {
      // Padding days outside the month stay blank — showing them
      // faded fails contrast and adds noise.
      if (!cell.inMonth) return <span />;
      return (
        <span className="py-1 text-center text-xs text-text-muted">
          {cell.day}
        </span>
      );
    }
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
        type="button"
        // Day-of-month alone is ambiguous across adjacent months.
        aria-label={cell.iso}
        aria-current={selected ? "date" : undefined}
        onClick={() => pick(cell.iso)}
        className={cn(
          "flex flex-col items-center rounded-md py-1 text-center text-xs transition-colors",
          selected
            ? "bg-primary font-medium text-on-primary"
            : "text-text hover:bg-surface",
          !cell.inMonth && "opacity-50",
        )}
      >
        {cell.day}
        <span
          aria-hidden="true"
          className={cn("mt-0.5 h-1.5 w-1.5 rounded-full", markerClass)}
        />
      </button>
    );
  };

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4">
      <MonthCalendar
        month={new Date(month)}
        weekStart={weekStart}
        selectedDate={selectedIso ?? undefined}
        onSelect={pick}
        onMonthShift={(delta) => setMonth((m) => shiftMonth(m, delta))}
        navLabels={{
          previous: CALENDAR_PREVIOUS_LABEL,
          next: CALENDAR_NEXT_LABEL,
        }}
        renderDay={renderDay}
      />
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
