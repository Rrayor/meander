import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./ConfirmDialog";

const TITLE = "Delete profile";
const DESCRIPTION = "This cannot be undone";
const BODY_TEXT = "Confirm body";
const CONFIRM_LABEL = "Delete";
const CANCEL_LABEL = "Cancel";
const CLOSE_LABEL = "Close dialog";

const alertDialog = () => screen.getByRole("alertdialog");
const cancelButton = () => screen.getByRole("button", { name: CANCEL_LABEL });
const confirmButton = () => screen.getByRole("button", { name: CONFIRM_LABEL });

interface RenderConfirmDialogOptions {
  open?: boolean;
  onClose?: () => void;
  onConfirm?: () => void;
  description?: string;
  confirmDisabled?: boolean;
  destructive?: boolean;
  busy?: boolean;
  closeLabel?: string;
  children?: React.ReactNode;
}

const DEFAULT_CHILDREN = <p>{BODY_TEXT}</p>;

function renderConfirmDialog({
  open = true,
  onClose,
  onConfirm,
  ...rest
}: RenderConfirmDialogOptions = {}) {
  return render(
    <ConfirmDialog
      open={open}
      onClose={onClose ?? vi.fn()}
      title={TITLE}
      confirmLabel={CONFIRM_LABEL}
      cancelLabel={CANCEL_LABEL}
      onConfirm={onConfirm ?? vi.fn()}
      {...rest}
    >
      {rest.children === undefined ? DEFAULT_CHILDREN : rest.children}
    </ConfirmDialog>,
  );
}

describe("ConfirmDialog", () => {
  it("renders nothing until open", () => {
    renderConfirmDialog({ open: false });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("exposes the popup as an alertdialog named by its title", () => {
    renderConfirmDialog();
    expect(alertDialog()).toHaveAccessibleName(TITLE);
    expect(screen.getByRole("heading", { name: TITLE })).toBeInTheDocument();
  });

  it("wires the description as the popup's aria-describedby", () => {
    renderConfirmDialog({ description: DESCRIPTION });
    const description = screen.getByText(DESCRIPTION);
    expect(alertDialog().getAttribute("aria-describedby")).toContain(
      description.id,
    );
  });

  it("omits the description when none is given", () => {
    renderConfirmDialog({ description: undefined });
    expect(screen.queryByText(DESCRIPTION)).not.toBeInTheDocument();
    expect(alertDialog()).not.toHaveAttribute("aria-describedby");
  });

  it("renders children as the custom body", () => {
    renderConfirmDialog();
    expect(screen.getByText(BODY_TEXT)).toBeInTheDocument();
  });

  it("renders the fixed cancel/confirm footer row", () => {
    renderConfirmDialog();
    const row = confirmButton().parentElement;
    expect(row).toHaveClass("flex", "justify-end", "gap-3");
    expect(row).toContainElement(cancelButton());
    expect(row).toContainElement(confirmButton());
    // Both are non-submit buttons — the dialog is not a form surface.
    expect(cancelButton()).toHaveAttribute("type", "button");
    expect(confirmButton()).toHaveAttribute("type", "button");
  });

  it("keeps the narrower confirm popup chrome (max-w-md)", () => {
    renderConfirmDialog();
    expect(alertDialog()).toHaveClass("max-w-md", "gap-4", "bg-surface");
  });

  it("calls onClose when cancel is pressed, not onConfirm", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    renderConfirmDialog({ onClose, onConfirm });
    fireEvent.click(cancelButton());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm when confirm is pressed, not onClose", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    renderConfirmDialog({ onClose, onConfirm });
    fireEvent.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("honors confirmDisabled", () => {
    const onConfirm = vi.fn();
    renderConfirmDialog({ onConfirm, confirmDisabled: true });
    expect(confirmButton()).toBeDisabled();
    fireEvent.click(confirmButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disables confirm while busy without touching cancel", () => {
    renderConfirmDialog({ busy: true });
    expect(confirmButton()).toBeDisabled();
    expect(cancelButton()).toBeEnabled();
  });

  it("renders the confirm button as danger when destructive", () => {
    renderConfirmDialog({ destructive: true });
    expect(confirmButton()).toHaveClass("bg-danger");
  });

  it("renders the confirm button as primary by default", () => {
    renderConfirmDialog();
    expect(confirmButton()).toHaveClass("bg-primary");
    expect(confirmButton()).not.toHaveClass("bg-danger");
  });

  it("renders the secondary cancel recipe", () => {
    renderConfirmDialog();
    expect(cancelButton()).toHaveClass("border-border");
  });

  it("renders the header close button only when closeLabel is given", () => {
    const { unmount } = renderConfirmDialog({ closeLabel: CLOSE_LABEL });
    expect(
      screen.getByRole("button", { name: CLOSE_LABEL }),
    ).toBeInTheDocument();
    unmount();

    renderConfirmDialog();
    expect(
      screen.queryByRole("button", { name: CLOSE_LABEL }),
    ).not.toBeInTheDocument();
    // Only the two footer buttons remain.
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("calls onClose when the header close button is pressed", () => {
    const onClose = vi.fn();
    renderConfirmDialog({ onClose, closeLabel: CLOSE_LABEL });
    fireEvent.click(screen.getByRole("button", { name: CLOSE_LABEL }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    renderConfirmDialog({ onClose });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when the dim layer is pressed (alert semantics)", () => {
    const onClose = vi.fn();
    renderConfirmDialog({ onClose });
    // Outside-press on the viewport/dim layer never dismisses an
    // AlertDialog — only the explicit controls do.
    fireEvent.click(alertDialog().parentElement!);
    expect(onClose).not.toHaveBeenCalled();
  });
});
