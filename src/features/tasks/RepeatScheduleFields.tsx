import { useState } from "react";
import { z } from "zod";

import type { NewSeries, Recurrence, Weekday } from "@/api/bindings";
import {
  REPEAT_ENDS_BEFORE_START_MESSAGE,
  REPEAT_ENDS_INVALID_MESSAGE,
  REPEAT_ENDS_LABEL,
  REPEAT_EVERY_LABEL,
  REPEAT_MONTHLY_CLAMP_HINT,
  REPEAT_NONE_SUMMARY,
  REPEAT_NTH_OPTIONS,
  REPEAT_DAY_OF_MONTH_LABEL,
  REPEAT_ON_DAY_LABEL,
  REPEAT_ON_LABEL,
  REPEAT_ON_THE_LABEL,
  REPEAT_SECTION_LABEL,
  REPEAT_STARTS_INVALID_MESSAGE,
  REPEAT_STARTS_LABEL,
  REPEAT_STARTS_REQUIRED_MESSAGE,
  REPEAT_UNIT_OPTIONS,
  WEEKDAY_OPTIONS,
} from "@/lib/labels";

type Unit = (typeof REPEAT_UNIT_OPTIONS)[number]["value"];
type MonthMode = "day" | "weekday";

interface RepeatDraft {
  interval: number;
  unit: Unit;
  weekdays: Weekday[];
  monthMode: MonthMode;
  day: number;
  nth: number;
  weekday: Weekday;
  startDate: string;
  endDate: string;
}

// The schedule's start is a local calendar date — `toISOString` would take
// the UTC date and can land on tomorrow/yesterday outside UTC.
const todayIso = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const WEEKDAYS_BY_JS_DAY: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const weekdayOf = (iso: string): Weekday =>
  WEEKDAYS_BY_JS_DAY[new Date(`${iso}T12:00:00`).getDay()];

// Monthly defaults derive from the start date too — the first instance is
// the task itself, so an untouched schedule should include its own date.
// A 5th occurrence isn't expressible (nth is 1-4 or last), so days past the
// fourth week collapse to "last".
const monthlyDefaults = (iso: string) => {
  const day = Number(iso.slice(8, 10));
  const occurrence = Math.ceil(day / 7);
  return {
    day,
    nth: occurrence >= 5 ? -1 : occurrence,
    weekday: weekdayOf(iso),
  };
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Mirrors series.rs::iso_date — a real Gregorian date, not just the shape.
const isRealIsoDate = (iso: string) => {
  if (!ISO_DATE_PATTERN.test(iso)) return false;
  const [year, month, day] = iso.split("-").map(Number);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth =
    month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth;
};

// Mirrors the backend's bounds (series.rs::validate / iso_date); the
// backend stays authoritative — this schema exists for immediate feedback.
const draftSchema = z
  .object({
    interval: z.number().int().min(1),
    day: z.number().int().min(1).max(31),
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
  .superRefine(({ startDate, endDate }, ctx) => {
    if (
      isRealIsoDate(startDate) &&
      isRealIsoDate(endDate) &&
      endDate < startDate
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: REPEAT_ENDS_BEFORE_START_MESSAGE,
      });
    }
  });

type DraftErrors = Partial<Record<"startDate" | "endDate", string>>;

const validateDraft = (draft: RepeatDraft): DraftErrors => {
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

const firstError = (errors: DraftErrors) =>
  errors.startDate ?? errors.endDate ?? null;

const defaultDraft = (): RepeatDraft => ({
  interval: 1,
  unit: "day",
  weekdays: [weekdayOf(todayIso())],
  monthMode: "day",
  ...monthlyDefaults(todayIso()),
  startDate: todayIso(),
  endDate: "",
});

const toRecurrence = (draft: RepeatDraft): Recurrence => {
  switch (draft.unit) {
    case "day":
      return { kind: "daily", interval_days: draft.interval };
    case "week":
      return {
        kind: "weekly",
        interval_weeks: draft.interval,
        weekdays: draft.weekdays,
      };
    case "month":
      return draft.monthMode === "day"
        ? {
            kind: "monthly_day",
            interval_months: draft.interval,
            day: draft.day,
          }
        : {
            kind: "monthly_nth_weekday",
            interval_months: draft.interval,
            nth: draft.nth,
            weekday: draft.weekday,
          };
  }
};

const toNewSeries = (draft: RepeatDraft): NewSeries => ({
  recurrence: toRecurrence(draft),
  start_date: draft.startDate,
  end_date: draft.endDate === "" ? null : draft.endDate,
});

const pluralize = (interval: number, singular: string) =>
  interval === 1 ? `Every ${singular}` : `Every ${interval} ${singular}s`;

const summarize = (draft: RepeatDraft): string => {
  switch (draft.unit) {
    case "day":
      return pluralize(draft.interval, "day");
    case "week": {
      const days = WEEKDAY_OPTIONS.filter((w) =>
        draft.weekdays.includes(w.value),
      )
        .map((w) => w.label)
        .join(", ");
      return `${pluralize(draft.interval, "week")} on ${days}`;
    }
    case "month": {
      const span = pluralize(draft.interval, "month");
      if (draft.monthMode === "day") return `${span} on day ${draft.day}`;
      const nth = REPEAT_NTH_OPTIONS.find(
        (o) => o.value === String(draft.nth),
      )?.aria;
      const weekday = WEEKDAY_OPTIONS.find(
        (w) => w.value === draft.weekday,
      )?.label;
      return `${span} on the ${nth} ${weekday}`;
    }
  }
};

const FIELD_CLASSES =
  "rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary";

const segmentClasses = (active: boolean) =>
  `flex-1 rounded px-3 py-1.5 text-center text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-primary ${
    active
      ? "bg-surface-raised text-primary shadow-sm"
      : "text-text-muted hover:text-text"
  }`;

const chipClasses = (selected: boolean) =>
  `flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-primary ${
    selected
      ? "bg-primary text-on-primary shadow-sm"
      : "border border-border bg-surface-raised text-text-muted hover:bg-surface-bright hover:text-text"
  }`;

interface RepeatScheduleFieldsProps {
  idPrefix: string;
  // `error` is the first validation message while a schedule is configured;
  // parents disable submission until it clears.
  onChange: (series: NewSeries | null, error: string | null) => void;
}

// Collapsed ⇔ no schedule: expanding the section emits a default series and
// collapsing clears it. The draft is kept locally so re-expanding restores
// the user's last choices.
export function RepeatScheduleFields({
  idPrefix,
  onChange,
}: Readonly<RepeatScheduleFieldsProps>) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<RepeatDraft>(defaultDraft);
  // The weekday selection tracks the start date until the user picks days
  // manually — the common case is "repeat on the same weekday it starts".
  const [weekdaysTouched, setWeekdaysTouched] = useState(false);
  // The monthly selections track the start date the same way.
  const [monthlyTouched, setMonthlyTouched] = useState(false);

  const errors = expanded ? validateDraft(draft) : {};
  const errorFor = (field: keyof DraftErrors) =>
    errors[field] ? `${idPrefix}-repeat-${field}-error` : undefined;

  const emit = (next: RepeatDraft) => {
    onChange(toNewSeries(next), firstError(validateDraft(next)));
  };

  const patch = (part: Partial<RepeatDraft>) => {
    const next = { ...draft, ...part };
    setDraft(next);
    emit(next);
  };

  const patchMonthly = (part: Partial<RepeatDraft>) => {
    setMonthlyTouched(true);
    patch(part);
  };

  const toggle = () => {
    if (expanded) {
      setExpanded(false);
      onChange(null, null);
    } else {
      setExpanded(true);
      emit(draft);
    }
  };

  const toggleWeekday = (weekday: Weekday) => {
    setWeekdaysTouched(true);
    const next = draft.weekdays.includes(weekday)
      ? draft.weekdays.filter((w) => w !== weekday)
      : [...draft.weekdays, weekday];
    if (next.length > 0) patch({ weekdays: next });
  };

  const onStartChange = (iso: string) => {
    const valid = ISO_DATE_PATTERN.test(iso);
    patch({
      startDate: iso,
      ...(!weekdaysTouched && valid ? { weekdays: [weekdayOf(iso)] } : {}),
      ...(!monthlyTouched && valid ? monthlyDefaults(iso) : {}),
    });
  };

  const weekdayChips = (
    selected: readonly Weekday[],
    onPick: (w: Weekday) => void,
  ) => (
    <div className="flex items-center gap-1.5">
      {WEEKDAY_OPTIONS.map(({ value, label, short }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={selected.includes(value)}
          onClick={() => onPick(value)}
          className={chipClasses(selected.includes(value))}
        >
          {short}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface-raised/40">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls={`${idPrefix}-repeat-panel`}
        className="group flex w-full items-center justify-between rounded-t-lg p-3 text-left transition-colors duration-150 hover:bg-surface-raised focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <span className="text-sm font-medium text-text">
          {REPEAT_SECTION_LABEL}
        </span>
        <span className="flex items-center gap-2">
          <span className="rounded border border-border bg-surface-raised px-1.5 py-0.5 text-xs text-text-muted">
            {expanded ? summarize(draft) : REPEAT_NONE_SUMMARY}
          </span>
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 text-text-muted transition-transform group-hover:text-text ${expanded ? "" : "rotate-180"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="m18 15-6-6-6 6" />
          </svg>
        </span>
      </button>
      {expanded && (
        <div
          id={`${idPrefix}-repeat-panel`}
          className="flex flex-col gap-3 border-t border-border bg-surface/40 p-3"
        >
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${idPrefix}-repeat-interval`}
              className="text-xs font-medium text-text-muted"
            >
              {REPEAT_EVERY_LABEL}
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`${idPrefix}-repeat-interval`}
                type="number"
                min={1}
                value={draft.interval}
                onChange={(e) =>
                  patch({ interval: Math.max(1, Number(e.target.value) || 1) })
                }
                className={`${FIELD_CLASSES} w-14 px-2 py-1.5 text-center`}
              />
              <div
                role="group"
                aria-label="Repeat unit"
                className="flex h-[34px] w-60 items-center rounded border border-border bg-surface-dim p-0.5"
              >
                {REPEAT_UNIT_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={draft.unit === value}
                    onClick={() => patch({ unit: value })}
                    className={segmentClasses(draft.unit === value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {draft.unit === "week" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-text-muted">
                {REPEAT_ON_LABEL}
              </span>
              {weekdayChips(draft.weekdays, toggleWeekday)}
            </div>
          )}
          {draft.unit === "month" && (
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center gap-2">
                <input
                  id={`${idPrefix}-repeat-month-day`}
                  name={`${idPrefix}-repeat-month-mode`}
                  type="radio"
                  checked={draft.monthMode === "day"}
                  onChange={() => patch({ monthMode: "day" })}
                  className="text-primary focus:ring-0"
                />
                <label
                  htmlFor={`${idPrefix}-repeat-month-day`}
                  className="text-xs text-text"
                >
                  {REPEAT_ON_DAY_LABEL}
                </label>
                <input
                  aria-label={REPEAT_DAY_OF_MONTH_LABEL}
                  type="number"
                  min={1}
                  max={31}
                  value={draft.day}
                  onChange={(e) =>
                    patchMonthly({
                      monthMode: "day",
                      day: Math.min(
                        31,
                        Math.max(1, Number(e.target.value) || 1),
                      ),
                    })
                  }
                  className="w-12 rounded border border-border bg-surface-raised px-2 py-1 text-center text-sm text-text outline-none focus:border-primary"
                />
              </div>
              {draft.monthMode === "day" && draft.day > 28 && (
                <p className="text-xs text-text-muted/80 italic">
                  {REPEAT_MONTHLY_CLAMP_HINT}
                </p>
              )}
              <div className="flex items-center gap-2">
                <input
                  id={`${idPrefix}-repeat-month-weekday`}
                  name={`${idPrefix}-repeat-month-mode`}
                  type="radio"
                  checked={draft.monthMode === "weekday"}
                  onChange={() => patch({ monthMode: "weekday" })}
                  className="text-primary focus:ring-0"
                />
                <label
                  htmlFor={`${idPrefix}-repeat-month-weekday`}
                  className="text-xs text-text"
                >
                  {REPEAT_ON_THE_LABEL}
                </label>
                <div
                  role="group"
                  aria-label="Which occurrence"
                  className="flex items-center rounded border border-border bg-surface-dim p-0.5"
                >
                  {REPEAT_NTH_OPTIONS.map(({ value, label, aria }) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={aria}
                      aria-pressed={draft.nth === Number(value)}
                      onClick={() =>
                        patchMonthly({
                          monthMode: "weekday",
                          nth: Number(value),
                        })
                      }
                      className={`rounded px-1.5 py-0.5 text-[11px] transition-colors focus:outline-none focus:ring-1 focus:ring-primary ${
                        draft.nth === Number(value)
                          ? "bg-surface-raised text-primary"
                          : "text-text-muted hover:text-text"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {draft.monthMode === "weekday" &&
                weekdayChips([draft.weekday], (w) =>
                  patchMonthly({ weekday: w }),
                )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`${idPrefix}-repeat-starts`}
                className="text-xs font-medium text-text-muted"
              >
                {REPEAT_STARTS_LABEL}
              </label>
              <input
                id={`${idPrefix}-repeat-starts`}
                type="date"
                required
                value={draft.startDate}
                onChange={(e) => onStartChange(e.target.value)}
                aria-invalid={!!errors.startDate}
                aria-describedby={errorFor("startDate")}
                className={FIELD_CLASSES}
              />
              {errors.startDate && (
                <p
                  id={errorFor("startDate")}
                  role="alert"
                  className="text-xs text-danger"
                >
                  {errors.startDate}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`${idPrefix}-repeat-ends`}
                className="text-xs font-medium text-text-muted"
              >
                {REPEAT_ENDS_LABEL}
              </label>
              <input
                id={`${idPrefix}-repeat-ends`}
                type="date"
                min={draft.startDate}
                value={draft.endDate}
                onChange={(e) => patch({ endDate: e.target.value })}
                aria-invalid={!!errors.endDate}
                aria-describedby={errorFor("endDate")}
                className={FIELD_CLASSES}
              />
              {errors.endDate && (
                <p
                  id={errorFor("endDate")}
                  role="alert"
                  className="text-xs text-danger"
                >
                  {errors.endDate}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
