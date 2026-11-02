/* eslint-disable react-refresh/only-export-components -- the assembled
   Select part namespace (Select.Root/Trigger/Value/Icon/Portal/
   Positioner/Popup/Item/…) is the public API surface mirroring
   @base-ui/react/select; it is not itself a component. */
import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "cn";

import { FIELD_SURFACE, FOCUS_RING, mergePartClassName } from "./styles";

import type {
  SelectIconProps as BaseSelectIconProps,
  SelectItemIndicatorProps as BaseSelectItemIndicatorProps,
  SelectItemProps as BaseSelectItemProps,
  SelectItemTextProps as BaseSelectItemTextProps,
  SelectPopupProps as BaseSelectPopupProps,
  SelectPortalProps as BaseSelectPortalProps,
  SelectPositionerProps as BaseSelectPositionerProps,
  SelectRootProps as BaseSelectRootProps,
  SelectTriggerProps as BaseSelectTriggerProps,
  SelectValueProps as BaseSelectValueProps,
} from "@base-ui/react/select";

// Part recipes consolidate the three native `<select>`s (WeekStartSection,
// ProfilesSection, ViewToolbar): the trigger reuses the field surface so a
// styled select sits identically beside Input/Textarea, and the portaled
// popup keeps the raised-overlay look of the hand-rolled dropdowns
// (CategoryMultiSelect). Keyboard navigation, typeahead, dismissal
// layering (Escape inside an open popup closes only the popup, even nested
// in a modal dialog), and ARIA wiring come from the Base UI parts
// unchanged.
//
//   <Select.Root>
//     <Select.Trigger aria-label="…">
//       <Select.Value placeholder="…" />
//       <Select.Icon />
//     </Select.Trigger>
//     <Select.Portal>
//       <Select.Positioner>
//         <Select.Popup>
//           <Select.Item value="…">
//             <Select.ItemText>Label</Select.ItemText>
//             <Select.ItemIndicator />
//           </Select.Item>
//         </Select.Popup>
//       </Select.Positioner>
//     </Select.Portal>
//   </Select.Root>

type SelectRootProps<
  Value,
  Multiple extends boolean | undefined = false,
> = BaseSelectRootProps<Value, Multiple>;

// Root stays a pure wiring part — it renders no element of its own; state
// (`value`/`defaultValue`/`onValueChange`, `open`, `disabled`) passes
// through untouched.
export function SelectRoot<Value, Multiple extends boolean | undefined = false>(
  props: Readonly<SelectRootProps<Value, Multiple>>,
) {
  return <BaseSelect.Root {...props} />;
}

type SelectTriggerProps = BaseSelectTriggerProps;

export function SelectTrigger({
  className,
  ...rest
}: Readonly<SelectTriggerProps>) {
  return (
    <BaseSelect.Trigger
      className={mergePartClassName(
        cn(
          "inline-flex items-center justify-between gap-2",
          FIELD_SURFACE,
          FOCUS_RING,
          "disabled:opacity-50",
        ),
        className,
      )}
      {...rest}
    />
  );
}

type SelectValueProps = BaseSelectValueProps;

export function SelectValue({
  className,
  ...rest
}: Readonly<SelectValueProps>) {
  return (
    <BaseSelect.Value
      className={mergePartClassName(
        "min-w-0 flex-1 truncate data-[placeholder]:text-text-muted/60",
        className,
      )}
      {...rest}
    />
  );
}

type SelectIconProps = BaseSelectIconProps;

// Base UI renders a text "▼" glyph when the part has no children — swap it
// for the Lucide chevron every call site would otherwise repeat, while
// still accepting custom content. The wrapper span is aria-hidden already.
export function SelectIcon({
  className,
  children,
  ...rest
}: Readonly<SelectIconProps>) {
  return (
    <BaseSelect.Icon
      className={mergePartClassName(
        "pointer-events-none text-text-muted",
        className,
      )}
      {...rest}
    >
      {children ?? <ChevronDown aria-hidden="true" size={16} />}
    </BaseSelect.Icon>
  );
}

type SelectPortalProps = BaseSelectPortalProps;

export function SelectPortal(props: Readonly<SelectPortalProps>) {
  return <BaseSelect.Portal {...props} />;
}

type SelectPositionerProps = BaseSelectPositionerProps;

// z-50 matches the Dialog overlay layer: a select portaled inside a dialog
// lands later in DOM order and paints above it. Callers that need a higher
// stack pass their own z class through className — cn() merges it last.
export function SelectPositioner({
  className,
  ...rest
}: Readonly<SelectPositionerProps>) {
  return (
    <BaseSelect.Positioner
      className={mergePartClassName("z-50", className)}
      {...rest}
    />
  );
}

type SelectPopupProps = BaseSelectPopupProps;

export function SelectPopup({
  className,
  ...rest
}: Readonly<SelectPopupProps>) {
  return (
    <BaseSelect.Popup
      className={mergePartClassName(
        "rounded-md border border-border bg-surface-raised shadow-2xl outline-none",
        className,
      )}
      {...rest}
    />
  );
}

type SelectItemProps = BaseSelectItemProps;

export function SelectItem({ className, ...rest }: Readonly<SelectItemProps>) {
  return (
    <BaseSelect.Item
      className={mergePartClassName(
        "flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm text-text outline-none data-[highlighted]:bg-surface data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}

type SelectItemTextProps = BaseSelectItemTextProps;

export function SelectItemText({
  className,
  ...rest
}: Readonly<SelectItemTextProps>) {
  return (
    <BaseSelect.ItemText
      className={mergePartClassName("min-w-0 flex-1", className)}
      {...rest}
    />
  );
}

type SelectItemIndicatorProps = BaseSelectItemIndicatorProps;

// Renders only while its item is selected (Base UI `keepMounted` opt-out
// stays available); the check glyph defaults like the Icon chevron.
export function SelectItemIndicator({
  className,
  children,
  ...rest
}: Readonly<SelectItemIndicatorProps>) {
  return (
    <BaseSelect.ItemIndicator
      className={mergePartClassName("text-primary", className)}
      {...rest}
    >
      {children ?? <Check aria-hidden="true" size={16} />}
    </BaseSelect.ItemIndicator>
  );
}

export const Select = {
  Root: SelectRoot,
  Trigger: SelectTrigger,
  Value: SelectValue,
  Icon: SelectIcon,
  Portal: SelectPortal,
  Positioner: SelectPositioner,
  Popup: SelectPopup,
  Item: SelectItem,
  ItemText: SelectItemText,
  ItemIndicator: SelectItemIndicator,
};

export type {
  SelectIconProps,
  SelectItemIndicatorProps,
  SelectItemProps,
  SelectItemTextProps,
  SelectPopupProps,
  SelectPortalProps,
  SelectPositionerProps,
  SelectRootProps,
  SelectTriggerProps,
  SelectValueProps,
};
