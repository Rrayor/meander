import { useState } from "react";

import type { NewSeries, Recurrence, Weekday } from "@/api/bindings";
import {
  FREQUENCY_FIELD_LABEL,
  REPEAT_DAY_LABEL,
  REPEAT_ENDS_LABEL,
  REPEAT_EVERY_LABEL,
  REPEAT_FREQUENCY_OPTIONS,
  REPEAT_MONTHLY_CLAMP_HINT,
  REPEAT_NONE_SUMMARY,
  REPEAT_NTH_OPTIONS,
  REPEAT_ON_LABEL,
  REPEAT_SECTION_LABEL,
  REPEAT_STARTS_LABEL,
  WEEKDAY_OPTIONS,
} from "@/lib/labels";

type Frequency = (typeof REPEAT_FREQUENCY_OPTIONS)[number]["value"];

interface RepeatDraft {
  frequency: Frequency;
  interval: number;
  weekdays: Weekday[];
  day: number;
  nth: number;
  weekday: Weekday;
  startDate: string;
  endDate: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const defaultDraft = (): RepeatDraft => ({
  frequency: "daily",
  interval: 1,
  weekdays: ["monday"],
  day: 1,
  nth: 1,
  weekday: "monday",
  startDate: todayIso(),
  endDate: "",
});

const toRecurrence = (draft: RepeatDraft): Recurrence => {
  switch (draft.frequency) {
    case "daily":
      return { kind: "daily", interval_days: draft.interval };
    case "weekly":
      return {
        kind: "weekly",
        interval_weeks: draft.interval,
        weekdays: draft.weekdays,
      };
    case "monthly_day":
      return {
        kind: "monthly_day",
        interval_months: draft.interval,
        day: draft.day,
      };
    case "monthly_nth_weekday":
      return {
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

const summarize = (draft: RepeatDraft): string => {
  switch (draft.frequency) {
    case "daily":
      return draft.interval === 1
        ? "Every day"
        : `Every ${draft.interval} days`;
    case "weekly": {
      const days = WEEKDAY_OPTIONS.filter((w) =>
        draft.weekdays.includes(w.value),
      )
        .map((w) => w.label)
        .join(", ");
      const span =
        draft.interval === 1 ? "Every week" : `Every ${draft.interval} weeks`;
      return `${span} on ${days}`;
    }
    case "monthly_day":
      return draft.interval === 1
        ? `Every month on day ${draft.day}`
        : `Every ${draft.interval} months on day ${draft.day}`;
    case "monthly_nth_weekday": {
      const nth = REPEAT_NTH_OPTIONS.find(
        (o) => o.value === String(draft.nth),
      )?.label;
      const weekday = WEEKDAY_OPTIONS.find(
        (w) => w.value === draft.weekday,
      )?.label;
      const span =
        draft.interval === 1 ? "Every month" : `Every ${draft.interval} months`;
      return `${span} on the ${nth} ${weekday}`;
    }
  }
};

const FIELD_CLASSES =
  "rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary";

interface RepeatScheduleFieldsProps {
  idPrefix: string;
  onChange: (series: NewSeries | null) => void;
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

  const patch = (part: Partial<RepeatDraft>) => {
    const next = { ...draft, ...part };
    setDraft(next);
    onChange(toNewSeries(next));
  };

  const toggle = () => {
    if (expanded) {
      setExpanded(false);
      onChange(null);
    } else {
      setExpanded(true);
      onChange(toNewSeries(draft));
    }
  };

  const toggleWeekday = (weekday: Weekday) => {
    const next = draft.weekdays.includes(weekday)
      ? draft.weekdays.filter((w) => w !== weekday)
      : [...draft.weekdays, weekday];
    if (next.length > 0) patch({ weekdays: next });
  };

  const unit = REPEAT_FREQUENCY_OPTIONS.find(
    (o) => o.value === draft.frequency,
  )?.unit;
  const interval = (
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
          className={`${FIELD_CLASSES} w-16 px-2 py-1.5 text-center`}
        />
        <span className="text-xs text-text-muted">{unit}</span>
      </div>
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
          <span className="text-xs text-text-muted">
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
              htmlFor={`${idPrefix}-repeat-frequency`}
              className="text-xs font-medium text-text-muted"
            >
              {FREQUENCY_FIELD_LABEL}
            </label>
            <select
              id={`${idPrefix}-repeat-frequency`}
              value={draft.frequency}
              onChange={(e) =>
                patch({ frequency: e.target.value as Frequency })
              }
              className={`${FIELD_CLASSES} w-full cursor-pointer`}
            >
              {REPEAT_FREQUENCY_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {interval}
          {draft.frequency === "weekly" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-text-muted">
                {REPEAT_ON_LABEL}
              </span>
              <div className="flex items-center gap-1.5">
                {WEEKDAY_OPTIONS.map(({ value, label, short }) => {
                  const selected = draft.weekdays.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-label={label}
                      aria-pressed={selected}
                      onClick={() => toggleWeekday(value)}
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-primary ${
                        selected
                          ? "bg-primary text-on-primary shadow-sm"
                          : "border border-border bg-surface-raised text-text-muted hover:bg-surface-bright hover:text-text"
                      }`}
                    >
                      {short}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {draft.frequency === "monthly_day" && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`${idPrefix}-repeat-day`}
                className="text-xs font-medium text-text-muted"
              >
                {REPEAT_DAY_LABEL}
              </label>
              <input
                id={`${idPrefix}-repeat-day`}
                type="number"
                min={1}
                max={31}
                value={draft.day}
                onChange={(e) =>
                  patch({
                    day: Math.min(31, Math.max(1, Number(e.target.value) || 1)),
                  })
                }
                className={`${FIELD_CLASSES} w-16 px-2 py-1.5 text-center`}
              />
              {draft.day > 28 && (
                <p className="text-xs text-text-muted/80 italic">
                  {REPEAT_MONTHLY_CLAMP_HINT}
                </p>
              )}
            </div>
          )}
          {draft.frequency === "monthly_nth_weekday" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-text-muted">
                {REPEAT_ON_LABEL}
              </span>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Which occurrence"
                  value={String(draft.nth)}
                  onChange={(e) => patch({ nth: Number(e.target.value) })}
                  className={`${FIELD_CLASSES} cursor-pointer`}
                >
                  {REPEAT_NTH_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Weekday"
                  value={draft.weekday}
                  onChange={(e) =>
                    patch({ weekday: e.target.value as Weekday })
                  }
                  className={`${FIELD_CLASSES} cursor-pointer`}
                >
                  {WEEKDAY_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
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
                onChange={(e) => patch({ startDate: e.target.value })}
                className={FIELD_CLASSES}
              />
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
                className={FIELD_CLASSES}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
