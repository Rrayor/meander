import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { AlertDialog } from "./AlertDialog";

const TITLE = "Delete profile";
const DESCRIPTION = "This cannot be undone";
const BODY = "Profile body";
const CLOSE_LABEL = "Cancel";
const OPEN_LABEL = "Open confirm";
const FIELD_LABEL = "Confirmation";

const alertDialog = () => screen.getByRole("alertdialog");

interface RenderAlertDialogOptions {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// Composition mirrors the Dialog test harness (backdrop nested inside the
// centering layer) — the composition call sites should use.
function renderAlertDialog({
  open = true,
  onOpenChange,
}: RenderAlertDialogOptions = {}) {
  return render(
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Viewport data-testid="viewport">
          <AlertDialog.Backdrop data-testid="backdrop" />
          <AlertDialog.Popup>
            <AlertDialog.Title>{TITLE}</AlertDialog.Title>
            <AlertDialog.Description>{DESCRIPTION}</AlertDialog.Description>
            <p>{BODY}</p>
            <AlertDialog.Close>{CLOSE_LABEL}</AlertDialog.Close>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>,
  );
}

describe("AlertDialog", () => {
  it("renders nothing until the root opens", () => {
    renderAlertDialog({ open: false });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("exposes the popup as an alertdialog named by its title", () => {
    renderAlertDialog();
    expect(alertDialog()).toHaveAccessibleName(TITLE);
    expect(screen.getByRole("heading", { name: TITLE })).toBeInTheDocument();
  });

  it("wires the description as the popup's aria-describedby", () => {
    renderAlertDialog();
    const description = screen.getByText(DESCRIPTION);
    expect(alertDialog().getAttribute("aria-describedby")).toContain(
      description.id,
    );
  });

  it("lays out the overlay with the shared recipes", () => {
    renderAlertDialog();
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
    expect(alertDialog()).toHaveClass(
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
      <AlertDialog.Root open>
        <AlertDialog.Portal>
          <AlertDialog.Viewport className="p-8">
            <AlertDialog.Popup className="max-w-md gap-4" />
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>,
    );
    // Narrower confirmation dialogs resize via className — the merge must
    // keep the override, not the recipe.
    expect(alertDialog()).toHaveClass("max-w-md", "gap-4");
    expect(alertDialog()).not.toHaveClass("max-w-lg", "gap-6");
    expect(alertDialog().parentElement).toHaveClass("p-8", "fixed");
  });

  it("supports a Base UI state-callback className on styled parts", () => {
    render(
      <AlertDialog.Root open>
        <AlertDialog.Portal>
          <AlertDialog.Viewport
            className={(state) => (state.open ? "ring-1" : undefined)}
          >
            <AlertDialog.Popup />
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>,
    );
    expect(alertDialog().parentElement).toHaveClass("ring-1", "fixed");
  });

  it("forwards ref to the viewport and popup elements", () => {
    const viewportRef = createRef<HTMLDivElement>();
    const popupRef = createRef<HTMLDivElement>();
    render(
      <AlertDialog.Root open>
        <AlertDialog.Portal>
          <AlertDialog.Viewport ref={viewportRef}>
            <AlertDialog.Popup ref={popupRef} />
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>,
    );
    expect(popupRef.current).toBe(alertDialog());
    expect(viewportRef.current).toBe(alertDialog().parentElement);
  });

  it("opens from its trigger when uncontrolled", async () => {
    render(
      <AlertDialog.Root>
        <AlertDialog.Trigger>{OPEN_LABEL}</AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Viewport>
            <AlertDialog.Popup>
              <AlertDialog.Title>{TITLE}</AlertDialog.Title>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>,
    );
    fireEvent.click(screen.getByRole("button", { name: OPEN_LABEL }));
    expect(
      await screen.findByRole("alertdialog", { name: TITLE }),
    ).toBeInTheDocument();
  });

  it("fires onOpenChange(false) on Escape", () => {
    const onOpenChange = vi.fn();
    renderAlertDialog({ onOpenChange });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });

  it("does not fire onOpenChange when the dim layer is pressed", () => {
    // Base UI parity: AlertDialog never dismisses on outside press — an
    // explicit choice (Close or an action button) is required. Call sites
    // needing backdrop-close semantics use Dialog parts instead.
    const onOpenChange = vi.fn();
    renderAlertDialog({ onOpenChange });
    fireEvent.click(screen.getByTestId("backdrop"));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("does not fire onOpenChange when pressing the viewport around the popup", () => {
    const onOpenChange = vi.fn();
    render(
      <AlertDialog.Root open onOpenChange={onOpenChange}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Viewport data-testid="viewport">
            <AlertDialog.Popup>
              <AlertDialog.Title>{TITLE}</AlertDialog.Title>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>,
    );
    fireEvent.click(screen.getByTestId("viewport"));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("does not fire onOpenChange when the popup itself is pressed", () => {
    const onOpenChange = vi.fn();
    renderAlertDialog({ onOpenChange });
    fireEvent.click(alertDialog());
    fireEvent.click(screen.getByText(BODY));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("closes when its Close part is pressed", () => {
    const onOpenChange = vi.fn();
    renderAlertDialog({ onOpenChange });
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
          <AlertDialog.Root open={open} onOpenChange={setOpen}>
            <AlertDialog.Portal>
              <AlertDialog.Viewport>
                <AlertDialog.Backdrop />
                <AlertDialog.Popup>
                  <AlertDialog.Title>{TITLE}</AlertDialog.Title>
                  <input aria-label={FIELD_LABEL} />
                  <AlertDialog.Close>{CLOSE_LABEL}</AlertDialog.Close>
                </AlertDialog.Popup>
              </AlertDialog.Viewport>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </>
      );
    }
    render(<Harness />);

    const opener = screen.getByRole("button", { name: OPEN_LABEL });
    opener.focus();
    fireEvent.click(opener);

    await waitFor(() =>
      expect(alertDialog().contains(document.activeElement)).toBe(true),
    );

    // Tab past the last tabbable element wraps back inside the popup —
    // focus must never escape to the page while the dialog is open.
    screen.getByRole("button", { name: CLOSE_LABEL }).focus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(alertDialog().contains(document.activeElement)).toBe(true);

    // Shift+Tab from the first tabbable element wraps inside too.
    screen.getByLabelText(FIELD_LABEL).focus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(alertDialog().contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});
