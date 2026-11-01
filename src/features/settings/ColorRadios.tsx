import { useRef } from "react";
import { cn } from "cn";

import { CATEGORY_COLORS } from "@/lib/constants";
import {
  CUSTOM_COLOR_GRADIENT,
  CUSTOM_COLOR_LABEL,
  CUSTOM_COLOR_PICKER_LABEL,
  THRESHOLD_COLOR_DEFAULT,
  categorySwatchLabel,
} from "@/lib/labels";
import { Fieldset } from "@/shared/ui/Fieldset";
import { RadioGroup } from "@/shared/ui/RadioGroup";

// Sentinel group value standing in for "a color outside the palette" —
// the radio group's controlled value must be a member value for the
// custom swatch to report aria-checked, so an off-palette `value` maps
// here and picking a palette swatch maps back out via onValueChange.
// Never a valid color: type="color" only emits #rrggbb.
const CUSTOM_SWATCH_VALUE = "__custom__";

// Shared swatch states: a filled circle that takes a ring while checked
// and scales on hover while unchecked — carried via Base UI's
// data-checked/data-unchecked attributes.
const SWATCH_CLASSES =
  "h-6 w-6 rounded-full transition-transform data-[checked]:ring-2 data-[checked]:ring-text data-[checked]:ring-offset-2 data-[checked]:ring-offset-surface data-[unchecked]:hover:scale-110";

/// The shared palette-or-custom color control for threshold colors
/// (spec §283): swatch radios plus a custom member backed by a
/// color input overlay. Used by the global and per-category
/// threshold sections.
interface ColorRadiosProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
}

export function ColorRadios({
  label,
  value,
  onChange,
}: Readonly<ColorRadiosProps>) {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const customSelected = !(CATEGORY_COLORS as readonly string[]).includes(
    value,
  );

  const handleValueChange = (next: string) => {
    // Activating the custom radio (keyboard/AT — pointer presses land on
    // the overlaying color input) opens the picker instead of committing
    // a color; the picked value arrives through the input's own change.
    if (next === CUSTOM_SWATCH_VALUE) {
      colorInputRef.current?.click();
      return;
    }
    onChange(next);
  };

  return (
    <Fieldset.Root className="mt-4 text-sm text-text-muted">
      <Fieldset.Legend className="sr-only">{label}</Fieldset.Legend>
      <RadioGroup.Root
        aria-label={label}
        className="gap-1.5"
        value={customSelected ? CUSTOM_SWATCH_VALUE : value}
        onValueChange={handleValueChange}
      >
        {CATEGORY_COLORS.map((c) => (
          <RadioGroup.Radio
            key={c}
            value={c}
            aria-label={categorySwatchLabel(c)}
            style={{ backgroundColor: c }}
            className={SWATCH_CLASSES}
          />
        ))}
        {/* The radio is the radiogroup member so the custom pick reports
            aria-checked to AT; the color input overlays it for pointer
            interaction and keeps its native semantics. */}
        <div className="group relative ml-2">
          <RadioGroup.Radio
            value={CUSTOM_SWATCH_VALUE}
            aria-label={CUSTOM_COLOR_LABEL}
            onKeyDown={(e) => {
              // Value-change alone can't reopen the picker: activating
              // the already-selected radio is a no-op, so Space gets a
              // direct path — pointer presses land on the input overlay.
              if (customSelected && e.key === " ") {
                e.preventDefault();
                colorInputRef.current?.click();
              }
            }}
            className={cn(
              SWATCH_CLASSES,
              "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface data-[unchecked]:group-hover:scale-110",
            )}
            style={{
              background: customSelected ? value : CUSTOM_COLOR_GRADIENT,
            }}
          />
          <input
            ref={colorInputRef}
            type="color"
            tabIndex={-1}
            aria-label={CUSTOM_COLOR_PICKER_LABEL}
            value={customSelected ? value : THRESHOLD_COLOR_DEFAULT}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-6 w-6 cursor-pointer opacity-0"
          />
        </div>
      </RadioGroup.Root>
    </Fieldset.Root>
  );
}
