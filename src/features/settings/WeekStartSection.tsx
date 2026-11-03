import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  setWeekStart as setWeekStartCommand,
  weekStart as fetchWeekStart,
} from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import { ComponentSize, Weekday } from "@/lib/enums";
import {
  SAVE_BUTTON_LABEL,
  WEEKDAY_OPTIONS,
  WEEK_START_HEADING,
  WEEK_START_HEADING_ID,
  WEEK_START_LABEL,
} from "@/lib/labels";
import { errorMessage } from "@/lib/utils";
import { SettingsSection } from "@/shared/patterns/SettingsSection";
import { Button } from "@/shared/ui/Button";
import { Field } from "@/shared/ui/Field";
import { Select } from "@/shared/ui/Select";
import { ERROR_TEXT } from "@/shared/ui/styles";

export function WeekStartSection() {
  const queryClient = useQueryClient();
  const { data: weekStart } = useQuery({
    queryKey: QUERY_KEYS.weekStart,
    queryFn: fetchWeekStart,
  });
  const [selected, setSelected] = useState<Weekday>();
  const stored = weekStart ?? Weekday.Monday;
  const current = selected ?? stored;
  // Selecting the stored value is no draft — save must stay disabled or it
  // would write the same value and still bump updated_at.
  const dirty = selected !== undefined && selected !== stored;

  const save = useMutation({
    mutationFn: setWeekStartCommand,
    onSuccess: () => {
      setSelected(undefined);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.weekStart });
      // set_week_start bumps the profile's updated_at — refresh the row.
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.profiles });
    },
  });

  return (
    // `contents` keeps the section's own gap-3 spacing the children —
    // the pre-pattern layout had no body container.
    <SettingsSection
      title={WEEK_START_HEADING}
      id={WEEK_START_HEADING_ID}
      className="flex flex-col gap-3"
      headingClassName="text-lg font-semibold"
      bodyClassName="contents"
    >
      <div className="flex items-end gap-3">
        <Field.Root>
          <Field.Label>{WEEK_START_LABEL}</Field.Label>
          {/* `items` feeds Select.Value the option label — without it the
              trigger would render the raw weekday wire name. */}
          <Select.Root
            items={WEEKDAY_OPTIONS}
            value={current}
            onValueChange={(day) => setSelected(day ?? undefined)}
          >
            <Select.Trigger className="w-44">
              <Select.Value />
              <Select.Icon />
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner>
                <Select.Popup>
                  {WEEKDAY_OPTIONS.map(({ value, label }) => (
                    <Select.Item key={value} value={value}>
                      <Select.ItemText>{label}</Select.ItemText>
                      <Select.ItemIndicator />
                    </Select.Item>
                  ))}
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>
        </Field.Root>
        <Button
          type="button"
          size={ComponentSize.Sm}
          className="px-4"
          onClick={() => save.mutate(current)}
          disabled={save.isPending || !dirty}
        >
          {SAVE_BUTTON_LABEL}
        </Button>
      </div>
      {save.isError && (
        <p role="alert" className={ERROR_TEXT}>
          {errorMessage(save.error)}
        </p>
      )}
    </SettingsSection>
  );
}
