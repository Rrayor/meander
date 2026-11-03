import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, useState } from "react";
import { describe, expect, it } from "vitest";

import { Combobox } from "./Combobox";
import { Dialog } from "./Dialog";

const INPUT_LABEL = "Tags";
const DIALOG_TITLE = "Task details";
const ITEMS = ["alpha", "beta", "gamma"];
const REMOVE_LABEL = "Remove alpha";

// The composition call sites use: a chips box holding selected chips plus
// the text input, and a portaled item list anchored to the box.
function comboboxTree() {
  return (
    <>
      <Combobox.Chips>
        <Combobox.Value>
          {(selected: string[]) =>
            selected.map((item) => (
              <Combobox.Chip key={item}>
                {item}
                <Combobox.ChipRemove aria-label={`Remove ${item}`} />
              </Combobox.Chip>
            ))
          }
        </Combobox.Value>
        <Combobox.Input aria-label={INPUT_LABEL} />
      </Combobox.Chips>
      <Combobox.Portal>
        <Combobox.Positioner>
          <Combobox.Popup>
            <Combobox.List>
              {(item: string, index: number) => (
                <Combobox.Item key={item} index={index} value={item}>
                  {item}
                  <Combobox.ItemIndicator />
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </>
  );
}

const input = () => screen.getByRole("combobox", { name: INPUT_LABEL });

async function openPopup() {
  // The part opens on input mousedown (openOnInputClick) — the feature
  // additionally opens on focus.
  fireEvent.mouseDown(input());
  await screen.findByRole("listbox");
}

describe("Combobox", () => {
  it("renders an input with the caller's accessible name", () => {
    render(
      <Combobox.Root multiple filteredItems={ITEMS}>
        {comboboxTree()}
      </Combobox.Root>,
    );
    expect(input()).toHaveAttribute("aria-expanded", "false");
  });

  it("lists the filtered items in a portaled listbox on press", async () => {
    render(
      <Combobox.Root multiple filteredItems={ITEMS}>
        {comboboxTree()}
      </Combobox.Root>,
    );
    await openPopup();
    expect(input()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(
      ITEMS,
    );
  });

  it("selects an option into a removable chip", async () => {
    const Harness = () => {
      const [selected, setSelected] = useState<string[]>([]);
      return (
        <Combobox.Root
          multiple
          filteredItems={ITEMS}
          value={selected}
          onValueChange={setSelected}
        >
          {comboboxTree()}
        </Combobox.Root>
      );
    };
    render(<Harness />);
    await openPopup();
    fireEvent.click(screen.getByRole("option", { name: /alpha/ }));
    expect(
      screen.getByRole("button", { name: REMOVE_LABEL }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /alpha/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: REMOVE_LABEL }));
    expect(
      screen.queryByRole("button", { name: REMOVE_LABEL }),
    ).not.toBeInTheDocument();
  });

  it("commits the highlighted option from the keyboard", async () => {
    const Harness = () => {
      const [selected, setSelected] = useState<string[]>([]);
      return (
        <Combobox.Root
          multiple
          filteredItems={ITEMS}
          value={selected}
          onValueChange={setSelected}
        >
          {comboboxTree()}
        </Combobox.Root>
      );
    };
    render(<Harness />);
    await openPopup();
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(
      screen.getByRole("button", { name: REMOVE_LABEL }),
    ).toBeInTheDocument();
  });

  it("removes the last chip on Backspace with an empty input", async () => {
    const Harness = () => {
      const [selected, setSelected] = useState<string[]>(["alpha", "beta"]);
      return (
        <Combobox.Root
          multiple
          filteredItems={ITEMS}
          value={selected}
          onValueChange={setSelected}
        >
          {comboboxTree()}
        </Combobox.Root>
      );
    };
    render(<Harness />);
    fireEvent.keyDown(input(), { key: "Backspace" });
    expect(
      screen.queryByRole("button", { name: "Remove beta" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: REMOVE_LABEL }),
    ).toBeInTheDocument();
  });

  it("closes only the popup on Escape when mounted inside a dialog", async () => {
    render(
      <Dialog.Root open>
        <Dialog.Portal>
          <Dialog.Viewport>
            <Dialog.Popup>
              <Dialog.Title>{DIALOG_TITLE}</Dialog.Title>
              <Combobox.Root multiple filteredItems={ITEMS}>
                {comboboxTree()}
              </Combobox.Root>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>,
    );
    await openPopup();
    fireEvent.keyDown(input(), { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
    );
    // The enclosing dialog survives the popup's dismissal.
    expect(
      screen.getByRole("dialog", { name: DIALOG_TITLE }),
    ).toBeInTheDocument();
  });

  it("merges a caller className over the part recipes", async () => {
    const CHIPS_OVERRIDE = "min-h-0";
    render(
      <Combobox.Root multiple filteredItems={ITEMS}>
        <Combobox.Chips className={CHIPS_OVERRIDE}>
          <Combobox.Input aria-label={INPUT_LABEL} />
        </Combobox.Chips>
        <Combobox.Portal>
          <Combobox.Positioner>
            <Combobox.Popup className="rounded-md">
              <Combobox.List>
                {(item: string, index: number) => (
                  <Combobox.Item key={item} index={index} value={item}>
                    {item}
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>,
    );
    expect(input().parentElement).toHaveClass(CHIPS_OVERRIDE);
    await openPopup();
    expect(screen.getByRole("listbox").parentElement).toHaveClass("rounded-md");
  });

  it("forwards ref to the chips and input elements", () => {
    const chipsRef = createRef<HTMLDivElement>();
    const inputRef = createRef<HTMLInputElement>();
    render(
      <Combobox.Root multiple filteredItems={ITEMS}>
        <Combobox.Chips ref={chipsRef}>
          <Combobox.Input ref={inputRef} aria-label={INPUT_LABEL} />
        </Combobox.Chips>
      </Combobox.Root>,
    );
    expect(chipsRef.current).toBe(input().parentElement);
    expect(inputRef.current).toBe(input());
  });

  it("does not open while disabled", () => {
    render(
      <Combobox.Root multiple filteredItems={ITEMS} disabled>
        {comboboxTree()}
      </Combobox.Root>,
    );
    expect(input()).toBeDisabled();
    fireEvent.mouseDown(input());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
