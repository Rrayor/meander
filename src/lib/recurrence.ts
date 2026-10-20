import type { Recurrence, Weekday } from "@/api/bindings";
import { WEEKDAY_OPTIONS } from "@/lib/labels";
import { weekdayOfIso } from "@/lib/utils";

const DAY_MS = 86_400_000;

// Strict "YYYY-MM-DD" → UTC epoch of that calendar day; null when the input
// isn't a real Gregorian date (mirrors the backend's iso_date validation).
const dayEpoch = (iso: string): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const epoch = Date.UTC(year, month - 1, day);
  const check = new Date(epoch);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return epoch;
};

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

// Monday of the week containing `epoch` (all epochs here are UTC days).
const mondayOf = (epoch: number) => {
  const dow = new Date(epoch).getUTCDay();
  return epoch - ((dow + 6) % 7) * DAY_MS;
};

const monthsBetween = (from: Date, to: Date) =>
  (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
  (to.getUTCMonth() - from.getUTCMonth());

// Is `iso` a scheduled occurrence of `recurrence` anchored at `startIso`,
// optionally bounded by `endIso`? All dates are "YYYY-MM-DD".
export const isScheduledOn = (
  recurrence: Recurrence,
  startIso: string,
  endIso: string | null,
  iso: string,
): boolean => {
  const start = dayEpoch(startIso);
  const end = endIso === null ? null : dayEpoch(endIso);
  const day = dayEpoch(iso);
  if (start === null || day === null || (endIso !== null && end === null)) {
    return false;
  }
  if (day < start || (end !== null && day > end)) {
    return false;
  }

  const startDate = new Date(start);
  const isoDate = new Date(day);

  switch (recurrence.kind) {
    case "daily": {
      const interval = recurrence.interval_days;
      if (interval <= 0) return false;
      return (day - start) % (interval * DAY_MS) === 0;
    }
    case "weekly": {
      const interval = recurrence.interval_weeks;
      const weekday = weekdayOfIso(iso);
      if (interval <= 0 || !weekday || !recurrence.weekdays.includes(weekday)) {
        return false;
      }
      const weeks = (mondayOf(day) - mondayOf(start)) / (7 * DAY_MS);
      return weeks % interval === 0;
    }
    case "monthly_day": {
      const interval = recurrence.interval_months;
      if (interval <= 0) return false;
      const months = monthsBetween(startDate, isoDate);
      if (months < 0 || months % interval !== 0) return false;
      const clamped = Math.min(
        recurrence.day,
        daysInMonth(isoDate.getUTCFullYear(), isoDate.getUTCMonth() + 1),
      );
      return isoDate.getUTCDate() === clamped;
    }
    case "monthly_nth_weekday": {
      const interval = recurrence.interval_months;
      if (interval <= 0 || weekdayOfIso(iso) !== recurrence.weekday) {
        return false;
      }
      const months = monthsBetween(startDate, isoDate);
      if (months < 0 || months % interval !== 0) return false;
      const dom = isoDate.getUTCDate();
      if (recurrence.nth === -1) {
        return (
          dom + 7 >
          daysInMonth(isoDate.getUTCFullYear(), isoDate.getUTCMonth() + 1)
        );
      }
      return (
        recurrence.nth > 0 && Math.floor((dom - 1) / 7) + 1 === recurrence.nth
      );
    }
    // Workday-after rules are unsupported (workday_rules_unsupported) — a
    // series carrying one can never produce an occurrence here.
    case "workday_after":
      return false;
  }
};

// Weekday value → index (Monday = 0), matching the Rust `Weekday` enum
// order and the WEEKDAY_OPTIONS registry.
const weekdayIndex = (w: Weekday) =>
  WEEKDAY_OPTIONS.findIndex((o) => o.value === w);

// (year, 1-based month) shifted by `months` — month arithmetic can't go
// through Date.UTC without guarding the four-digit year bound.
const shiftMonths = (
  year: number,
  month: number,
  months: number,
): readonly [number, number] => {
  const idx = year * 12 + (month - 1) + months;
  return [Math.floor(idx / 12), (idx % 12) + 1];
};

// Day-of-month of the nth (1-4) or last (-1) `weekday` within a month —
// mirrors series.rs::nth_weekday_day.
const nthWeekdayDay = (
  year: number,
  month: number,
  nth: number,
  weekday: Weekday,
) => {
  const firstDow = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const first = 1 + ((weekdayIndex(weekday) - firstDow + 7) % 7);
  if (nth === -1) {
    return first + 7 * Math.floor((daysInMonth(year, month) - first) / 7);
  }
  return first + 7 * (nth - 1);
};

const toIsoDay = (year: number, month: number, day: number) => {
  if (year > 9999) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
};

// The series' first occurrence on or after `startIso` — mirrors
// series.rs::first_occurrence: weekly/monthly intervals count whole
// periods anchored at the start, so a start date past its period's
// matching day pushes the first occurrence into the next eligible period.
// Null when the recurrence is unusable or the occurrence isn't a
// four-digit ISO date.
export const firstOccurrence = (
  recurrence: Recurrence,
  startIso: string,
): string | null => {
  const start = dayEpoch(startIso);
  if (start === null) return null;
  const s = new Date(start);
  const year = s.getUTCFullYear();
  const month = s.getUTCMonth() + 1;
  const day = s.getUTCDate();

  switch (recurrence.kind) {
    case "daily":
      return recurrence.interval_days > 0 ? startIso : null;
    case "weekly": {
      const { interval_weeks: interval, weekdays } = recurrence;
      const picks = weekdays
        .map(weekdayIndex)
        .filter((i) => i >= 0)
        .sort((a, b) => a - b);
      if (interval <= 0 || picks.length === 0) return null;
      const startWd = (s.getUTCDay() + 6) % 7;
      const anchor = mondayOf(start);
      const sameWeek = picks.find((i) => i >= startWd);
      const epoch =
        sameWeek !== undefined
          ? anchor + sameWeek * DAY_MS
          : anchor + interval * 7 * DAY_MS + picks[0] * DAY_MS;
      const first = new Date(epoch);
      return toIsoDay(
        first.getUTCFullYear(),
        first.getUTCMonth() + 1,
        first.getUTCDate(),
      );
    }
    case "monthly_day": {
      const { interval_months: interval, day: dom } = recurrence;
      if (interval <= 0) return null;
      const clamped = Math.min(dom, daysInMonth(year, month));
      const [y, m] =
        clamped >= day ? [year, month] : shiftMonths(year, month, interval);
      return toIsoDay(y, m, Math.min(dom, daysInMonth(y, m)));
    }
    case "monthly_nth_weekday": {
      const { interval_months: interval, nth, weekday } = recurrence;
      if (
        interval <= 0 ||
        nth === 0 ||
        nth < -1 ||
        nth > 4 ||
        weekdayIndex(weekday) < 0
      ) {
        return null;
      }
      const dom = nthWeekdayDay(year, month, nth, weekday);
      const [y, m, d] =
        dom >= day
          ? [year, month, dom]
          : (() => {
              const [y2, m2] = shiftMonths(year, month, interval);
              return [y2, m2, nthWeekdayDay(y2, m2, nth, weekday)];
            })();
      return toIsoDay(y, m, d);
    }
    case "workday_after":
      return null;
  }
};
