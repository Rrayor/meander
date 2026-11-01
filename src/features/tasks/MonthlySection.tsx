import { cn } from "cn";

import { MonthMode, type Weekday } from "@/lib/enums";
import {
  REPEAT_DAY_OF_MONTH_LABEL,
  REPEAT_MONTH_MODE_GROUP_LABEL,
  REPEAT_MONTHLY_CLAMP_HINT,
  REPEAT_NTH_GROUP_LABEL,
  REPEAT_NTH_OPTIONS,
  REPEAT_ON_DAY_LABEL,
  REPEAT_ON_LABEL,
  REPEAT_ON_THE_LABEL,
} from "@/lib/labels";
import { Input } from "@/shared/ui/Input";
import { RadioGroup } from "@/shared/ui/RadioGroup";
import { ToggleGroup } from "@/shared/ui/ToggleGroup";

import type { RepeatDraft } from "./repeatDraft";
import {
  SEGMENT_GROUP_CLASSES,
  SEGMENT_TOGGLE_CLASSES,
  WEEKDAY_CHIP_CLASSES,
} from "./repeatDraft";

import type { WEEKDAY_OPTIONS } from "@/lib/labels";

// Edits that count as a manual monthly selection — they stop the
// start-date tracking in the parent. Mode radios don't count: switching
// between "On day" and "On the" keeps the synced defaults.
type MonthlyPatch = Partial<
  Pick<RepeatDraft, "monthMode" | "day" | "nth" | "weekday">
>;

// The mode radios' classic circle+dot look — the same recipe the other
// migrated radio groups (SaveScopeFieldset, DeleteConfirmPanel) use.
const MODE_RADIO_CLASSES = "group flex items-center gap-2 text-xs text-text";
const MODE_RADIO_CIRCLE_CLASSES =
  "flex h-4 w-4 items-center justify-center rounded-full border border-border group-data-[checked]:border-primary";
const MODE_RADIO_DOT_CLASSES = "h-2 w-2 rounded-full bg-primary";

interface MonthlySectionProps {
  monthMode: MonthMode;
  day: number;
  nth: number;
  weekday: Weekday;
  // Chip display order — the caller rotates it from the profile weekStart.
  order: readonly (typeof WEEKDAY_OPTIONS)[number][];
  // Mode switches only: does not mark the monthly selection as user-made.
  onModeChange: (mode: MonthMode) => void;
  // Value edits: marks the monthly selections user-made.
  onPatch: (patch: MonthlyPatch) => void;
}

// The monthly schedule editor: a day-of-month input against the "On day"
// mode, and an nth-occurrence segment plus weekday row against "On the".
export function MonthlySection({
  monthMode,
  day,
  nth,
  weekday,
  order,
  onModeChange,
  onPatch,
}: Readonly<MonthlySectionProps>) {
  // Single-select ToggleGroups report an empty array when the pressed chip
  // is re-clicked; a monthly pick is never cleared, so the deselect is a
  // no-op.
  const handleNthChange = (next: string[]) => {
    const value = next[0];
    if (value !== undefined) {
      onPatch({ monthMode: MonthMode.Weekday, nth: Number(value) });
    }
  };

  const handleWeekdayChange = (next: Weekday[]) => {
    const value = next[0];
    if (value !== undefined) {
      onPatch({ weekday: value });
    }
  };

  return (
    <RadioGroup.Root
      aria-label={REPEAT_MONTH_MODE_GROUP_LABEL}
      className="flex-col items-stretch gap-2 pt-1"
      value={monthMode}
      onValueChange={onModeChange}
    >
      <div className="flex items-center gap-2">
        <RadioGroup.Radio value={MonthMode.Day} className={MODE_RADIO_CLASSES}>
          {/* Circle + mounted-on-check dot mirrors the native
              accent-primary radio this replaces. */}
          <span aria-hidden="true" className={MODE_RADIO_CIRCLE_CLASSES}>
            <RadioGroup.RadioIndicator className={MODE_RADIO_DOT_CLASSES} />
          </span>
          {REPEAT_ON_DAY_LABEL}
        </RadioGroup.Radio>
        <Input
          aria-label={REPEAT_DAY_OF_MONTH_LABEL}
          type="number"
          min={1}
          max={31}
          value={day}
          onChange={(e) =>
            onPatch({
              monthMode: MonthMode.Day,
              day: Math.min(31, Math.max(1, Number(e.target.value) || 1)),
            })
          }
          className="w-12 px-2 py-1 text-center"
        />
      </div>
      {monthMode === MonthMode.Day && day > 28 && (
        <p className="text-xs text-text-muted/80 italic">
          {REPEAT_MONTHLY_CLAMP_HINT}
        </p>
      )}
      <div className="flex items-center gap-2">
        <RadioGroup.Radio
          value={MonthMode.Weekday}
          className={MODE_RADIO_CLASSES}
        >
          {/* Circle + mounted-on-check dot mirrors the native
              accent-primary radio this replaces. */}
          <span aria-hidden="true" className={MODE_RADIO_CIRCLE_CLASSES}>
            <RadioGroup.RadioIndicator className={MODE_RADIO_DOT_CLASSES} />
          </span>
          {REPEAT_ON_THE_LABEL}
        </RadioGroup.Radio>
        <ToggleGroup.Root
          aria-label={REPEAT_NTH_GROUP_LABEL}
          className={SEGMENT_GROUP_CLASSES}
          value={[String(nth)]}
          onValueChange={handleNthChange}
        >
          {REPEAT_NTH_OPTIONS.map((o) => (
            <ToggleGroup.Toggle
              key={o.value}
              value={String(o.value)}
              aria-label={o.aria}
              className={cn(
                SEGMENT_TOGGLE_CLASSES,
                "px-1.5 py-0.5 text-[11px]",
              )}
            >
              {o.label}
            </ToggleGroup.Toggle>
          ))}
        </ToggleGroup.Root>
      </div>
      {monthMode === MonthMode.Weekday && (
        <ToggleGroup.Root
          aria-label={REPEAT_ON_LABEL}
          className="gap-1.5"
          value={[weekday]}
          onValueChange={handleWeekdayChange}
        >
          {order.map(({ value, label, short }) => (
            <ToggleGroup.Toggle
              key={value}
              value={value}
              aria-label={label}
              className={WEEKDAY_CHIP_CLASSES}
            >
              {short}
            </ToggleGroup.Toggle>
          ))}
        </ToggleGroup.Root>
      )}
    </RadioGroup.Root>
  );
}
