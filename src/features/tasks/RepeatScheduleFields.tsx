import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ChevronUp } from "lucide-react";
import { useState } from "react";

import type { NewSeries } from "@/api/bindings";
import { weekStart as fetchWeekStart } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import { ButtonVariant, RepeatUnit, Weekday } from "@/lib/enums";
import {
  REPEAT_EVERY_LABEL,
  REPEAT_NONE_SUMMARY,
  REPEAT_ON_LABEL,
  REPEAT_SECTION_LABEL,
  REPEAT_UNIT_GROUP_LABEL,
  REPEAT_UNIT_OPTIONS,
  weekdaysFrom,
} from "@/lib/labels";
import { weekdayOfIso } from "@/lib/utils";
import { WeekdayPicker } from "@/shared/patterns/WeekdayPicker";
import { Button } from "@/shared/ui/Button";
import { Field } from "@/shared/ui/Field";
import { Fieldset } from "@/shared/ui/Fieldset";
import { Input } from "@/shared/ui/Input";
import { ToggleGroup } from "@/shared/ui/ToggleGroup";

import { DateRangeFields } from "./DateRangeFields";
import { MonthlySection } from "./MonthlySection";
import type { RepeatDraft } from "./repeatDraft";
import {
  ISO_DATE_PATTERN,
  SEGMENT_GROUP_CLASSES,
  SEGMENT_TOGGLE_CLASSES,
  WEEKDAY_CHIP_CLASSES,
  defaultDraft,
  draftFromSeries,
  firstError,
  monthlyDefaults,
  summarize,
  toNewSeries,
  validateDraft,
} from "./repeatDraft";

import type { WeekdayLabel } from "@/lib/calendar";

interface RepeatScheduleFieldsProps {
  idPrefix: string;
  // Seed from an existing schedule (series editing): the section starts
  // expanded with the stored recurrence and both selections count as
  // user-made, so a start-date edit doesn't silently overwrite them.
  initial?: NewSeries;
  // `error` is the first validation message while a schedule is configured;
  // parents disable submission until it clears.
  onChange: (series: NewSeries | null, error: string | null) => void;
  // Fixes the start at the given date — the field stays visible but
  // read-only. A "this and future" split anchors on the viewed instance's
  // date, so the only honest Starts value is that cutoff.
  lockedStartDate?: string;
}

// Collapsed ⇔ no schedule: expanding the section emits a default series and
// collapsing clears it. The draft is kept locally so re-expanding restores
// the user's last choices.
export function RepeatScheduleFields({
  idPrefix,
  initial,
  onChange,
  lockedStartDate,
}: Readonly<RepeatScheduleFieldsProps>) {
  const [expanded, setExpanded] = useState(initial !== undefined);
  const { data: weekStart = Weekday.Monday } = useQuery({
    queryKey: QUERY_KEYS.weekStart,
    queryFn: fetchWeekStart,
  });
  const weekOrder = weekdaysFrom(weekStart as Weekday);
  const [draft, setDraft] = useState<RepeatDraft>(() => {
    const seeded =
      initial === undefined ? defaultDraft() : draftFromSeries(initial);
    return lockedStartDate === undefined
      ? seeded
      : { ...seeded, startDate: lockedStartDate };
  });
  // The weekday selection tracks the start date until the user picks days
  // manually — the common case is "repeat on the same weekday it starts".
  // A seeded schedule already carries explicit picks.
  const [weekdaysTouched, setWeekdaysTouched] = useState(initial !== undefined);
  // The monthly selections track the start date the same way.
  const [monthlyTouched, setMonthlyTouched] = useState(initial !== undefined);

  const errors = expanded ? validateDraft(draft) : {};

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

  // WeekdayPicker enforces "at least one" via minSelected — the deselect
  // that would empty the set never reaches this callback.
  const handleWeekdaysChange = (days: Weekday[]) => {
    setWeekdaysTouched(true);
    patch({ weekdays: days });
  };

  // Single-select unit segment: re-clicking the pressed chip reports an
  // empty array, but a repeat schedule always has a unit — ignore it.
  const handleUnitChange = (next: RepeatUnit[]) => {
    const unit = next[0];
    if (unit !== undefined) patch({ unit });
  };

  const handleStartChange = (iso: string) => {
    const valid = ISO_DATE_PATTERN.test(iso);
    patch({
      startDate: iso,
      ...(!weekdaysTouched && valid ? { weekdays: [weekdayOfIso(iso)] } : {}),
      ...(!monthlyTouched && valid ? monthlyDefaults(iso) : {}),
    });
  };

  const formatDay = (day: Weekday): WeekdayLabel => {
    const option = weekOrder.find((o) => o.value === day);
    return { label: option?.label ?? day, short: option?.short ?? day };
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface-raised/40">
      <Button
        type="button"
        variant={ButtonVariant.Ghost}
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls={`${idPrefix}-repeat-panel`}
        className="group flex w-full items-center justify-between rounded-t-lg rounded-b-none p-3 text-left hover:bg-surface-raised"
      >
        <span className="text-sm font-medium text-text">
          {REPEAT_SECTION_LABEL}
        </span>
        <span className="flex items-center gap-2">
          <span className="rounded border border-border bg-surface-raised px-1.5 py-0.5 text-xs text-text-muted">
            {expanded ? summarize(draft) : REPEAT_NONE_SUMMARY}
          </span>
          <ChevronUp
            aria-hidden="true"
            size={16}
            className={cn(
              "text-text-muted transition-transform group-hover:text-text",
              expanded ? "" : "rotate-180",
            )}
          />
        </span>
      </Button>
      {expanded && (
        <div
          id={`${idPrefix}-repeat-panel`}
          className="flex flex-col gap-3 border-t border-border bg-surface/40 p-3"
        >
          <Field.Root>
            <Field.Label>{REPEAT_EVERY_LABEL}</Field.Label>
            <div className="flex items-center gap-2">
              <Field.Control
                render={<Input className="w-14 px-2 py-1.5 text-center" />}
                id={`${idPrefix}-repeat-interval`}
                type="number"
                min={1}
                value={draft.interval}
                onChange={(e) =>
                  patch({ interval: Math.max(1, Number(e.target.value) || 1) })
                }
              />
              <ToggleGroup.Root
                aria-label={REPEAT_UNIT_GROUP_LABEL}
                className={cn(SEGMENT_GROUP_CLASSES, "h-[34px] w-60")}
                value={[draft.unit]}
                onValueChange={handleUnitChange}
              >
                {REPEAT_UNIT_OPTIONS.map(({ value, label }) => (
                  <ToggleGroup.Toggle
                    key={value}
                    value={value}
                    className={cn(
                      SEGMENT_TOGGLE_CLASSES,
                      "flex-1 px-3 py-1.5 text-center text-xs font-medium data-[pressed]:shadow-sm",
                    )}
                  >
                    {label}
                  </ToggleGroup.Toggle>
                ))}
              </ToggleGroup.Root>
            </div>
          </Field.Root>
          {draft.unit === RepeatUnit.Week && (
            <Fieldset.Root className="flex flex-col gap-1.5">
              <Fieldset.Legend id={`${idPrefix}-repeat-weekdays-label`}>
                {REPEAT_ON_LABEL}
              </Fieldset.Legend>
              <WeekdayPicker
                aria-labelledby={`${idPrefix}-repeat-weekdays-label`}
                value={draft.weekdays}
                onChange={handleWeekdaysChange}
                order={weekOrder.map((o) => o.value)}
                formatDay={formatDay}
                minSelected={1}
                className="gap-1.5"
                chipClassName={WEEKDAY_CHIP_CLASSES}
              />
            </Fieldset.Root>
          )}
          {draft.unit === RepeatUnit.Month && (
            <MonthlySection
              monthMode={draft.monthMode}
              day={draft.day}
              nth={draft.nth}
              weekday={draft.weekday}
              order={weekOrder}
              onModeChange={(mode) => patch({ monthMode: mode })}
              onPatch={patchMonthly}
            />
          )}
          <DateRangeFields
            idPrefix={idPrefix}
            startDate={draft.startDate}
            endDate={draft.endDate}
            errors={errors}
            lockedStartDate={lockedStartDate}
            onStartChange={handleStartChange}
            onEndDateChange={(iso) => patch({ endDate: iso })}
          />
        </div>
      )}
    </div>
  );
}
