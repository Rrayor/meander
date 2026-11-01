import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Dialog } from "./Dialog";

const TITLE = "Task details";
const DESCRIPTION = "Review the task fields";
const BODY = "Task body";
const CLOSE_LABEL = "Close";
const OPEN_LABEL = "Open task";
const FIELD_LABEL = "Notes";

const dialog = () => screen.getByRole("dialog");

interface RenderDialogOptions {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// Composition mirrors the legacy overlay DOM (backdrop nested inside the
// centering layer) — the composition call sites should use.
function renderDialog({ open = true, onOpenChange }: RenderDialogOptions = {}) {
  return render(
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Viewport data-testid="viewport">
          <Dialog.Backdrop data-testid="backdrop" />
          <Dialog.Popup>
            <Dialog.Title>{TITLE}</Dialog.Title>
            <Dialog.Description>{DESCRIPTION}</Dialog.Description>
            <p>{BODY}</p>
            <Dialog.Close>{CLOSE_LABEL}</Dialog.Close>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>,
  );
}

describe("Dialog", () => {
  it("renders nothing until the root opens", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("exposes the popup as a dialog named by its title", () => {
    renderDialog();
    expect(dialog()).toHaveAccessibleName(TITLE);
    expect(screen.getByRole("heading", { name: TITLE })).toBeInTheDocument();
  });

  it("wires the description as the dialog's aria-describedby", () => {
    renderDialog();
    const description = screen.getByText(DESCRIPTION);
    expect(dialog().getAttribute("aria-describedby")).toContain(description.id);
  });

  it("lays out the overlay with the shared recipes", () => {
    renderDialog();
    expect(screen.getByTestId("viewport")).toHaveClass(
      "fixed",
      "inset-0",
      "z-50",
      "flex",
      "items-center",
      "justify-center",
      "p-4",
    );
    expect(screen.getByTestId("backdrop")).toHaveClass(
      "absolute",
      "inset-0",
      "h-full",
      "w-full",
      "cursor-default",
      "bg-black/60",
    );
    // The popup recipe is byte-parity with the legacy overlay dialogs.
    expect(dialog()).toHaveClass(
      "relative",
      "m-0",
      "flex",
      "max-h-[90vh]",
      "w-full",
      "max-w-lg",
      "flex-col",
      "gap-6",
      "overflow-y-auto",
      "rounded-lg",
      "border",
      "border-border",
      "bg-surface",
      "p-6",
      "text-text",
      "shadow-2xl",
    );
    expect(screen.getByRole("heading", { name: TITLE })).toHaveClass(
      "font-title",
      "text-lg",
      "font-semibold",
      "text-text",
    );
    expect(screen.getByText(DESCRIPTION)).toHaveClass(
      "text-sm",
      "text-text-muted",
    );
  });

  it("lets a caller className override conflicting recipe classes", () => {
    render(
      <Dialog.Root open>
        <Dialog.Portal>
          <Dialog.Viewport className="p-8">
            <Dialog.Popup className="max-w-md gap-4" />
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>,
    );
    // Narrower confirmation-style dialogs (DeleteProfileDialog) resize via
    // className — the merge must keep the override, not the recipe.
    expect(dialog()).toHaveClass("max-w-md", "gap-4");
    expect(dialog()).not.toHaveClass("max-w-lg", "gap-6");
    expect(dialog().parentElement).toHaveClass("p-8", "fixed");
  });

  it("supports a Base UI state-callback className on styled parts", () => {
    render(
      <Dialog.Root open>
        <Dialog.Portal>
          <Dialog.Viewport
            className={(state) => (state.open ? "ring-1" : undefined)}
          >
            <Dialog.Popup />
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>,
    );
    expect(dialog().parentElement).toHaveClass("ring-1", "fixed");
  });

  it("forwards ref to the viewport and popup elements", () => {
    const viewportRef = createRef<HTMLDivElement>();
    const popupRef = createRef<HTMLDivElement>();
    render(
      <Dialog.Root open>
        <Dialog.Portal>
          <Dialog.Viewport ref={viewportRef}>
            <Dialog.Popup ref={popupRef} />
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>,
    );
    expect(popupRef.current).toBe(dialog());
    expect(viewportRef.current).toBe(dialog().parentElement);
  });

  it("opens from its trigger when uncontrolled", async () => {
    render(
      <Dialog.Root>
        <Dialog.Trigger>{OPEN_LABEL}</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Viewport>
            <Dialog.Popup>
              <Dialog.Title>{TITLE}</Dialog.Title>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>,
    );
    fireEvent.click(screen.getByRole("button", { name: OPEN_LABEL }));
    expect(
      await screen.findByRole("dialog", { name: TITLE }),
    ).toBeInTheDocument();
  });

  it("fires onOpenChange(false) on Escape", () => {
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });

  it("fires onOpenChange(false) when the dim layer is pressed", () => {
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    fireEvent.click(screen.getByTestId("backdrop"));
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });

  it("fires onOpenChange(false) when pressing the viewport around the popup", () => {
    // Sibling composition (Backdrop beside Viewport) puts the centering
    // layer on top of the dim layer: presses there must dismiss too.
    const onOpenChange = vi.fn();
    render(
      <Dialog.Root open onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Viewport data-testid="viewport">
            <Dialog.Popup>
              <Dialog.Title>{TITLE}</Dialog.Title>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>,
    );
    fireEvent.click(screen.getByTestId("viewport"));
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });

  it("does not fire onOpenChange when the popup itself is pressed", () => {
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    fireEvent.click(dialog());
    fireEvent.click(screen.getByText(BODY));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("closes when its Close part is pressed", () => {
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    fireEvent.click(screen.getByRole("button", { name: CLOSE_LABEL }));
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });

  it("moves focus inside while open and returns it on close", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            {OPEN_LABEL}
          </button>
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Portal>
              <Dialog.Viewport>
                <Dialog.Backdrop />
                <Dialog.Popup>
                  <Dialog.Title>{TITLE}</Dialog.Title>
                  <input aria-label={FIELD_LABEL} />
                  <Dialog.Close>{CLOSE_LABEL}</Dialog.Close>
                </Dialog.Popup>
              </Dialog.Viewport>
            </Dialog.Portal>
          </Dialog.Root>
        </>
      );
    }
    render(<Harness />);

    const opener = screen.getByRole("button", { name: OPEN_LABEL });
    opener.focus();
    fireEvent.click(opener);

    await waitFor(() =>
      expect(dialog().contains(document.activeElement)).toBe(true),
    );

    // Tab past the last tabbable element wraps back inside the popup —
    // focus must never escape to the page while the dialog is open.
    screen.getByRole("button", { name: CLOSE_LABEL }).focus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(dialog().contains(document.activeElement)).toBe(true);

    // Shift+Tab from the first tabbable element wraps inside too.
    screen.getByLabelText(FIELD_LABEL).focus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(dialog().contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});
