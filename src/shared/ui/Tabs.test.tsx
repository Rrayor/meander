import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { FOCUS_RING } from "./styles";
import { Tabs } from "./Tabs";

import type { TabsListProps, TabsRootProps } from "./Tabs";

const ALPHA = "Alpha";
const BETA = "Beta";
const GAMMA = "Gamma";
const LIST_LABEL = "Notes view";
const PANEL_SUFFIX = "panel";

const OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["a", ALPHA],
  ["b", BETA],
  ["c", GAMMA],
];

const list = () => screen.getByRole("tablist", { name: LIST_LABEL });
const tab = (name: string) => screen.getByRole("tab", { name });
const panel = () => screen.getByRole("tabpanel");

function panelContent(label: string) {
  return `${label} ${PANEL_SUFFIX}`;
}

function renderTabs({
  disabledValues = [],
  listProps,
  ...props
}: TabsRootProps & {
  disabledValues?: readonly string[];
  listProps?: Omit<TabsListProps, "children">;
}) {
  return render(
    <Tabs.Root {...props}>
      <Tabs.List aria-label={LIST_LABEL} {...listProps}>
        {OPTIONS.map(([value, label]) => (
          <Tabs.Tab
            key={value}
            value={value}
            disabled={disabledValues.includes(value)}
          >
            {label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {OPTIONS.map(([value, label]) => (
        <Tabs.Panel key={value} value={value}>
          {panelContent(label)}
        </Tabs.Panel>
      ))}
    </Tabs.Root>,
  );
}

describe("Tabs", () => {
  it("exposes a labelled tablist whose options are named tabs", () => {
    renderTabs({});
    expect(list()).toBeInTheDocument();
    for (const [, label] of OPTIONS) {
      expect(tab(label)).toBeInTheDocument();
    }
  });

  it("selects the first tab by default and mounts only its panel", () => {
    renderTabs({});
    expect(tab(ALPHA)).toHaveAttribute("aria-selected", "true");
    expect(tab(BETA)).toHaveAttribute("aria-selected", "false");
    expect(panel()).toHaveTextContent(panelContent(ALPHA));
    expect(screen.queryByText(panelContent(BETA))).not.toBeInTheDocument();
  });

  it("marks the selected tab with data-active", () => {
    renderTabs({});
    expect(tab(ALPHA)).toHaveAttribute("data-active");
    expect(tab(BETA)).not.toHaveAttribute("data-active");
  });

  it("selects a tab on click and swaps the visible panel", () => {
    renderTabs({});
    fireEvent.click(tab(BETA));
    expect(tab(ALPHA)).toHaveAttribute("aria-selected", "false");
    expect(tab(BETA)).toHaveAttribute("aria-selected", "true");
    expect(panel()).toHaveTextContent(panelContent(BETA));
    expect(screen.queryByText(panelContent(ALPHA))).not.toBeInTheDocument();
  });

  it("associates the active tab with its panel via aria-controls", () => {
    renderTabs({});
    const activeTab = tab(ALPHA);
    const activePanel = panel();
    expect(activeTab).toHaveAttribute("aria-controls", activePanel.id);
    expect(activePanel).toHaveAttribute("aria-labelledby", activeTab.id);
  });

  it("honours defaultValue as the initial tab", () => {
    renderTabs({ defaultValue: "b" });
    expect(tab(ALPHA)).toHaveAttribute("aria-selected", "false");
    expect(tab(BETA)).toHaveAttribute("aria-selected", "true");
    expect(panel()).toHaveTextContent(panelContent(BETA));
  });

  it("reports the next value through onValueChange", () => {
    const onValueChange = vi.fn();
    renderTabs({ defaultValue: "a", onValueChange });
    fireEvent.click(tab(BETA));
    expect(onValueChange).toHaveBeenCalledWith("b", expect.anything());
  });

  it("leaves rendering to the controlled value prop", () => {
    const onValueChange = vi.fn();
    renderTabs({ value: "a", onValueChange });
    fireEvent.click(tab(BETA));
    expect(onValueChange).toHaveBeenCalledWith("b", expect.anything());
    // Controlled: without a value update the selected tab must not move.
    expect(tab(ALPHA)).toHaveAttribute("aria-selected", "true");
    expect(tab(BETA)).toHaveAttribute("aria-selected", "false");
  });

  it("supports a fully controlled harness", () => {
    function Harness() {
      const [value, setValue] = useState("a");
      return (
        <Tabs.Root value={value} onValueChange={setValue}>
          <Tabs.List aria-label={LIST_LABEL}>
            {OPTIONS.map(([v, label]) => (
              <Tabs.Tab key={v} value={v}>
                {label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {OPTIONS.map(([v, label]) => (
            <Tabs.Panel key={v} value={v}>
              {panelContent(label)}
            </Tabs.Panel>
          ))}
        </Tabs.Root>
      );
    }
    render(<Harness />);
    fireEvent.click(tab(BETA));
    expect(tab(ALPHA)).toHaveAttribute("aria-selected", "false");
    expect(tab(BETA)).toHaveAttribute("aria-selected", "true");
    expect(panel()).toHaveTextContent(panelContent(BETA));
  });

  it("roves focus with the arrow keys", async () => {
    renderTabs({});
    // Programmatic focus must be flushed through act() so the composite's
    // roving index tracks the focused item before the keydown lands.
    act(() => tab(ALPHA).focus());
    fireEvent.keyDown(tab(ALPHA), { key: "ArrowRight" });
    // Base UI's composite moves focus inside a queued microtask.
    await waitFor(() => expect(tab(BETA)).toHaveFocus());
    fireEvent.keyDown(tab(BETA), { key: "ArrowRight" });
    await waitFor(() => expect(tab(GAMMA)).toHaveFocus());
    fireEvent.keyDown(tab(GAMMA), { key: "ArrowLeft" });
    await waitFor(() => expect(tab(BETA)).toHaveFocus());
  });

  it("loops focus back to the first tab from the last", async () => {
    renderTabs({});
    act(() => tab(GAMMA).focus());
    fireEvent.keyDown(tab(GAMMA), { key: "ArrowRight" });
    await waitFor(() => expect(tab(ALPHA)).toHaveFocus());
  });

  it("moves focus without selecting by default", async () => {
    renderTabs({});
    act(() => tab(ALPHA).focus());
    fireEvent.keyDown(tab(ALPHA), { key: "ArrowRight" });
    await waitFor(() => expect(tab(BETA)).toHaveFocus());
    // Base UI's default is manual activation: focus roves but the
    // selected tab does not follow until Enter/Space/click.
    expect(tab(ALPHA)).toHaveAttribute("aria-selected", "true");
    expect(tab(BETA)).toHaveAttribute("aria-selected", "false");
  });

  it("selects the focused tab on arrow keys when activateOnFocus is set", async () => {
    // NotesTabs parity: its hand-rolled tablist activated on arrow keys.
    renderTabs({ listProps: { activateOnFocus: true } });
    act(() => tab(ALPHA).focus());
    fireEvent.keyDown(tab(ALPHA), { key: "ArrowRight" });
    await waitFor(() => expect(tab(BETA)).toHaveFocus());
    await waitFor(() =>
      expect(tab(BETA)).toHaveAttribute("aria-selected", "true"),
    );
    expect(panel()).toHaveTextContent(panelContent(BETA));
  });

  it("lets arrow-key focus land on a disabled tab without selecting it", async () => {
    // Base UI renders tabs with focusableWhenDisabled: a disabled tab
    // stays in the roving sequence (aria-disabled, not skipped) and
    // activateOnFocus still cannot activate it.
    const onValueChange = vi.fn();
    renderTabs({
      defaultValue: "a",
      disabledValues: ["b"],
      listProps: { activateOnFocus: true },
      onValueChange,
    });
    act(() => tab(ALPHA).focus());
    fireEvent.keyDown(tab(ALPHA), { key: "ArrowRight" });
    await waitFor(() => expect(tab(BETA)).toHaveFocus());
    expect(tab(BETA)).toHaveAttribute("aria-disabled", "true");
    expect(tab(BETA)).toHaveAttribute("aria-selected", "false");
    fireEvent.keyDown(tab(BETA), { key: "ArrowRight" });
    await waitFor(() => expect(tab(GAMMA)).toHaveFocus());
  });

  it("ignores clicks on a disabled tab", () => {
    const onValueChange = vi.fn();
    renderTabs({ defaultValue: "a", disabledValues: ["b"], onValueChange });
    const disabledTab = tab(BETA);
    expect(disabledTab).toHaveAttribute("data-disabled");
    expect(disabledTab).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(disabledTab);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(disabledTab).toHaveAttribute("aria-selected", "false");
  });

  it("selects the first enabled tab when the first tab is disabled", () => {
    renderTabs({ disabledValues: ["a"] });
    expect(tab(ALPHA)).toHaveAttribute("aria-selected", "false");
    expect(tab(BETA)).toHaveAttribute("aria-selected", "true");
    expect(panel()).toHaveTextContent(panelContent(BETA));
  });

  it("keeps inactive panels mounted and hidden when keepMounted is set", () => {
    render(
      <Tabs.Root defaultValue="a">
        <Tabs.List aria-label={LIST_LABEL}>
          {OPTIONS.map(([value, label]) => (
            <Tabs.Tab key={value} value={value}>
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {OPTIONS.map(([value, label]) => (
          <Tabs.Panel key={value} value={value} keepMounted>
            {panelContent(label)}
          </Tabs.Panel>
        ))}
      </Tabs.Root>,
    );
    const hiddenPanel = screen.getByText(panelContent(BETA));
    expect(hiddenPanel).not.toBeVisible();
    // With all panels mounted every tab resolves its aria-controls target.
    expect(tab(BETA)).toHaveAttribute("aria-controls", hiddenPanel.id);
    expect(hiddenPanel).toHaveAttribute("aria-labelledby", tab(BETA).id);
  });

  it("applies the underline recipe to tabs", () => {
    renderTabs({});
    expect(tab(ALPHA)).toHaveClass(
      "-mb-px",
      "border-b-2",
      "pb-2",
      "text-sm",
      "transition-colors",
      "not-data-[active]:border-transparent",
      "not-data-[active]:text-text-muted",
      "not-data-[active]:hover:text-text",
      "data-[active]:border-primary",
      "data-[active]:font-medium",
      "data-[active]:text-primary",
      "data-[disabled]:opacity-50",
      ...FOCUS_RING.split(" "),
    );
  });

  it("lays out the list as a bordered flex row", () => {
    renderTabs({});
    expect(list()).toHaveClass("flex", "gap-4", "border-b", "border-border");
  });

  it("pads the panel", () => {
    renderTabs({});
    expect(panel()).toHaveClass("py-3");
  });

  it("merges a caller className over the tab recipe", () => {
    render(
      <Tabs.Root defaultValue="a">
        <Tabs.List aria-label={LIST_LABEL}>
          <Tabs.Tab value="a" className="px-4 pb-3">
            {ALPHA}
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.Root>,
    );
    const el = tab(ALPHA);
    expect(el).toHaveClass("px-4", "pb-3", "border-b-2");
    expect(el).not.toHaveClass("pb-2");
  });

  it("merges a caller className on the list", () => {
    renderTabs({ listProps: { className: "gap-8" } });
    expect(list()).toHaveClass("gap-8", "border-b", "border-border");
    expect(list()).not.toHaveClass("gap-4");
  });

  it("merges a caller className on the panel", () => {
    render(
      <Tabs.Root defaultValue="a">
        <Tabs.List aria-label={LIST_LABEL}>
          <Tabs.Tab value="a">{ALPHA}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="a" className="pt-6">
          {panelContent(ALPHA)}
        </Tabs.Panel>
      </Tabs.Root>,
    );
    expect(panel()).toHaveClass("pt-6", "py-3");
  });

  it("supports a Base UI state-callback className on tabs", () => {
    render(
      <Tabs.Root defaultValue="a">
        <Tabs.List aria-label={LIST_LABEL}>
          <Tabs.Tab
            value="a"
            className={(state) => (state.active ? "ring-1" : undefined)}
          >
            {ALPHA}
          </Tabs.Tab>
          <Tabs.Tab value="b">{BETA}</Tabs.Tab>
        </Tabs.List>
      </Tabs.Root>,
    );
    expect(tab(ALPHA)).toHaveClass("ring-1", "border-b-2");
    expect(tab(BETA)).not.toHaveClass("ring-1");
  });

  it("forwards ref to the root, list, tab and panel", () => {
    const rootRef = createRef<HTMLDivElement>();
    const listRef = createRef<HTMLDivElement>();
    const tabRef = createRef<HTMLButtonElement>();
    const panelRef = createRef<HTMLDivElement>();
    render(
      <Tabs.Root ref={rootRef} defaultValue="a">
        <Tabs.List ref={listRef} aria-label={LIST_LABEL}>
          <Tabs.Tab ref={tabRef} value="a">
            {ALPHA}
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel ref={panelRef} value="a">
          {panelContent(ALPHA)}
        </Tabs.Panel>
      </Tabs.Root>,
    );
    expect(rootRef.current).toContainElement(list());
    expect(listRef.current).toBe(list());
    expect(tabRef.current).toBe(tab(ALPHA));
    expect(panelRef.current).toBe(panel());
  });
});
