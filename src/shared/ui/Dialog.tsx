/* eslint-disable react-refresh/only-export-components -- the assembled
   Dialog part namespace (Dialog.Root/Portal/Viewport/Backdrop/Popup/…)
   is the public API surface mirroring @base-ui/react/dialog; it is not
   itself a component. */
import { Dialog as BaseDialog } from "@base-ui/react/dialog";

import { mergePartClassName } from "./styles";

import type {
  DialogBackdropProps as BaseDialogBackdropProps,
  DialogCloseProps as BaseDialogCloseProps,
  DialogDescriptionProps as BaseDialogDescriptionProps,
  DialogPortalProps as BaseDialogPortalProps,
  DialogPopupProps as BaseDialogPopupProps,
  DialogRootProps as BaseDialogRootProps,
  DialogTitleProps as BaseDialogTitleProps,
  DialogTriggerProps as BaseDialogTriggerProps,
  DialogViewportProps as BaseDialogViewportProps,
} from "@base-ui/react/dialog";

// Recipes consolidate the overlay markup repeated across the five
// hand-rolled dialogs (EditTaskDialog, NewTaskDialog, CategoryDialog,
// DeleteProfileDialog, CarryOverPrompt): a fixed centering layer, an
// absolute dim layer, and the bordered surface popup. Dismissal parity —
// Escape and press on the dim layer fire onOpenChange(false), focus is
// trapped while open and returned on close — comes from the Base UI parts
// unchanged.
//
// Compose Backdrop *inside* Viewport (the same nesting as the legacy
// markup) so `absolute` always resolves against the fixed viewport layer
// rather than the document:
//
//   <Dialog.Root>
//     <Dialog.Portal>
//       <Dialog.Viewport>
//         <Dialog.Backdrop />
//         <Dialog.Popup>
//           <Dialog.Title>…</Dialog.Title>
//           <Dialog.Description>…</Dialog.Description>
//           <Dialog.Close>…</Dialog.Close>
//         </Dialog.Popup>
//       </Dialog.Viewport>
//     </Dialog.Portal>
//   </Dialog.Root>

type DialogRootProps<Payload = unknown> = BaseDialogRootProps<Payload>;

export function DialogRoot<Payload = unknown>(
  props: Readonly<DialogRootProps<Payload>>,
) {
  return <BaseDialog.Root {...props} />;
}

type DialogTriggerProps = BaseDialogTriggerProps;

export function DialogTrigger(props: Readonly<DialogTriggerProps>) {
  return <BaseDialog.Trigger {...props} />;
}

type DialogPortalProps = BaseDialogPortalProps;

export function DialogPortal(props: Readonly<DialogPortalProps>) {
  return <BaseDialog.Portal {...props} />;
}

type DialogViewportProps = BaseDialogViewportProps;

export function DialogViewport({
  className,
  ...rest
}: Readonly<DialogViewportProps>) {
  return (
    <BaseDialog.Viewport
      className={mergePartClassName(
        "fixed inset-0 z-50 flex items-center justify-center p-4",
        className,
      )}
      {...rest}
    />
  );
}

type DialogBackdropProps = BaseDialogBackdropProps;

export function DialogBackdrop({
  className,
  ...rest
}: Readonly<DialogBackdropProps>) {
  return (
    <BaseDialog.Backdrop
      className={mergePartClassName(
        "absolute inset-0 h-full w-full cursor-default bg-black/60",
        className,
      )}
      {...rest}
    />
  );
}

type DialogPopupProps = BaseDialogPopupProps;

export function DialogPopup({
  className,
  ...rest
}: Readonly<DialogPopupProps>) {
  return (
    <BaseDialog.Popup
      className={mergePartClassName(
        "relative m-0 flex max-h-[90vh] w-full max-w-lg flex-col gap-6 overflow-y-auto rounded-lg border border-border bg-surface p-6 text-text shadow-2xl",
        className,
      )}
      {...rest}
    />
  );
}

type DialogTitleProps = BaseDialogTitleProps;

export function DialogTitle({
  className,
  ...rest
}: Readonly<DialogTitleProps>) {
  return (
    <BaseDialog.Title
      className={mergePartClassName(
        "font-title text-lg font-semibold text-text",
        className,
      )}
      {...rest}
    />
  );
}

type DialogDescriptionProps = BaseDialogDescriptionProps;

export function DialogDescription({
  className,
  ...rest
}: Readonly<DialogDescriptionProps>) {
  return (
    <BaseDialog.Description
      className={mergePartClassName("text-sm text-text-muted", className)}
      {...rest}
    />
  );
}

// Close stays a pure wiring part: the icon-button look differs per call
// site (p-1 vs p-1.5 padding), so it composes a styled render target
// (IconButton) or a caller className rather than baking a recipe in.
type DialogCloseProps = BaseDialogCloseProps;

export function DialogClose(props: Readonly<DialogCloseProps>) {
  return <BaseDialog.Close {...props} />;
}

export const Dialog = {
  Root: DialogRoot,
  Trigger: DialogTrigger,
  Portal: DialogPortal,
  Viewport: DialogViewport,
  Backdrop: DialogBackdrop,
  Popup: DialogPopup,
  Title: DialogTitle,
  Description: DialogDescription,
  Close: DialogClose,
};

export type {
  DialogBackdropProps,
  DialogCloseProps,
  DialogDescriptionProps,
  DialogPopupProps,
  DialogPortalProps,
  DialogRootProps,
  DialogTitleProps,
  DialogTriggerProps,
  DialogViewportProps,
};
