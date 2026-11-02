import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { Dialog } from "./Dialog";
import { Select } from "./Select";

const TRIGGER_LABEL = "Sort order";
const PLACEHOLDER = "Choose an order";
const NEWEST = "Newest first";
const OLDEST = "Oldest first";
const BY_TITLE = "By title";
const DIALOG_TITLE = "Task details";
const DIALOG_Z_INDEX_CLASS = "z-50";
const RAISED_Z_INDEX_CLASS = "z-[60]";
const HIGHLIGHTED_OVERRIDE = "font-bold";
const POSITIONER_TEST_ID = "positioner";

interface TestOption {
  value: string;
  label: string;
}

const OPTIONS: TestOption[] = [
  { value: "newest", label: NEWEST },
  { value: "oldest", label: OLDEST },
  { value: "title", label: BY_TITLE },
];

// Value resolves a selected item's label from the Root `items` record —
// without it the trigger would render the raw value after the popup's
// items unmount on close.
const ITEM_LABELS: Record<string, string> = Object.fromEntries(
  OPTIONS.map((option) => [option.value, option.label]),
);

const trigger = () => screen.getByRole("combobox", { name: TRIGGER_LABEL });
const listbox = () => screen.getByRole("listbox");

interface RenderSelectOptions {
  defaultValue?: string;
  onValueChange?: (value: string | null) => void;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  positionerTestId?: boolean;
  positionerClassName?: string;
}

// The composition call sites use: a labeled trigger showing the selected
// value with a chevron, and the item list portaled through a positioner.
function selectTree({
  positionerTestId,
  positionerClassName,
}: Pick<RenderSelectOptions, "positionerTestId" | "positionerClassName"> = {}) {
  return (
    <>
      <Select.Trigger aria-label={TRIGGER_LABEL}>
        <Select.Value placeholder={PLACEHOLDER} />
        <Select.Icon />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          data-testid={positionerTestId ? POSITIONER_TEST_ID : undefined}
          className={positionerClassName}
        >
          <Select.Popup>
            {OPTIONS.map((option) => (
              <Select.Item key={option.value} value={option.value}>
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </>
  );
}

function renderSelect({
  defaultValue,
  onValueChange,
  onOpenChange,
  disabled,
  positionerTestId,
  positionerClassName,
}: RenderSelectOptions = {}) {
  return render(
    <Select.Root
      items={ITEM_LABELS}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      onOpenChange={onOpenChange}
      disabled={disabled}
    >
      {selectTree({ positionerTestId, positionerClassName })}
    </Select.Root>,
  );
}

// Base UI's select opens on mousedown in a real browser, but the deferred
// open lands a frame late under jsdom — a stale rAF can re-open the popup
// after a synchronous Escape and flake the test. fireEvent.click toggles
// the same `useClick` path synchronously (no pointerdown means Base UI sees
// no pointer type, so the mousedown guard lets click through), which keeps
// every assertion free of pending frames.
function pressTrigger() {
  fireEvent.click(trigger());
}

async function openSelect() {
  pressTrigger();
  await screen.findByRole("listbox");
}

describe("Select", () => {
  it("exposes a collapsed combobox until the root opens", () => {
    renderSelect();
    expect(trigger()).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows the placeholder text while no value is selected", () => {
    renderSelect();
    expect(trigger()).toHaveTextContent(PLACEHOLDER);
  });

  it("opens on press, lists the options, and wires aria-expanded/controls", async () => {
    renderSelect();
    await openSelect();

    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(OPTIONS.length);
    expect(options.map((option) => option.textContent)).toEqual(
      OPTIONS.map((option) => option.label),
    );
    // aria-controls points at the rendered listbox while open.
    expect(trigger().getAttribute("aria-controls")).toBe(listbox().id);
  });

  it("selects an option with the pointer and reports the value", async () => {
    const onValueChange = vi.fn();
    renderSelect({ onValueChange });
    await openSelect();

    const option = screen.getByRole("option", { name: OLDEST });
    // Item clicks commit only for a press that started on the item (or a
    // keyboard/AT activation) — pointerdown precedes click in a real mouse
    // selection, so the sequence must include it.
    fireEvent.pointerDown(option);
    fireEvent.click(option);

    expect(onValueChange).toHaveBeenCalledWith("oldest", expect.anything());
    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
    );
    expect(trigger()).toHaveTextContent(OLDEST);
    expect(trigger()).not.toHaveTextContent(PLACEHOLDER);
  });

  it("marks the selected option with aria-selected and its indicator", async () => {
    renderSelect({ defaultValue: "newest" });
    await openSelect();

    const selected = screen.getByRole("option", { name: NEWEST });
    const unselected = screen.getByRole("option", { name: OLDEST });
    expect(selected).toHaveAttribute("aria-selected", "true");
    expect(unselected).toHaveAttribute("aria-selected", "false");
    // The ItemIndicator renders only for the selected item.
    expect(selected.querySelector("svg")).not.toBeNull();
    expect(unselected.querySelector("svg")).toBeNull();
  });

  it("navigates with arrow keys and commits the highlight with Enter", async () => {
    const onValueChange = vi.fn();
    renderSelect({ onValueChange });
    await openSelect();

    // The first option opens highlighted; arrows move it.
    expect(screen.getByRole("option", { name: NEWEST })).toHaveAttribute(
      "data-highlighted",
    );
    fireEvent.keyDown(listbox(), { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: OLDEST })).toHaveAttribute(
      "data-highlighted",
    );
    // ArrowUp walks back to the first option.
    fireEvent.keyDown(listbox(), { key: "ArrowUp" });
    expect(screen.getByRole("option", { name: NEWEST })).toHaveAttribute(
      "data-highlighted",
    );
    fireEvent.keyDown(listbox(), { key: "ArrowDown" });
    // The highlight carries DOM focus — Enter lands on the focused option
    // and commits it, not on the listbox container.
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(onValueChange).toHaveBeenCalledWith("oldest", expect.anything());
    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
    );
    expect(trigger()).toHaveTextContent(OLDEST);
  });

  it("closes on Escape without changing the value", async () => {
    const onValueChange = vi.fn();
    const onOpenChange = vi.fn();
    renderSelect({ defaultValue: "newest", onValueChange, onOpenChange });
    await openSelect();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
    );
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
    expect(onValueChange).not.toHaveBeenCalled();
    expect(trigger()).toHaveTextContent(NEWEST);
  });

  it("closes only the select on Escape when mounted inside a dialog", async () => {
    // Review Focus #1: inside an open dialog the Escape keypress that
    // dismisses the popup must not dismiss the enclosing dialog — the
    // select registers as a blocking child in the dismissal layer stack.
    render(
      <Dialog.Root open>
        <Dialog.Portal>
          <Dialog.Viewport>
            <Dialog.Popup>
              <Dialog.Title>{DIALOG_TITLE}</Dialog.Title>
              <Select.Root>{selectTree()}</Select.Root>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>,
    );
    await openSelect();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("dialog", { name: DIALOG_TITLE }),
    ).toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("stacks the popup above dialog content via Positioner className", async () => {
    // Review Focus #2: z-index is a call-site concern applied through the
    // Positioner className prop. The dialog viewport pins z-50; a raised
    // class on the positioner must reach the element (and override the
    // base class) so the portaled popup paints above modal dialog content.
    render(
      <Dialog.Root open>
        <Dialog.Portal>
          <Dialog.Viewport>
            <Dialog.Popup>
              <Dialog.Title>{DIALOG_TITLE}</Dialog.Title>
              <Select.Root>
                {selectTree({
                  positionerTestId: true,
                  positionerClassName: RAISED_Z_INDEX_CLASS,
                })}
              </Select.Root>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>,
    );
    await openSelect();

    const positioner = screen.getByTestId(POSITIONER_TEST_ID);
    expect(positioner).toHaveClass(RAISED_Z_INDEX_CLASS);
    expect(positioner).not.toHaveClass(DIALOG_Z_INDEX_CLASS);
    expect(positioner).toContainElement(listbox());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("merges a caller className over the part recipes", async () => {
    const ROUNDED_OVERRIDE = "rounded-lg";
    render(
      <Select.Root>
        <Select.Trigger aria-label={TRIGGER_LABEL} className="w-64">
          <Select.Value placeholder={PLACEHOLDER} />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner>
            <Select.Popup className={ROUNDED_OVERRIDE}>
              <Select.Item value="newest" className="py-1">
                <Select.ItemText>{NEWEST}</Select.ItemText>
              </Select.Item>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>,
    );
    expect(trigger()).toHaveClass("w-64");

    await openSelect();
    // A conflicting utility wins over the recipe, same as every primitive.
    expect(listbox()).toHaveClass(ROUNDED_OVERRIDE);
    expect(listbox()).not.toHaveClass("rounded-md");
    expect(screen.getByRole("option", { name: NEWEST })).toHaveClass("py-1");
    expect(screen.getByRole("option", { name: NEWEST })).not.toHaveClass(
      "py-2",
    );
  });

  it("supports a Base UI state-callback className on styled parts", async () => {
    render(
      <Select.Root>
        <Select.Trigger aria-label={TRIGGER_LABEL}>
          <Select.Value placeholder={PLACEHOLDER} />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner>
            <Select.Popup>
              <Select.Item
                value="newest"
                className={(state) =>
                  state.highlighted ? HIGHLIGHTED_OVERRIDE : undefined
                }
              >
                <Select.ItemText>{NEWEST}</Select.ItemText>
              </Select.Item>
              <Select.Item value="oldest">
                <Select.ItemText>{OLDEST}</Select.ItemText>
              </Select.Item>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>,
    );
    await openSelect();

    const option = screen.getByRole("option", { name: NEWEST });
    // The state callback sees the pre-highlighted first option on open and
    // drops the class once the highlight moves to the second option.
    expect(option).toHaveClass(HIGHLIGHTED_OVERRIDE);
    fireEvent.keyDown(listbox(), { key: "ArrowDown" });
    expect(option).not.toHaveClass(HIGHLIGHTED_OVERRIDE);
  });

  it("forwards ref to the trigger and popup elements", async () => {
    const triggerRef = createRef<HTMLButtonElement>();
    const popupRef = createRef<HTMLDivElement>();
    render(
      <Select.Root>
        <Select.Trigger ref={triggerRef} aria-label={TRIGGER_LABEL}>
          <Select.Value placeholder={PLACEHOLDER} />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner>
            <Select.Popup ref={popupRef}>
              <Select.Item value="newest">
                <Select.ItemText>{NEWEST}</Select.ItemText>
              </Select.Item>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>,
    );
    expect(triggerRef.current).toBe(trigger());

    await openSelect();
    expect(popupRef.current).toBe(listbox());
  });

  it("does not open while disabled", () => {
    renderSelect({ disabled: true });
    expect(trigger()).toBeDisabled();
    pressTrigger();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
