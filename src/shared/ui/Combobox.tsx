/* eslint-disable react-refresh/only-export-components -- the assembled
   Combobox part namespace (Combobox.Root/Chips/Chip/Input/Portal/
   Positioner/Popup/List/Item/…) is the public API surface mirroring
   @base-ui/react/combobox; it is not itself a component. */
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { Check, X } from "lucide-react";

import { mergePartClassName } from "./styles";

import type {
  ComboboxChipProps as BaseComboboxChipProps,
  ComboboxChipRemoveProps as BaseComboboxChipRemoveProps,
  ComboboxChipsProps as BaseComboboxChipsProps,
  ComboboxInputProps as BaseComboboxInputProps,
  ComboboxItemIndicatorProps as BaseComboboxItemIndicatorProps,
  ComboboxItemProps as BaseComboboxItemProps,
  ComboboxListProps as BaseComboboxListProps,
  ComboboxPopupProps as BaseComboboxPopupProps,
  ComboboxPortalProps as BaseComboboxPortalProps,
  ComboboxPositionerProps as BaseComboboxPositionerProps,
  ComboboxRootProps as BaseComboboxRootProps,
  ComboboxValueProps as BaseComboboxValueProps,
} from "@base-ui/react/combobox";

// Part recipes consolidate the tag-input markup of the hand-rolled
// CategoryMultiSelect: a bordered token box holding chips plus the text
// input, a portaled listbox popup anchored to the box, and option rows
// with a selected check. Virtual focus (the input keeps DOM focus while
// `aria-activedescendant` tracks the highlight), keyboard navigation,
// Escape/outside-press dismissal layering (an open popup inside a modal
// dialog closes without dismissing the dialog), and the chips' ArrowLeft
// navigation + Backspace removal come from the Base UI parts.
//
//   <Combobox.Root multiple value={…} onValueChange={…}>
//     <Combobox.Chips>
//       {selected.map((c) => (
//         <Combobox.Chip key={…}>
//           …
//           <Combobox.ChipRemove aria-label={…} />
//         </Combobox.Chip>
//       ))}
//       <Combobox.Input aria-label={…} />
//     </Combobox.Chips>
//     <Combobox.Portal>
//       <Combobox.Positioner anchor={chipsRef}>
//         <Combobox.Popup>
//           <Combobox.List>
//             {(item) => <Combobox.Item value={item}>…</Combobox.Item>}
//           </Combobox.List>
//         </Combobox.Popup>
//       </Combobox.Positioner>
//     </Combobox.Portal>
//   </Combobox.Root>
//
// `filteredItems` on Root is the caller-controlled list (the feature
// filters by its own needle and may append synthetic rows such as the
// quick-create option) — internal filtering stays off.

type ComboboxRootProps<
  Value,
  Multiple extends boolean | undefined = false,
  Item = Value,
> = BaseComboboxRootProps<Value, Multiple, Item>;

// Root stays a pure wiring part — it renders no element of its own; state
// (`value`, `inputValue`, `open`, `filteredItems`, `multiple`, `disabled`)
// passes through untouched.
export function ComboboxRoot<
  Value,
  Multiple extends boolean | undefined = false,
  Item = Value,
>(props: Readonly<ComboboxRootProps<Value, Multiple, Item>>) {
  return <BaseCombobox.Root {...props} />;
}

type ComboboxValueProps = BaseComboboxValueProps;

export function ComboboxValue(props: Readonly<ComboboxValueProps>) {
  return <BaseCombobox.Value {...props} />;
}

type ComboboxChipsProps = BaseComboboxChipsProps;

// The token-field box: chips and the input share one field surface; the
// focus affordance rides focus-within since the real focus lives on the
// inner input. `has-disabled:` dims the whole box when the control is
// disabled — the Chips part itself carries no disabled state attribute.
export function ComboboxChips({
  className,
  ...rest
}: Readonly<ComboboxChipsProps>) {
  return (
    <BaseCombobox.Chips
      className={mergePartClassName(
        "flex min-h-[42px] w-full cursor-text flex-wrap items-center gap-1.5 rounded-md border border-border bg-surface-raised p-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary has-disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}

type ComboboxChipProps = BaseComboboxChipProps;

// The chip box only — color tinting arrives via the caller's inline
// `style` since the hue is stored data, not a theme token.
export function ComboboxChip({
  className,
  ...rest
}: Readonly<ComboboxChipProps>) {
  return (
    <BaseCombobox.Chip
      className={mergePartClassName(
        "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium text-text",
        className,
      )}
      {...rest}
    />
  );
}

type ComboboxChipRemoveProps = BaseComboboxChipRemoveProps;

// The X glyph defaults like Select's chevron — every call site would
// otherwise repeat it. Base UI renders the button with tabIndex -1:
// chips are reached by ArrowLeft from the input (toolbar semantics).
export function ComboboxChipRemove({
  className,
  children,
  ...rest
}: Readonly<ComboboxChipRemoveProps>) {
  return (
    <BaseCombobox.ChipRemove
      className={mergePartClassName(
        "flex items-center justify-center hover:opacity-75 focus:outline-none",
        className,
      )}
      {...rest}
    >
      {children ?? <X aria-hidden="true" size={12} />}
    </BaseCombobox.ChipRemove>
  );
}

type ComboboxInputProps = BaseComboboxInputProps;

// The bare text input living inside the chips box: no surface of its own
// (the box carries it), no outline (the box carries the focus ring), and
// a /60 placeholder like the field-surface recipe.
export function ComboboxInput({
  className,
  ...rest
}: Readonly<ComboboxInputProps>) {
  return (
    <BaseCombobox.Input
      className={mergePartClassName(
        "min-w-[120px] flex-1 border-0 bg-transparent p-0 text-sm text-text outline-none placeholder:text-text-muted/60 focus:outline-none focus:ring-0",
        className,
      )}
      {...rest}
    />
  );
}

type ComboboxPortalProps = BaseComboboxPortalProps;

export function ComboboxPortal(props: Readonly<ComboboxPortalProps>) {
  return <BaseCombobox.Portal {...props} />;
}

type ComboboxPositionerProps = BaseComboboxPositionerProps;

// z-50 matches the Dialog overlay layer: a popup portaled inside a dialog
// lands later in DOM order and paints above it.
export function ComboboxPositioner({
  className,
  ...rest
}: Readonly<ComboboxPositionerProps>) {
  return (
    <BaseCombobox.Positioner
      className={mergePartClassName("z-50", className)}
      {...rest}
    />
  );
}

type ComboboxPopupProps = BaseComboboxPopupProps;

// `min-w-[var(--anchor-width)]` reproduces the hand-rolled `w-full`:
// the popup is at least as wide as the chips box it is anchored to.
export function ComboboxPopup({
  className,
  ...rest
}: Readonly<ComboboxPopupProps>) {
  return (
    <BaseCombobox.Popup
      className={mergePartClassName(
        "min-w-[var(--anchor-width)] overflow-hidden rounded-lg border border-border bg-surface-raised shadow-2xl",
        className,
      )}
      {...rest}
    />
  );
}

type ComboboxListProps = BaseComboboxListProps;

export function ComboboxList({
  className,
  ...rest
}: Readonly<ComboboxListProps>) {
  return (
    <BaseCombobox.List
      className={mergePartClassName(
        "flex w-full flex-col divide-y divide-border",
        className,
      )}
      {...rest}
    />
  );
}

type ComboboxItemProps = BaseComboboxItemProps;

// `data-[highlighted]` is the combobox's active option — it covers both
// keyboard navigation and pointer hover (highlightItemOnHover).
export function ComboboxItem({
  className,
  ...rest
}: Readonly<ComboboxItemProps>) {
  return (
    <BaseCombobox.Item
      className={mergePartClassName(
        "flex cursor-pointer items-center justify-between px-3 py-2 text-sm text-text transition-colors data-[highlighted]:bg-surface",
        className,
      )}
      {...rest}
    />
  );
}

type ComboboxItemIndicatorProps = BaseComboboxItemIndicatorProps;

// Renders only while its item is selected (Base UI `keepMounted` opt-out
// stays available); the check glyph defaults like the Icon chevron.
export function ComboboxItemIndicator({
  className,
  children,
  ...rest
}: Readonly<ComboboxItemIndicatorProps>) {
  return (
    <BaseCombobox.ItemIndicator
      className={mergePartClassName("text-primary", className)}
      {...rest}
    >
      {children ?? <Check aria-hidden="true" size={16} />}
    </BaseCombobox.ItemIndicator>
  );
}

export const Combobox = {
  Root: ComboboxRoot,
  Value: ComboboxValue,
  Chips: ComboboxChips,
  Chip: ComboboxChip,
  ChipRemove: ComboboxChipRemove,
  Input: ComboboxInput,
  Portal: ComboboxPortal,
  Positioner: ComboboxPositioner,
  Popup: ComboboxPopup,
  List: ComboboxList,
  Item: ComboboxItem,
  ItemIndicator: ComboboxItemIndicator,
};

export type {
  ComboboxChipProps,
  ComboboxChipRemoveProps,
  ComboboxChipsProps,
  ComboboxInputProps,
  ComboboxItemIndicatorProps,
  ComboboxItemProps,
  ComboboxListProps,
  ComboboxPopupProps,
  ComboboxPortalProps,
  ComboboxPositionerProps,
  ComboboxRootProps,
  ComboboxValueProps,
};
