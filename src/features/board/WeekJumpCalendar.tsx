import { cn } from "cn";
import { useState } from "react";

import { monthLabel, monthOfIso, shiftMonth } from "@/lib/calendar";
import { Weekday } from "@/lib/enums";
import {
  BOARD_JUMP_HINT_LABEL,
  CALENDAR_NEXT_LABEL,
  CALENDAR_PREVIOUS_LABEL,
  WEEKDAY_OPTIONS,
} from "@/lib/labels";
import { weekDates } from "@/lib/utils";
import { MonthCalendar } from "@/shared/patterns/MonthCalendar";

import type { MonthCalendarDayClassName } from "@/shared/patterns/MonthCalendar";
import type { WeekdayLabel } from "@/shared/patterns/WeekdayPicker";

// labels.ts stays the single source of weekday copy: MonthCalendar's own
// default derives the same strings from the wire name, but its formatDay
// contract exists so feature callers keep the registry authoritative.
const formatDay = (day: Weekday): WeekdayLabel => {
  const option = WEEKDAY_OPTIONS.find((o) => o.value === day);
  return {
    label: option?.label ?? day,
    short: option?.short ?? day.slice(0, 2),
  };
};

interface WeekJumpCalendarProps {
  // A date inside the currently-viewed week — its month renders first
  // and its week is the highlighted band.
  anchorIso: string;
  weekStart: Weekday;
  onPick: (iso: string) => void;
}

/// Thin domain wrapper over MonthCalendar: the pattern supplies the
/// month grid, nav, weekday header, and today dot; this wrapper owns the
/// week band — a selected WEEK, not a single date, so the emphasis rides
/// dayClassName rather than selectedDate (which would also add an
/// aria-current the legacy markup never had). The popover chrome around
/// it (open state, backdrop, Escape) stays BoardHeader's.
export function WeekJumpCalendar({
  anchorIso,
  weekStart,
  onPick,
}: Readonly<WeekJumpCalendarProps>) {
  const selectedWeek = weekDates(anchorIso, weekStart);
  const [month, setMonth] = useState(() => monthOfIso(anchorIso));
  const monthDate = new Date(month);

  // Band cells keep the legacy look: bg-primary/20 with no hover wash
  // (the default cell's hover:bg-surface is overridden here), padding
  // days muted like the rest of the grid.
  const dayClassName: MonthCalendarDayClassName = (cell) =>
    selectedWeek.includes(cell.iso)
      ? cn(
          "bg-primary/20 hover:bg-primary/20",
          cell.inMonth ? "text-text" : "text-text-muted",
        )
      : "";

  return (
    <div
      role="dialog"
      aria-label={monthLabel(
        monthDate.getUTCFullYear(),
        monthDate.getUTCMonth(),
      )}
      className="rounded-lg border border-border bg-surface-raised p-4"
    >
      <MonthCalendar
        month={monthDate}
        weekStart={weekStart}
        onSelect={onPick}
        onMonthShift={(delta) => setMonth((m) => shiftMonth(m, delta))}
        navLabels={{
          previous: CALENDAR_PREVIOUS_LABEL,
          next: CALENDAR_NEXT_LABEL,
        }}
        formatDay={formatDay}
        dayClassName={dayClassName}
      />
      <p className="mt-2 text-xs text-text-muted">{BOARD_JUMP_HINT_LABEL}</p>
    </div>
  );
}
