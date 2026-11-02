import { X } from "lucide-react";

import { ButtonVariant } from "@/lib/enums";

import { AlertDialog } from "../ui/AlertDialog";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";

import type { ReactNode } from "react";

// Composed confirmation surface (DeleteProfileDialog, CarryOverPrompt):
// AlertDialog semantics — outside-press never dismisses, Escape and the
// explicit controls still fire onOpenChange — plus a fixed cancel/confirm
// footer row. `children` carries custom bodies (type-to-confirm inputs,
// per-task choice lists); `description` renders as the wired
// aria-describedby text above it.
//
// Chrome is byte-parity with DeleteProfileDialog: the header row and the
// `flex justify-end gap-3` footer; the popup narrows to `max-w-md gap-4`
// via className over the shared recipe. `closeLabel` is optional because
// the consumers differ — DeleteProfileDialog's header carries a close
// affordance (rendered when provided, icon-only content so its accessible
// name is a prop), CarryOverPrompt's does not.
//
// `busy` disables the confirm action while it runs; cancel stays enabled
// so the dialog can always be dismissed (legacy parity).
//
// Escape is wired to onClose. Callers that must keep a fully
// non-dismissible prompt (CarryOverPrompt) decide that at migration —
// the AlertDialog part still reports the intent via onOpenChange.

interface ConfirmDialogProps {
  open: boolean;
  onClose(): void;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm(): void;
  confirmDisabled?: boolean;
  destructive?: boolean;
  busy?: boolean;
  /** Accessible name for the optional header close button. */
  closeLabel?: string;
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  confirmDisabled,
  destructive,
  busy,
  closeLabel,
}: Readonly<ConfirmDialogProps>) {
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) onClose();
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={handleOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Viewport>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup className="max-w-md gap-4">
            <div className="flex items-center justify-between">
              <AlertDialog.Title>{title}</AlertDialog.Title>
              {closeLabel && (
                <AlertDialog.Close
                  render={<IconButton icon={X} label={closeLabel} />}
                />
              )}
            </div>
            {description && (
              <AlertDialog.Description>{description}</AlertDialog.Description>
            )}
            {children}
            <div className="flex justify-end gap-3">
              <AlertDialog.Close
                render={
                  <Button type="button" variant={ButtonVariant.Secondary}>
                    {cancelLabel}
                  </Button>
                }
              />
              <Button
                type="button"
                variant={
                  destructive ? ButtonVariant.Danger : ButtonVariant.Primary
                }
                disabled={confirmDisabled || busy}
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export type { ConfirmDialogProps };
