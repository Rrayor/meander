import { useMemo, useState } from "react";

import { Weekday } from "@/lib/enums";
import {
  BOARD_JUMP_HINT_LABEL,
  CALENDAR_NEXT_LABEL,
  CALENDAR_PREVIOUS_LABEL,
  WEEKDAY_OPTIONS,
  weekdaysFrom,
} from "@/lib/labels";
import { formatDate, todayLocalIso, weekDates } from "@/lib/utils";

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

const toIso = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

const monthLabel = (year: number, month: number, locale?: string) =>
  new Date(Date.UTC(year, month, 1)).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

interface WeekJumpCalendarProps {
  // A date inside the currently-viewed week — its month renders first
  // and its week is the highlighted band.
  anchorIso: string;
  weekStart: Weekday;
  onPick: (iso: string) => void;
}

export function WeekJumpCalendar({
  anchorIso,
  weekStart,
  onPick,
}: Readonly<WeekJumpCalendarProps>) {
  const todayIso = todayLocalIso();
  const weekOrder = weekdaysFrom(weekStart);
  const selectedWeek = weekDates(anchorIso, weekStart);
  const todayWeekStart = weekDates(todayIso, weekStart)[0];

  const [month, setMonth] = useState(() =>
    Date.UTC(
      Number(anchorIso.slice(0, 4)),
      Number(anchorIso.slice(5, 7)) - 1,
      1,
    ),
  );
  const currentMonth = Date.UTC(
    Number(todayIso.slice(0, 4)),
    Number(todayIso.slice(5, 7)) - 1,
    1,
  );

  const cells = useMemo(() => {
    const first = new Date(month);
    // Offset back to the configured week start of the first displayed
    // week. JS getUTCDay is Sunday-based; Weekday is Monday-first.
    const configured =
      weekStart === Weekday.Sunday
        ? 0
        : WEEKDAY_OPTIONS.findIndex((o) => o.value === weekStart) + 1;
    const back = ((first.getUTCDay() - configured + 7) % 7) * DAY_MS;
    const firstCell = new Date(month - back);
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(firstCell.getTime() + i * DAY_MS);
      return {
        iso: toIso(date),
        inMonth: date.getUTCMonth() === first.getUTCMonth(),
        day: date.getUTCDate(),
      };
    });
  }, [month, weekStart]);

  const monthDate = new Date(month);
  const shiftMonth = (delta: number) =>
    setMonth((m) => {
      const d = new Date(m);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1);
    });

  // Future boards don't exist yet — any day whose week starts after
  // the current week's start is disabled.
  const disabled = (iso: string) =>
    weekDates(iso, weekStart)[0] > todayWeekStart;
  const inSelectedWeek = (iso: string) => selectedWeek.includes(iso);

  return (
    <div
      role="dialog"
      aria-label={monthLabel(
        monthDate.getUTCFullYear(),
        monthDate.getUTCMonth(),
      )}
      className="rounded-lg border border-border bg-surface-raised p-4"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text">
          {monthLabel(monthDate.getUTCFullYear(), monthDate.getUTCMonth())}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label={CALENDAR_PREVIOUS_LABEL}
            onClick={() => shiftMonth(-1)}
            className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface hover:text-text"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={CALENDAR_NEXT_LABEL}
            onClick={() => shiftMonth(1)}
            disabled={month >= currentMonth}
            className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            ›
          </button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-px">
        {weekOrder.map((w) => (
          <span
            key={w.value}
            className="py-1 text-center text-xs font-medium text-text-muted"
          >
            {w.label.slice(0, 2)}
          </span>
        ))}
        {cells.map((cell) => {
          const selected = inSelectedWeek(cell.iso);
          return (
            <button
              key={cell.iso}
              type="button"
              aria-label={formatDate(cell.iso)}
              disabled={disabled(cell.iso)}
              onClick={() => onPick(cell.iso)}
              className={`relative py-1 text-center text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                selected ? "bg-primary/20 text-text" : "hover:bg-surface"
              } ${cell.inMonth ? "" : "text-text-muted"}`}
            >
              {cell.day}
              {cell.iso === todayIso && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0.5 mx-auto h-1 w-1 rounded-full bg-primary"
                />
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-text-muted">{BOARD_JUMP_HINT_LABEL}</p>
    </div>
  );
}
