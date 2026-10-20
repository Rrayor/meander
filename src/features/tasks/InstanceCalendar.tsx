import { useMemo, useState } from "react";

import type { Task, TaskSeries } from "@/api/bindings";
import {
  CALENDAR_NEXT_LABEL,
  CALENDAR_PREVIOUS_LABEL,
  WEEKDAY_OPTIONS,
} from "@/lib/labels";
import { isScheduledOn } from "@/lib/recurrence";
import { todayLocalIso } from "@/lib/utils";

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

const toIso = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// Monday (index 0) through Sunday — the planner's week order.
const WEEK_ORDER = [...WEEKDAY_OPTIONS.slice(1), WEEKDAY_OPTIONS[0]];

const monthLabel = (year: number, month: number, locale?: string) =>
  new Date(Date.UTC(year, month, 1)).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

interface InstanceCalendarProps {
  series: TaskSeries;
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
  const anchor = selectedIso ?? todayLocalIso();
  const [month, setMonth] = useState(() =>
    Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)) - 1, 1),
  );

  const cells = useMemo(() => {
    const first = new Date(month);
    // Offset back to the Monday of the first displayed week.
    const monday = new Date(month - ((first.getUTCDay() + 6) % 7) * DAY_MS);
    // Six weeks covers every possible month layout.
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(monday.getTime() + i * DAY_MS);
      return {
        iso: toIso(date),
        inMonth: date.getUTCMonth() === first.getUTCMonth(),
        day: date.getUTCDate(),
      };
    });
  }, [month]);

  const monthDate = new Date(month);
  const shiftMonth = (delta: number) =>
    setMonth((m) => {
      const d = new Date(m);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1);
    });

  const pick = (iso: string) =>
    onPick(instances.find((t) => t.scheduled_date === iso) ?? null, iso);

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4">
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
            className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface hover:text-text"
          >
            ›
          </button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {WEEK_ORDER.map((w) => (
          <span key={w.value} className="text-center text-xs text-text-muted">
            {w.short}
          </span>
        ))}
        {cells.map(({ iso, inMonth, day }) => {
          const scheduled = isScheduledOn(
            series.recurrence,
            series.start_date,
            series.end_date,
            iso,
          );
          if (!scheduled) {
            return (
              <span
                key={iso}
                className={`py-1 text-center text-xs ${
                  inMonth ? "text-text-muted" : "text-text-muted/40"
                }`}
              >
                {day}
              </span>
            );
          }
          const selected = iso === selectedIso;
          return (
            <button
              key={iso}
              type="button"
              aria-pressed={selected}
              onClick={() => pick(iso)}
              className={`rounded-md py-1 text-center text-xs transition-colors ${
                selected
                  ? "bg-primary font-medium text-on-primary"
                  : "text-text hover:bg-surface"
              } ${inMonth ? "" : "opacity-50"}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
