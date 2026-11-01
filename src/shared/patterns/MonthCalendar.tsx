import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";

import { monthCells, monthLabel } from "@/lib/calendar";
import { ComponentSize, Weekday } from "@/lib/enums";
import { formatIsoDay } from "@/lib/utils";

import { IconButton } from "../ui/IconButton";

import type { ComponentProps } from "react";
import type { WeekdayLabel } from "./WeekdayPicker";

/** Accessible names for the previous/next month nav buttons. */
export interface MonthCalendarNavLabels {
  previous: string;
  next: string;
}

// shared/ cannot import @/lib/labels (layering rule, eslint.config.js),
// so the nav copy defaults mirror CALENDAR_PREVIOUS_LABEL /
// CALENDAR_NEXT_LABEL from there. Feature callers pass the registry
// values through `navLabels` when they migrate (InstanceCalendar,
// WeekJumpCalendar) so labels.ts stays the single source of copy — the
// same arrangement WeekdayPicker documents for `formatDay`.
const DEFAULT_NAV_LABELS: MonthCalendarNavLabels = {
  previous: "Previous month",
  next: "Next month",
};

// Weekday is declared Monday-first; the header row rotates it to the
// caller's weekStart — the same rotation weekdaysFrom() performs on
// WEEKDAY_OPTIONS (which lives in the banned labels module).
const WEEKDAY_ORDER: readonly Weekday[] = [
  Weekday.Monday,
  Weekday.Tuesday,
  Weekday.Wednesday,
  Weekday.Thursday,
  Weekday.Friday,
  Weekday.Saturday,
  Weekday.Sunday,
];

// Header copy derives from the Weekday wire name — the same
// "Monday"/"Mo" pairs WeekdayPicker's default produces and
// WEEKDAY_OPTIONS carries today. Callers keep labels.ts authoritative by
// passing `formatDay` backed by weekdaysFrom().
const defaultFormatDay = (day: Weekday): WeekdayLabel => {
  const name = day.charAt(0).toUpperCase() + day.slice(1);
  return { label: name, short: name.slice(0, 2) };
};

interface MonthCalendarProps extends Omit<ComponentProps<"div">, "onSelect"> {
  /** First day of the displayed month — its UTC components are read. */
  month: Date;
  /** Weekday opening each grid row. The caller supplies the profile's
   * week-start setting; the pattern fetches nothing. */
  weekStart: Weekday;
  /** Selected ISO date — strong primary fill + `aria-current="date"`.
   * Multi-day emphasis (WeekJumpCalendar's week band) stays a domain
   * concern of the wrapper, not a baked variant. */
  selectedDate?: string;
  /** ISO dates rendered with the filled-dot marker — the indicator
   * InstanceCalendar uses for persisted instances. A "today" marker is
   * composed by including today's ISO date in this set. */
  markedDates?: ReadonlySet<string>;
  /** Called with the clicked cell's ISO date — every cell is clickable,
   * including adjacent-month padding days. */
  onSelect(date: string): void;
  /** Called with -1/+1 from the nav buttons (the absorbed MonthNav). */
  onMonthShift(delta: number): void;
  /** Nav button accessible names — defaults mirror the labels registry
   * (`CALENDAR_PREVIOUS_LABEL` / `CALENDAR_NEXT_LABEL`). */
  navLabels?: MonthCalendarNavLabels;
  /** Column-header copy — defaults derive from the Weekday wire name. */
  formatDay?: (day: Weekday) => WeekdayLabel;
}

export function MonthCalendar({
  month,
  weekStart,
  selectedDate,
  markedDates,
  onSelect,
  onMonthShift,
  navLabels = DEFAULT_NAV_LABELS,
  formatDay = defaultFormatDay,
  className,
  ...rest
}: Readonly<MonthCalendarProps>) {
  const cells = useMemo(
    () => monthCells(month.getTime(), weekStart),
    [month, weekStart],
  );
  const weekdayOrder = useMemo(() => {
    const start = WEEKDAY_ORDER.indexOf(weekStart);
    return [...WEEKDAY_ORDER.slice(start), ...WEEKDAY_ORDER.slice(0, start)];
  }, [weekStart]);
  const title = monthLabel(month.getUTCFullYear(), month.getUTCMonth());

  const handlePrevious = () => onMonthShift(-1);
  const handleNext = () => onMonthShift(1);

  return (
    <div className={className} {...rest}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text">{title}</span>
        <div className="flex gap-1">
          <IconButton
            icon={ChevronLeft}
            label={navLabels.previous}
            size={ComponentSize.Sm}
            onClick={handlePrevious}
          />
          <IconButton
            icon={ChevronRight}
            label={navLabels.next}
            size={ComponentSize.Sm}
            onClick={handleNext}
          />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {weekdayOrder.map((day) => {
          const { label, short } = formatDay(day);
          return (
            <span
              key={day}
              title={label}
              className="text-center text-xs font-medium text-text-muted"
            >
              {short}
            </span>
          );
        })}
        {cells.map((cell) => {
          const selected = cell.iso === selectedDate;
          const marked = markedDates?.has(cell.iso) ?? false;
          return (
            <button
              key={cell.iso}
              type="button"
              // Day-of-month alone is ambiguous across the padding cells
              // of adjacent months — the formatted date is the name.
              aria-label={formatIsoDay(cell.iso)}
              aria-current={selected ? "date" : undefined}
              onClick={() => onSelect(cell.iso)}
              className={cn(
                "flex flex-col items-center rounded-md py-1 text-center text-xs transition-colors",
                selected
                  ? "bg-primary font-medium text-on-primary"
                  : "text-text hover:bg-surface",
                !cell.inMonth && "opacity-50",
              )}
            >
              {cell.day}
              {/* The marker row renders even when unmarked so every cell
                  keeps the same height across the grid. */}
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 h-1.5 w-1.5 rounded-full",
                  marked
                    ? selected
                      ? "bg-on-primary"
                      : "bg-primary"
                    : "invisible",
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type { MonthCalendarProps };
