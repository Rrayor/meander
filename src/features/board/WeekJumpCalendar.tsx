import { useMemo, useState } from "react";

import { MonthNav } from "@/features/calendar/MonthNav";
import { monthCells, monthLabel, monthOfIso, shiftMonth } from "@/lib/calendar";
import { Weekday } from "@/lib/enums";
import { BOARD_JUMP_HINT_LABEL, weekdaysFrom } from "@/lib/labels";
import { formatIsoDay, todayLocalIso, weekDates } from "@/lib/utils";

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

  const [month, setMonth] = useState(() => monthOfIso(anchorIso));
  const currentMonth = monthOfIso(todayIso);

  const cells = useMemo(() => monthCells(month, weekStart), [month, weekStart]);

  // Future boards don't exist yet — any day whose week starts after
  // the current week's start is disabled.
  const disabled = (iso: string) =>
    weekDates(iso, weekStart)[0] > todayWeekStart;
  const inSelectedWeek = (iso: string) => selectedWeek.includes(iso);

  return (
    <dialog
      open
      aria-label={monthLabel(
        new Date(month).getUTCFullYear(),
        new Date(month).getUTCMonth(),
      )}
      className="rounded-lg border border-border bg-surface-raised p-4"
    >
      <MonthNav
        month={month}
        onShift={(delta) => setMonth((m) => shiftMonth(m, delta))}
        nextDisabled={month >= currentMonth}
      />
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
              aria-label={formatIsoDay(cell.iso)}
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
    </dialog>
  );
}
