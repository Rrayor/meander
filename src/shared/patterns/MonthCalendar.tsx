import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment, useMemo } from "react";

import { monthCells, monthLabel } from "@/lib/calendar";
import { ComponentSize, Weekday } from "@/lib/enums";
import { formatIsoDay, todayLocalIso } from "@/lib/utils";

import { IconButton } from "../ui/IconButton";

import type { MonthCell } from "@/lib/calendar";
import type { ComponentProps, ReactNode } from "react";
import type { WeekdayLabel } from "./WeekdayPicker";

/** Accessible names for the previous/next month nav buttons. */
export interface MonthCalendarNavLabels {
  previous: string;
  next: string;
}

/** Per-cell flags handed to `dayClassName`. */
export interface MonthCalendarDayState {
  /** The cell equals `selectedDate`. */
  selected: boolean;
  /** The cell's ISO date is in `markedDates`. */
  marked: boolean;
  /** The cell's ISO date is the local today. */
  today: boolean;
  /** The cell belongs to the displayed month (padding cells are false). */
  inMonth: boolean;
}

/** Per-cell class hook — domain wrappers restyle cells without baked
 * variants (WeekJumpCalendar's week band, InstanceCalendar's rings). */
export type MonthCalendarDayClassName = (
  cell: MonthCell,
  state: MonthCalendarDayState,
) => string;

/** Full per-cell renderer for domain wrappers whose days aren't the
 * uniform button DayCell paints — InstanceCalendar's inert spans and
 * filled/hollow markers. When set, the cell's markup (label, selectable
 * affordance, marker) is entirely the callback's; the calendar still
 * supplies the nav, weekday header, and grid. */
export type MonthCalendarRenderDay = (
  cell: MonthCell,
  state: MonthCalendarDayState,
) => ReactNode;

// shared/ cannot import @/lib/labels (layering rule, eslint.config.js),
// so the nav copy defaults mirror CALENDAR_PREVIOUS_LABEL /
// CALENDAR_NEXT_LABEL from there — exported so the colocated test asserts
// the defaults through the same constant. Feature callers pass the
// registry values through `navLabels` when they migrate
// (InstanceCalendar, WeekJumpCalendar) so labels.ts stays the single
// source of copy — the same arrangement WeekdayPicker documents for
// `formatDay`.
export const DEFAULT_NAV_LABELS: MonthCalendarNavLabels = {
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

interface MonthCalendarProps extends Omit<
  ComponentProps<"div">,
  "children" | "onSelect"
> {
  /** First day of the displayed month — its UTC components are read. */
  month: Date;
  /** Weekday opening each grid row. The caller supplies the profile's
   * week-start setting; the pattern fetches nothing. */
  weekStart: Weekday;
  /** Emphasized ISO date — the soft `bg-primary/20` highlight plus
   * `aria-current="date"`. Multi-day emphasis (WeekJumpCalendar's week
   * band) is composed per-cell through `dayClassName`. */
  selectedDate?: string;
  /** ISO dates rendered with the dot marker — the same dot today's cell
   * gets; a date is dotted when it is in this set or is today. */
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
  /** Extra classes per day cell, applied last so domain wrappers can
   * restyle cells (week bands, hollow rings) without baked variants. */
  dayClassName?: MonthCalendarDayClassName;
  /** Replaces the default DayCell per cell — see the type's note. The
      callback owns onSelect wiring for the cells it renders. */
  renderDay?: MonthCalendarRenderDay;
}

interface DayCellProps {
  cell: MonthCell;
  selected: boolean;
  marked: boolean;
  today: boolean;
  onSelect: (iso: string) => void;
  dayClassName?: MonthCalendarDayClassName;
}

// One grid cell — WeekJumpCalendar's flat `relative py-1` geometry with
// its conditional absolute today-dot markup reused for every mark.
function DayCell({
  cell,
  selected,
  marked,
  today,
  onSelect,
  dayClassName,
}: Readonly<DayCellProps>) {
  return (
    <button
      type="button"
      // Day-of-month alone is ambiguous across the padding cells
      // of adjacent months — the formatted date is the name.
      aria-label={formatIsoDay(cell.iso)}
      aria-current={selected ? "date" : undefined}
      onClick={() => onSelect(cell.iso)}
      className={cn(
        "relative py-1 text-center text-xs transition-colors",
        selected ? "bg-primary/20 text-text" : "hover:bg-surface",
        !cell.inMonth && "text-text-muted",
        dayClassName?.(cell, {
          selected,
          marked,
          today,
          inMonth: cell.inMonth,
        }),
      )}
    >
      {cell.day}
      {(marked || today) && (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0.5 mx-auto h-1 w-1 rounded-full bg-primary"
        />
      )}
    </button>
  );
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
  dayClassName,
  renderDay,
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
  const todayIso = todayLocalIso();

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
      <div className="mt-2 grid grid-cols-7 gap-px">
        {weekdayOrder.map((day) => {
          const { label, short } = formatDay(day);
          return (
            <span
              key={day}
              title={label}
              className="py-1 text-center text-xs font-medium text-text-muted"
            >
              {short}
            </span>
          );
        })}
        {cells.map((cell) => {
          const state: MonthCalendarDayState = {
            selected: cell.iso === selectedDate,
            marked: markedDates?.has(cell.iso) ?? false,
            today: cell.iso === todayIso,
            inMonth: cell.inMonth,
          };
          return renderDay ? (
            <Fragment key={cell.iso}>{renderDay(cell, state)}</Fragment>
          ) : (
            <DayCell
              key={cell.iso}
              cell={cell}
              selected={state.selected}
              marked={state.marked}
              today={state.today}
              onSelect={onSelect}
              dayClassName={dayClassName}
            />
          );
        })}
      </div>
    </div>
  );
}

export type { MonthCalendarProps };
