import { useRef } from "react";
import { CATEGORY_COLORS } from "@/lib/constants";
import {
  CUSTOM_COLOR_GRADIENT,
  CUSTOM_COLOR_LABEL,
  CUSTOM_COLOR_PICKER_LABEL,
  THRESHOLD_COLOR_DEFAULT,
  categorySwatchLabel,
} from "@/lib/labels";

/// The shared palette-or-custom color control for threshold colors
/// (spec §283): swatch radios plus a custom member backed by a
/// color input overlay. Used by the global and per-category
/// threshold sections.
export function ColorRadios({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const customSelected = !(CATEGORY_COLORS as readonly string[]).includes(
    value,
  );
  return (
    <fieldset className="mt-4 text-sm text-text-muted">
      <legend className="sr-only">{label}</legend>
      <div
        className="flex items-center gap-1.5"
        role="radiogroup"
        aria-label={label}
      >
        {CATEGORY_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={categorySwatchLabel(c)}
            onClick={() => onChange(c)}
            style={{ backgroundColor: c }}
            className={`h-6 w-6 rounded-full transition-transform ${
              value === c
                ? "ring-2 ring-text ring-offset-2 ring-offset-surface"
                : "hover:scale-110"
            }`}
          />
        ))}
        {/* The button is the radiogroup member so the custom pick
            reports aria-checked to AT; the color input overlays it
            for pointer interaction and keeps its native semantics. */}
        <div className="group relative ml-2">
          <button
            type="button"
            role="radio"
            aria-checked={customSelected}
            aria-label={CUSTOM_COLOR_LABEL}
            onClick={(e) => {
              if (e.target === e.currentTarget) colorInputRef.current?.click();
            }}
            className={`h-6 w-6 rounded-full transition-transform focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
              customSelected
                ? "ring-2 ring-text ring-offset-2 ring-offset-surface"
                : "group-hover:scale-110"
            }`}
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
      </div>
    </fieldset>
  );
}
