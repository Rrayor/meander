import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FormDialog } from "./FormDialog";

const TITLE = "Edit category";
const CLOSE_LABEL = "Close dialog";
const BODY_TEXT = "Form body";
const FOOTER_LABEL = "Save changes";

const dialog = () => screen.getByRole("dialog");

interface RenderFormDialogOptions {
  open?: boolean;
  onClose?: () => void;
  footer?: React.ReactNode;
}

const DEFAULT_FOOTER = <button type="button">{FOOTER_LABEL}</button>;

function renderFormDialog({
  open = true,
  onClose,
  ...rest
}: RenderFormDialogOptions = {}) {
  return render(
    <FormDialog
      open={open}
      onClose={onClose ?? vi.fn()}
      title={TITLE}
      closeLabel={CLOSE_LABEL}
      footer={DEFAULT_FOOTER}
      {...rest}
    >
      <p>{BODY_TEXT}</p>
    </FormDialog>,
  );
}

describe("FormDialog", () => {
  it("renders nothing until open", () => {
    renderFormDialog({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("exposes the popup as a dialog named by its title", () => {
    renderFormDialog();
    expect(dialog()).toHaveAccessibleName(TITLE);
    expect(screen.getByRole("heading", { name: TITLE })).toBeInTheDocument();
  });

  it("renders children as the body and the footer slot as an action row", () => {
    renderFormDialog();
    expect(screen.getByText(BODY_TEXT)).toBeInTheDocument();
    const footerButton = screen.getByRole("button", { name: FOOTER_LABEL });
    expect(footerButton.parentElement).toHaveClass(
      "flex",
      "justify-end",
      "gap-2",
    );
  });

  it("omits the footer row when the footer prop is null", () => {
    renderFormDialog({ footer: null });
    expect(
      screen.queryByRole("button", { name: FOOTER_LABEL }),
    ).not.toBeInTheDocument();
  });

  it("keeps the shared header chrome (title row with close button)", () => {
    renderFormDialog();
    const header = screen.getByRole("heading", { name: TITLE }).parentElement;
    expect(header).toHaveClass("flex", "items-center", "justify-between");
    expect(
      screen.getByRole("button", { name: CLOSE_LABEL }),
    ).toBeInTheDocument();
  });

  it("keeps the shared popup chrome (max-w-lg surface)", () => {
    renderFormDialog();
    expect(dialog()).toHaveClass("max-w-lg", "gap-6", "bg-surface");
  });

  it("calls onClose when the header close button is pressed", () => {
    const onClose = vi.fn();
    renderFormDialog({ onClose });
    fireEvent.click(screen.getByRole("button", { name: CLOSE_LABEL }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape (Dialog dismissal parity)", () => {
    const onClose = vi.fn();
    renderFormDialog({ onClose });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the dim layer is pressed", () => {
    const onClose = vi.fn();
    renderFormDialog({ onClose });
    // Pressing the viewport around the popup is the outside-press path —
    // the backdrop covers the whole viewport and forwards to it.
    fireEvent.click(dialog().parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when the popup content is pressed", () => {
    const onClose = vi.fn();
    renderFormDialog({ onClose });
    fireEvent.click(dialog());
    fireEvent.click(screen.getByText(BODY_TEXT));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("stops rendering when the caller drives open to false", () => {
    const { rerender } = renderFormDialog();
    expect(dialog()).toBeInTheDocument();
    rerender(
      <FormDialog
        open={false}
        onClose={vi.fn()}
        title={TITLE}
        closeLabel={CLOSE_LABEL}
      >
        <p>{BODY_TEXT}</p>
      </FormDialog>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
