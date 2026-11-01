/* eslint-disable react-refresh/only-export-components -- the assembled
   AlertDialog part namespace
   (AlertDialog.Root/Portal/Viewport/Backdrop/Popup/…) is the public API
   surface mirroring @base-ui/react/alert-dialog; it is not itself a
   component. */
import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";

import { mergePartClassName } from "./styles";

import type {
  AlertDialogBackdropProps as BaseAlertDialogBackdropProps,
  AlertDialogCloseProps as BaseAlertDialogCloseProps,
  AlertDialogDescriptionProps as BaseAlertDialogDescriptionProps,
  AlertDialogPortalProps as BaseAlertDialogPortalProps,
  AlertDialogPopupProps as BaseAlertDialogPopupProps,
  AlertDialogRootProps as BaseAlertDialogRootProps,
  AlertDialogTitleProps as BaseAlertDialogTitleProps,
  AlertDialogTriggerProps as BaseAlertDialogTriggerProps,
  AlertDialogViewportProps as BaseAlertDialogViewportProps,
} from "@base-ui/react/alert-dialog";

// AlertDialog shares the Dialog overlay recipes — the same fixed
// centering layer, absolute dim layer, and bordered surface popup — for
// surfaces that demand an explicit choice (destructive confirms).
//
// Dismissal semantics differ from Dialog: Base UI's AlertDialog never
// dismisses on outside press (it forces `disablePointerDismissal`), while
// Escape still fires onOpenChange(false) and focus stays trapped. Call
// sites that need today's backdrop-close behavior must use the Dialog
// parts instead — the choice is per call site, parity wins (design doc:
// docs/superpowers/specs/2026-11-01-frontend-component-architecture-design.md).
//
// Compose Backdrop *inside* Viewport (the same nesting as Dialog) so
// `absolute` always resolves against the fixed viewport layer rather than
// the document:
//
//   <AlertDialog.Root>
//     <AlertDialog.Portal>
//       <AlertDialog.Viewport>
//         <AlertDialog.Backdrop />
//         <AlertDialog.Popup>
//           <AlertDialog.Title>…</AlertDialog.Title>
//           <AlertDialog.Description>…</AlertDialog.Description>
//           <AlertDialog.Close>…</AlertDialog.Close>
//         </AlertDialog.Popup>
//       </AlertDialog.Viewport>
//     </AlertDialog.Portal>
//   </AlertDialog.Root>

type AlertDialogRootProps<Payload = unknown> =
  BaseAlertDialogRootProps<Payload>;

export function AlertDialogRoot<Payload = unknown>(
  props: Readonly<AlertDialogRootProps<Payload>>,
) {
  return <BaseAlertDialog.Root {...props} />;
}

type AlertDialogTriggerProps = BaseAlertDialogTriggerProps;

export function AlertDialogTrigger(props: Readonly<AlertDialogTriggerProps>) {
  return <BaseAlertDialog.Trigger {...props} />;
}

type AlertDialogPortalProps = BaseAlertDialogPortalProps;

export function AlertDialogPortal(props: Readonly<AlertDialogPortalProps>) {
  return <BaseAlertDialog.Portal {...props} />;
}

type AlertDialogViewportProps = BaseAlertDialogViewportProps;

export function AlertDialogViewport({
  className,
  ...rest
}: Readonly<AlertDialogViewportProps>) {
  return (
    <BaseAlertDialog.Viewport
      className={mergePartClassName(
        "fixed inset-0 z-50 flex items-center justify-center p-4",
        className,
      )}
      {...rest}
    />
  );
}

type AlertDialogBackdropProps = BaseAlertDialogBackdropProps;

export function AlertDialogBackdrop({
  className,
  ...rest
}: Readonly<AlertDialogBackdropProps>) {
  return (
    <BaseAlertDialog.Backdrop
      className={mergePartClassName(
        "absolute inset-0 h-full w-full cursor-default bg-black/60",
        className,
      )}
      {...rest}
    />
  );
}

type AlertDialogPopupProps = BaseAlertDialogPopupProps;

export function AlertDialogPopup({
  className,
  ...rest
}: Readonly<AlertDialogPopupProps>) {
  return (
    <BaseAlertDialog.Popup
      className={mergePartClassName(
        "relative m-0 flex max-h-[90vh] w-full max-w-lg flex-col gap-6 overflow-y-auto rounded-lg border border-border bg-surface p-6 text-text shadow-2xl",
        className,
      )}
      {...rest}
    />
  );
}

type AlertDialogTitleProps = BaseAlertDialogTitleProps;

export function AlertDialogTitle({
  className,
  ...rest
}: Readonly<AlertDialogTitleProps>) {
  return (
    <BaseAlertDialog.Title
      className={mergePartClassName(
        "font-title text-lg font-semibold text-text",
        className,
      )}
      {...rest}
    />
  );
}

type AlertDialogDescriptionProps = BaseAlertDialogDescriptionProps;

export function AlertDialogDescription({
  className,
  ...rest
}: Readonly<AlertDialogDescriptionProps>) {
  return (
    <BaseAlertDialog.Description
      className={mergePartClassName("text-sm text-text-muted", className)}
      {...rest}
    />
  );
}

// Close stays a pure wiring part, matching Dialog.Close: confirm/cancel
// button styling comes from composing Button/IconButton at the call site.
type AlertDialogCloseProps = BaseAlertDialogCloseProps;

export function AlertDialogClose(props: Readonly<AlertDialogCloseProps>) {
  return <BaseAlertDialog.Close {...props} />;
}

export const AlertDialog = {
  Root: AlertDialogRoot,
  Trigger: AlertDialogTrigger,
  Portal: AlertDialogPortal,
  Viewport: AlertDialogViewport,
  Backdrop: AlertDialogBackdrop,
  Popup: AlertDialogPopup,
  Title: AlertDialogTitle,
  Description: AlertDialogDescription,
  Close: AlertDialogClose,
};

export type {
  AlertDialogBackdropProps,
  AlertDialogCloseProps,
  AlertDialogDescriptionProps,
  AlertDialogPopupProps,
  AlertDialogPortalProps,
  AlertDialogRootProps,
  AlertDialogTitleProps,
  AlertDialogTriggerProps,
  AlertDialogViewportProps,
};
