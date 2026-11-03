/* eslint-disable react-refresh/only-export-components -- the assembled
   ToggleGroup part namespace (ToggleGroup.Root/Toggle) is the public API
   surface mirroring @base-ui/react/toggle-group + @base-ui/react/toggle;
   it is not itself a component. */
import { Toggle as BaseToggle } from "@base-ui/react/toggle";
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import { cn } from "cn";

import { FOCUS_RING, mergePartClassName } from "./styles";

import type {
  ToggleGroupProps as BaseToggleGroupProps,
  ToggleGroupState,
} from "@base-ui/react/toggle-group";
import type {
  ToggleProps as BaseToggleProps,
  ToggleState,
} from "@base-ui/react/toggle";

// The chip recipe consolidates the `aria-pressed` toggle buttons repeated
// across RepeatScheduleFields (weekday chips, repeat-unit and
// nth-occurrence segments), WorkDaysSection, and CarryOverPrompt: a
// bordered text chip, muted until hover, that fills with the primary
// color when pressed — every source chip was `text-text-muted
// hover:text-text` unpressed. Base UI's Toggle mirrors its state onto
// `data-pressed`, so pressed styling rides the attribute variant instead
// of conditional class strings at call sites; the data variant sorts
// after `hover:` in the stylesheet, so a pressed chip keeps its
// on-primary text while hovered. Focus ring, color transition, and
// disabled dim match the other interactive primitives (Button).
const TOGGLE_CLASSES = cn(
  "rounded-md border border-border px-3 py-2 text-sm text-text-muted transition-colors hover:text-text",
  FOCUS_RING,
  "disabled:opacity-50",
  "data-[pressed]:bg-primary data-[pressed]:text-on-primary",
);

type ToggleGroupRootProps<Value extends string = string> =
  BaseToggleGroupProps<Value>;

// Root keeps a minimal flex-row default — every chip call site renders a
// horizontal row; spacing and container styling (plain row vs. bordered
// segment pill) stay a call-site className concern, the same division as
// Fieldset.Root.
export function ToggleGroupRoot<Value extends string = string>({
  className,
  ...rest
}: Readonly<ToggleGroupRootProps<Value>>) {
  return (
    <BaseToggleGroup
      className={mergePartClassName<ToggleGroupState>(
        "flex items-center",
        className,
      )}
      {...rest}
    />
  );
}

type ToggleProps<Value extends string = string> = BaseToggleProps<Value>;

export function Toggle<Value extends string = string>({
  className,
  ...rest
}: Readonly<ToggleProps<Value>>) {
  return (
    <BaseToggle
      className={mergePartClassName<ToggleState>(TOGGLE_CLASSES, className)}
      {...rest}
    />
  );
}

export const ToggleGroup = {
  Root: ToggleGroupRoot,
  Toggle,
};

export type { ToggleGroupRootProps, ToggleProps };
