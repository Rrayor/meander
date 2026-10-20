import type { Recurrence } from "@/api/bindings";
import {
  REPEAT_NTH_OPTIONS,
  REPEAT_UNIT_OPTIONS,
  WEEKDAY_OPTIONS,
} from "@/lib/labels";
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

const weekdayLabel = (value: string) =>
  WEEKDAY_OPTIONS.find((w) => w.value === value)?.label ?? value;

const UNIT = Object.fromEntries(
  REPEAT_UNIT_OPTIONS.map((o) => [o.value, o.label]),
) as Record<string, string>;

// Human-readable schedule description for the series audit line, e.g.
// "every 2 weeks on Monday and Friday".
export const describeRecurrence = (recurrence: Recurrence): string => {
  const cadence = (interval: number, unit: string) =>
    interval === 1 ? `every ${unit.slice(0, -1)}` : `every ${interval} ${unit}`;
  switch (recurrence.kind) {
    case "daily":
      return cadence(recurrence.interval_days, UNIT.day);
    case "weekly": {
      const days = recurrence.weekdays.map(weekdayLabel).join(" and ");
      return `${cadence(recurrence.interval_weeks, UNIT.week)} on ${days}`;
    }
    case "monthly_day":
      return `${cadence(recurrence.interval_months, UNIT.month)} on day ${recurrence.day}`;
    case "monthly_nth_weekday": {
      const nth = REPEAT_NTH_OPTIONS.find(
        (o) => o.value === String(recurrence.nth),
      )?.aria;
      return `${cadence(recurrence.interval_months, UNIT.month)} on the ${nth} ${weekdayLabel(recurrence.weekday)}`;
    }
    case "workday_after":
      return `the first workday after day ${recurrence.day}`;
  }
};
