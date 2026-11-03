import { z } from "zod";

import type { NewSeries, Recurrence } from "@/api/bindings";
import { MonthMode, RecurrenceKind, RepeatUnit, Weekday } from "@/lib/enums";
import {
  REPEAT_ENDS_BEFORE_START_MESSAGE,
  REPEAT_ENDS_INVALID_MESSAGE,
  REPEAT_ENDS_NO_OCCURRENCE_MESSAGE,
  REPEAT_NTH_OPTIONS,
  REPEAT_STARTS_INVALID_MESSAGE,
  REPEAT_STARTS_REQUIRED_MESSAGE,
  WEEKDAY_OPTIONS,
} from "@/lib/labels";
import { firstOccurrence } from "@/lib/recurrence";
import { todayLocalIso, weekdayOfIso } from "@/lib/utils";

export interface RepeatDraft {
  interval: number;
  unit: RepeatUnit;
  weekdays: Weekday[];
  monthMode: MonthMode;
  day: number;
  nth: number;
  weekday: Weekday;
  startDate: string;
  endDate: string;
}

// Monthly defaults derive from the start date too — the first instance is
// the task itself, so an untouched schedule should include its own date.
// A 5th occurrence isn't expressible (nth is 1-4 or last), so days past the
// fourth week collapse to "last".
export const monthlyDefaults = (iso: string) => {
  const day = Number(iso.slice(8, 10));
  const occurrence = Math.ceil(day / 7);
  return {
    day,
    nth: occurrence >= 5 ? -1 : occurrence,
    weekday: weekdayOfIso(iso),
  };
};

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Mirrors series.rs::iso_date — a real Gregorian date, not just the shape.
const isLeapYear = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const daysInMonth = (year: number, month: number) => {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
};

const isRealIsoDate = (iso: string) => {
  if (!ISO_DATE_PATTERN.test(iso)) return false;
  const [year, month, day] = iso.split("-").map(Number);
  return (
    month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
  );
};

export const toRecurrence = (draft: RepeatDraft): Recurrence => {
  switch (draft.unit) {
    case RepeatUnit.Day:
      return { kind: RecurrenceKind.Daily, interval_days: draft.interval };
    case RepeatUnit.Week:
      return {
        kind: RecurrenceKind.Weekly,
        interval_weeks: draft.interval,
        weekdays: draft.weekdays,
      };
    case RepeatUnit.Month:
      return draft.monthMode === MonthMode.Day
        ? {
            kind: RecurrenceKind.MonthlyDay,
            interval_months: draft.interval,
            day: draft.day,
          }
        : {
            kind: RecurrenceKind.MonthlyNthWeekday,
            interval_months: draft.interval,
            nth: draft.nth,
            weekday: draft.weekday,
          };
  }
};

export const toNewSeries = (draft: RepeatDraft): NewSeries => ({
  recurrence: toRecurrence(draft),
  start_date: draft.startDate,
  end_date: draft.endDate === "" ? null : draft.endDate,
});

// Mirrors the backend's bounds (series.rs::validate / iso_date); the
// backend stays authoritative — this schema exists for immediate feedback.
const draftSchema = z
  .object({
    interval: z.number().int().min(1),
    unit: z.enum(RepeatUnit),
    weekdays: z.array(z.enum(Weekday)),
    monthMode: z.enum(MonthMode),
    day: z.number().int().min(1).max(31),
    nth: z.number().int(),
    weekday: z.enum(Weekday),
    startDate: z
      .string()
      .min(1, REPEAT_STARTS_REQUIRED_MESSAGE)
      .refine(isRealIsoDate, REPEAT_STARTS_INVALID_MESSAGE),
    endDate: z
      .string()
      .refine(
        (iso) => iso === "" || isRealIsoDate(iso),
        REPEAT_ENDS_INVALID_MESSAGE,
      ),
  })
  .superRefine((draft, ctx) => {
    const { startDate, endDate } = draft;
    if (!isRealIsoDate(startDate) || !isRealIsoDate(endDate)) return;
    if (endDate < startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: REPEAT_ENDS_BEFORE_START_MESSAGE,
      });
      return;
    }
    // Mirrors the backend's first-occurrence rejection (tasks.rs's
    // first_instance_date): an end before the first matching day makes
    // the schedule unreachable.
    const first = firstOccurrence(
      toRecurrence(draft as RepeatDraft),
      startDate,
    );
    if (first === null || first > endDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: REPEAT_ENDS_NO_OCCURRENCE_MESSAGE,
      });
    }
  });

export type DraftErrors = Partial<Record<"startDate" | "endDate", string>>;

export const validateDraft = (draft: RepeatDraft): DraftErrors => {
  const result = draftSchema.safeParse(draft);
  if (result.success) return {};
  const errors: DraftErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (field === "startDate" || field === "endDate") {
      errors[field] ??= issue.message;
    }
  }
  return errors;
};

export const firstError = (errors: DraftErrors) =>
  errors.startDate ?? errors.endDate ?? null;

export const defaultDraft = (): RepeatDraft => ({
  interval: 1,
  unit: RepeatUnit.Day,
  weekdays: [weekdayOfIso(todayLocalIso())],
  monthMode: MonthMode.Day,
  ...monthlyDefaults(todayLocalIso()),
  startDate: todayLocalIso(),
  endDate: "",
});

// Inverse of toNewSeries — seeds the editor from an existing schedule.
// workday_after can't be stored (the backend rejects it), so the union's
// last variant is unreachable here.
export const draftFromSeries = (series: NewSeries): RepeatDraft => {
  const base = {
    monthMode: MonthMode.Day,
    ...monthlyDefaults(series.start_date),
    weekdays: [] as Weekday[],
    startDate: series.start_date,
    endDate: series.end_date ?? "",
  };
  // The discriminant is the specta wire union — matching its literal
  // members is the only way to narrow the recurrence variants.
  switch (series.recurrence.kind) {
    case "daily":
      return {
        ...base,
        interval: series.recurrence.interval_days,
        unit: RepeatUnit.Day,
      };
    case "weekly":
      return {
        ...base,
        interval: series.recurrence.interval_weeks,
        unit: RepeatUnit.Week,
        weekdays: series.recurrence.weekdays as Weekday[],
      };
    case "monthly_day":
      return {
        ...base,
        interval: series.recurrence.interval_months,
        unit: RepeatUnit.Month,
        monthMode: MonthMode.Day,
        day: series.recurrence.day,
      };
    case "monthly_nth_weekday":
      return {
        ...base,
        interval: series.recurrence.interval_months,
        unit: RepeatUnit.Month,
        monthMode: MonthMode.Weekday,
        nth: series.recurrence.nth,
        weekday: series.recurrence.weekday as Weekday,
      };
    case "workday_after":
      throw new Error("workday_after schedules are not yet supported");
  }
};

const pluralize = (interval: number, singular: string) =>
  interval === 1 ? `Every ${singular}` : `Every ${interval} ${singular}s`;

export const summarize = (draft: RepeatDraft): string => {
  switch (draft.unit) {
    case RepeatUnit.Day:
      return pluralize(draft.interval, "day");
    case RepeatUnit.Week: {
      const days = WEEKDAY_OPTIONS.filter((w) =>
        draft.weekdays.includes(w.value),
      )
        .map((w) => w.label)
        .join(", ");
      return `${pluralize(draft.interval, "week")} on ${days}`;
    }
    case RepeatUnit.Month: {
      const span = pluralize(draft.interval, "month");
      if (draft.monthMode === MonthMode.Day)
        return `${span} on day ${draft.day}`;
      const nth = REPEAT_NTH_OPTIONS.find((o) => o.value === draft.nth)?.aria;
      const weekday = WEEKDAY_OPTIONS.find(
        (w) => w.value === draft.weekday,
      )?.label;
      return `${span} on the ${nth} ${weekday}`;
    }
  }
};

// The round weekday-chip look shared by the weekly picker and the monthly
// nth-weekday row — sized down from the Toggle recipe's default box.
export const WEEKDAY_CHIP_CLASSES =
  "flex h-8 w-8 items-center justify-center rounded-full px-0 py-0 text-xs font-medium data-[pressed]:border-primary";

// Segment-pill look for bordered ToggleGroup containers (repeat unit, nth
// occurrence): the pill border lives on the group, so the toggle drops its
// own border and fills with the raised surface while pressed.
export const SEGMENT_TOGGLE_CLASSES =
  "border-0 rounded text-text-muted hover:text-text data-[pressed]:bg-surface-raised data-[pressed]:text-primary";

// The source's `bg-surface-dim` never resolved — no such @theme token —
// so the transparent group background it always rendered is kept as-is.
export const SEGMENT_GROUP_CLASSES = "rounded border border-border p-0.5";
