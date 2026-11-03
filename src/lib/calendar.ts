import { Weekday } from "@/lib/enums";
import { WEEKDAY_OPTIONS } from "@/lib/labels";

export const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

export const toIso = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export const monthLabel = (year: number, month: number, locale?: string) =>
  new Date(Date.UTC(year, month, 1)).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export interface MonthCell {
  iso: string;
  inMonth: boolean;
  day: number;
}

/// Display copy for one weekday — the weekday headers and day chips in
/// shared/patterns (WeekdayPicker, MonthCalendar) take theirs via a
/// `formatDay` callback returning this shape.
export interface WeekdayLabel {
  /// Full day name — the accessible name (`aria-label`, header `title`).
  label: string;
  /// Short day text — the visible chip/header content.
  short: string;
}

/// The 42-cell month grid starting on the configured week day —
/// shared by every calendar in the app (instance picker, week jump).
export const monthCells = (month: number, weekStart: Weekday): MonthCell[] => {
  const first = new Date(month);
  // JS getUTCDay is Sunday-based; Weekday is Monday-first.
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
};

export const shiftMonth = (month: number, delta: number) => {
  const d = new Date(month);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1);
};

/// Epoch ms for the first of a "YYYY-MM-DD" date's month.
export const monthOfIso = (iso: string) =>
  Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, 1);
