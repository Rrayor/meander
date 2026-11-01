import { X } from "lucide-react";

import { Dialog } from "../ui/Dialog";
import { IconButton } from "../ui/IconButton";

import type { ReactNode } from "react";
import type { DialogPopupProps } from "../ui/Dialog";

// Composed form surface shared by the edit/create dialogs (NewTaskDialog,
// CategoryDialog, EditTaskDialog): the Dialog overlay chrome plus the
// title row, scrollable body slot, and a right-aligned footer row. The
// chrome classes are byte-parity with the legacy hand-rolled overlays —
// header `flex items-center justify-between`, footer
// `flex justify-end gap-2` — while the popup surface (max-w-lg, gap-6,
// overflow-y-auto) comes from the Dialog.Popup recipe unchanged.
//
// Dismissal is Dialog parity: Escape and outside-press on the backdrop
// fire onOpenChange(false), routed to onClose — the caller owns `open`.
//
// `closeLabel` is required beyond the design's sketch: the header's
// close affordance is icon-only content, so its accessible name must
// arrive as a prop (shared/ cannot import lib/labels).

interface FormDialogProps {
  open: boolean;
  onClose(): void;
  title: string;
  /** Accessible name for the header close button. */
  closeLabel: string;
  children: ReactNode;
  /** Action row content — caller composes Buttons (cancel/submit). */
  footer?: ReactNode;
  /** Element receiving focus on open — forwarded to Dialog.Popup
      (Base UI `initialFocus`). Omit for the default first-tabbable. */
  initialFocus?: DialogPopupProps["initialFocus"];
}

export function FormDialog({
  open,
  onClose,
  title,
  closeLabel,
  children,
  footer,
  initialFocus,
}: Readonly<FormDialogProps>) {
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Viewport>
          <Dialog.Backdrop />
          <Dialog.Popup initialFocus={initialFocus}>
            <div className="flex items-center justify-between">
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Close
                render={<IconButton icon={X} label={closeLabel} />}
              />
            </div>
            {children}
            {footer != null && (
              <div className="flex justify-end gap-2">{footer}</div>
            )}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type { FormDialogProps };
