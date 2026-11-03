/* eslint-disable react-refresh/only-export-components -- the assembled
   RadioGroup part namespace (RadioGroup.Root/Radio/RadioIndicator) is the
   public API surface mirroring @base-ui/react/radio-group +
   @base-ui/react/radio; it is not itself a component. */
import { Radio as BaseRadio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { cn } from "cn";

import { FOCUS_RING, mergePartClassName } from "./styles";

import type {
  RadioIndicatorProps as BaseRadioIndicatorProps,
  RadioRootProps as BaseRadioRootProps,
  RadioRootState,
} from "@base-ui/react/radio";
import type {
  RadioGroupProps as BaseRadioGroupProps,
  RadioGroupState,
} from "@base-ui/react/radio-group";

// The radio recipe covers only the affordances every form shares: pointer
// cursor, no text selection, a focus ring, and the disabled dim. The two
// visual forms in the app — swatch "cards" (ColorRadios: a filled circle
// that takes a ring when checked) and segment pills (carry-over/status:
// a label that fills with primary when checked) — have nothing else in
// common, so checked/unchecked looks stay a call-site className concern
// via `data-[checked]:`/`data-[unchecked]:` or a state callback rather
// than a variant prop:
//
//   <RadioGroup.Root value={v} onValueChange={setV}>
//     <RadioGroup.Radio
//       value="a"
//       className="flex-1 data-[checked]:bg-primary data-[checked]:text-on-primary"
//     >
//       Label
//     </RadioGroup.Radio>
//   </RadioGroup.Root>
// inline-block is required — Base UI radios render <span>, which ignores
// h-*/w-* utilities while inline (the swatch recipes size the element
// directly and would collapse to 0×0). Segment-pill radios are flex
// children, where blockification makes the class a no-op.
const RADIO_CLASSES = cn(
  "inline-block cursor-pointer select-none transition-colors",
  FOCUS_RING,
  "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
);

type RadioGroupRootProps<Value extends string = string> =
  BaseRadioGroupProps<Value>;

// Root keeps a minimal flex-row default — both current call-site forms
// render a horizontal row; spacing and container styling (bare swatch row
// vs. bordered segment pill) stay a call-site className concern, the same
// division as ToggleGroup.Root and Fieldset.Root.
export function RadioGroupRoot<Value extends string = string>({
  className,
  ...rest
}: Readonly<RadioGroupRootProps<Value>>) {
  return (
    <BaseRadioGroup
      className={mergePartClassName<RadioGroupState>(
        "flex items-center",
        className,
      )}
      {...rest}
    />
  );
}

type RadioProps<Value extends string = string> = BaseRadioRootProps<Value>;

export function Radio<Value extends string = string>({
  className,
  ...rest
}: Readonly<RadioProps<Value>>) {
  return (
    <BaseRadio.Root
      className={mergePartClassName<RadioRootState>(RADIO_CLASSES, className)}
      {...rest}
    />
  );
}

type RadioIndicatorProps = BaseRadioIndicatorProps;

// Indicator stays a pure wiring part: it mounts only while its radio is
// checked, and the checked mark itself (inner dot, check glyph) is styled
// per call site.
export function RadioIndicator(props: Readonly<RadioIndicatorProps>) {
  return <BaseRadio.Indicator {...props} />;
}

export const RadioGroup = {
  Root: RadioGroupRoot,
  Radio,
  RadioIndicator,
};

export type { RadioGroupRootProps, RadioIndicatorProps, RadioProps };
