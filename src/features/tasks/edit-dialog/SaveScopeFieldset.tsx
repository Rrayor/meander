import { TaskScope } from "@/lib/enums";
import type { SaveScope } from "@/lib/enums";
import {
  TASK_SCOPE_FUTURE_LABEL,
  TASK_SCOPE_GROUP_LABEL,
  TASK_SCOPE_INSTANCE_LABEL,
  TASK_SCOPE_SERIES_LABEL,
} from "@/lib/labels";
import { Fieldset } from "@/shared/ui/Fieldset";
import { RadioGroup } from "@/shared/ui/RadioGroup";

const SAVE_SCOPE_OPTIONS: { value: TaskScope; label: string }[] = [
  { value: TaskScope.Instance, label: TASK_SCOPE_INSTANCE_LABEL },
  { value: TaskScope.Series, label: TASK_SCOPE_SERIES_LABEL },
  { value: TaskScope.Future, label: TASK_SCOPE_FUTURE_LABEL },
];

interface SaveScopeFieldsetProps {
  saveScope: SaveScope;
  futureDisabled: boolean;
  onChange: (scope: SaveScope) => void;
}

// The "apply changes to" radios. The future scope needs a viewed date to
// anchor the split on, so it's muted and disabled without one.
export function SaveScopeFieldset({
  saveScope,
  futureDisabled,
  onChange,
}: Readonly<SaveScopeFieldsetProps>) {
  return (
    <Fieldset.Root className="flex flex-col gap-2">
      <Fieldset.Legend className="tracking-wider uppercase">
        {TASK_SCOPE_GROUP_LABEL}
      </Fieldset.Legend>
      <RadioGroup.Root
        className="flex-col items-stretch gap-2"
        value={saveScope}
        onValueChange={onChange}
      >
        {SAVE_SCOPE_OPTIONS.map(({ value, label }) => {
          const disabled = value === TaskScope.Future && futureDisabled;
          return (
            <RadioGroup.Radio
              key={value}
              value={value}
              disabled={disabled}
              className="group flex items-center gap-2 text-sm text-text data-[disabled]:text-text-muted"
            >
              {/* Circle + mounted-on-check dot mirrors the native
                  accent-primary radio this replaces. */}
              <span
                aria-hidden="true"
                className="flex h-4 w-4 items-center justify-center rounded-full border border-border group-data-[checked]:border-primary"
              >
                <RadioGroup.RadioIndicator className="h-2 w-2 rounded-full bg-primary" />
              </span>
              {label}
            </RadioGroup.Radio>
          );
        })}
      </RadioGroup.Root>
    </Fieldset.Root>
  );
}
