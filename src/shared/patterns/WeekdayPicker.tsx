import { Weekday } from "@/lib/enums";

import { ToggleGroup } from "../ui/ToggleGroup";

import type { WeekdayLabel } from "@/lib/calendar";
import type { ToggleGroupRootProps, ToggleProps } from "../ui/ToggleGroup";

// shared/ cannot import @/lib/labels (layering rule), so the default chip
// copy derives from the Weekday wire name: capitalize for the label, first
// two letters for the short form — the same "Monday"/"Mo" pairs
// WEEKDAY_OPTIONS carries today. Feature callers keep the labels registry
// authoritative by passing `formatDay` backed by WEEKDAY_OPTIONS.
const defaultFormatDay = (day: Weekday): WeekdayLabel => {
  const name = day.charAt(0).toUpperCase() + day.slice(1);
  return { label: name, short: name.slice(0, 2) };
};

interface WeekdayPickerProps extends Omit<
  ToggleGroupRootProps<Weekday>,
  | "value"
  | "defaultValue"
  | "onValueChange"
  | "onChange"
  | "multiple"
  | "children"
> {
  /** Currently selected days. */
  value: readonly Weekday[];
  /** Called with the next selection, sequenced by `order`. */
  onChange: (days: Weekday[]) => void;
  /** Chip display sequence — the caller rotates it from the profile
   * weekStart; the pattern fetches nothing. */
  order: readonly Weekday[];
  /** Minimum selection size: a deselect that would drop below it is
   * ignored (the WorkDays "at least one" rule). The chip stays enabled,
   * matching the source behavior — the click is a no-op. */
  minSelected?: number;
  /** Chip copy — defaults to capitalizing the Weekday wire name. */
  formatDay?: (day: Weekday) => WeekdayLabel;
  /** Extra classes merged onto every chip — the channel for per-site
   * pressed-look overrides (e.g. `data-[pressed]:border-primary`). */
  chipClassName?: ToggleProps<Weekday>["className"];
}

export function WeekdayPicker({
  value,
  onChange,
  order,
  minSelected = 0,
  formatDay = defaultFormatDay,
  chipClassName,
  ...rest
}: Readonly<WeekdayPickerProps>) {
  const handleValueChange = (next: Weekday[]) => {
    if (next.length < minSelected) return;
    onChange(order.filter((day) => next.includes(day)));
  };
  return (
    <ToggleGroup.Root
      multiple
      value={value}
      onValueChange={handleValueChange}
      {...rest}
    >
      {order.map((day) => {
        const { label, short } = formatDay(day);
        return (
          <ToggleGroup.Toggle
            key={day}
            value={day}
            aria-label={label}
            className={chipClassName}
          >
            {short}
          </ToggleGroup.Toggle>
        );
      })}
    </ToggleGroup.Root>
  );
}

export type { WeekdayPickerProps };
