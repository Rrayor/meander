import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Toggle, ToggleGroup } from "./ToggleGroup";
import { FOCUS_RING } from "./styles";

import type { ToggleGroupRootProps } from "./ToggleGroup";

const ALPHA = "Alpha";
const BETA = "Beta";
const GAMMA = "Gamma";
const GROUP_LABEL = "Pick days";
const STANDALONE_LABEL = "Mute";

const CHIPS: ReadonlyArray<readonly [string, string]> = [
  ["a", ALPHA],
  ["b", BETA],
  ["c", GAMMA],
];

const group = () => screen.getByRole("group", { name: GROUP_LABEL });
const chip = (name: string) => screen.getByRole("button", { name });

function renderGroup({
  chips = CHIPS,
  ...props
}: ToggleGroupRootProps & {
  chips?: ReadonlyArray<readonly [string, string]>;
}) {
  return render(
    <ToggleGroup.Root aria-label={GROUP_LABEL} {...props}>
      {chips.map(([value, label]) => (
        <ToggleGroup.Toggle key={value} value={value}>
          {label}
        </ToggleGroup.Toggle>
      ))}
    </ToggleGroup.Root>,
  );
}

describe("ToggleGroup", () => {
  it("exposes a labelled group whose toggles are named buttons", () => {
    renderGroup({});
    expect(group()).toBeInTheDocument();
    for (const [, label] of CHIPS) {
      expect(chip(label)).toBeInTheDocument();
    }
  });

  it("toggles aria-pressed on click in uncontrolled single mode", () => {
    renderGroup({});
    fireEvent.click(chip(ALPHA));
    expect(chip(ALPHA)).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip(ALPHA));
    expect(chip(ALPHA)).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps single-select exclusivity without the multiple prop", () => {
    renderGroup({});
    fireEvent.click(chip(ALPHA));
    fireEvent.click(chip(BETA));
    expect(chip(ALPHA)).toHaveAttribute("aria-pressed", "false");
    expect(chip(BETA)).toHaveAttribute("aria-pressed", "true");
  });

  it("lets several toggles stay pressed when multiple is set", () => {
    renderGroup({ multiple: true });
    fireEvent.click(chip(ALPHA));
    fireEvent.click(chip(BETA));
    expect(chip(ALPHA)).toHaveAttribute("aria-pressed", "true");
    expect(chip(BETA)).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip(ALPHA));
    expect(chip(ALPHA)).toHaveAttribute("aria-pressed", "false");
    expect(chip(BETA)).toHaveAttribute("aria-pressed", "true");
  });

  it("marks the group with data-multiple when multiple is set", () => {
    renderGroup({ multiple: true });
    expect(group()).toHaveAttribute("data-multiple");
  });

  it("honours defaultValue as the initial pressed set", () => {
    renderGroup({ defaultValue: ["b"] });
    expect(chip(ALPHA)).toHaveAttribute("aria-pressed", "false");
    expect(chip(BETA)).toHaveAttribute("aria-pressed", "true");
  });

  it("reports the next group value through onValueChange", () => {
    const onValueChange = vi.fn();
    renderGroup({ defaultValue: ["a"], multiple: true, onValueChange });
    fireEvent.click(chip(BETA));
    expect(onValueChange).toHaveBeenCalledWith(["a", "b"], expect.anything());
  });

  it("leaves rendering to the controlled value prop", () => {
    const onValueChange = vi.fn();
    renderGroup({ value: ["a"], onValueChange });
    fireEvent.click(chip(BETA));
    expect(onValueChange).toHaveBeenCalledWith(["b"], expect.anything());
    // Controlled: without a value update the pressed set must not move.
    expect(chip(ALPHA)).toHaveAttribute("aria-pressed", "true");
    expect(chip(BETA)).toHaveAttribute("aria-pressed", "false");
  });

  it("supports a fully controlled harness", () => {
    function Harness() {
      const [value, setValue] = useState<readonly string[]>(["a"]);
      return (
        <ToggleGroup.Root
          aria-label={GROUP_LABEL}
          value={value}
          onValueChange={(next) => setValue(next)}
        >
          {CHIPS.map(([v, label]) => (
            <ToggleGroup.Toggle key={v} value={v}>
              {label}
            </ToggleGroup.Toggle>
          ))}
        </ToggleGroup.Root>
      );
    }
    render(<Harness />);
    fireEvent.click(chip(BETA));
    expect(chip(ALPHA)).toHaveAttribute("aria-pressed", "false");
    expect(chip(BETA)).toHaveAttribute("aria-pressed", "true");
  });

  it("roves focus with the arrow keys", async () => {
    renderGroup({});
    // Programmatic focus must be flushed through act() so the composite's
    // roving index tracks the focused item before the keydown lands.
    act(() => chip(ALPHA).focus());
    fireEvent.keyDown(chip(ALPHA), { key: "ArrowRight" });
    // Base UI's composite moves focus inside a queued microtask.
    await waitFor(() => expect(chip(BETA)).toHaveFocus());
    fireEvent.keyDown(chip(BETA), { key: "ArrowRight" });
    await waitFor(() => expect(chip(GAMMA)).toHaveFocus());
    fireEvent.keyDown(chip(GAMMA), { key: "ArrowLeft" });
    await waitFor(() => expect(chip(BETA)).toHaveFocus());
  });

  it("loops focus back to the first toggle from the last", async () => {
    renderGroup({});
    act(() => chip(GAMMA).focus());
    fireEvent.keyDown(chip(GAMMA), { key: "ArrowRight" });
    await waitFor(() => expect(chip(ALPHA)).toHaveFocus());
  });

  it("applies the chip recipe to toggles", () => {
    renderGroup({});
    expect(chip(ALPHA)).toHaveClass(
      "rounded-md",
      "border",
      "border-border",
      "px-3",
      "py-2",
      "text-sm",
      "text-text",
      "data-[pressed]:bg-primary",
      "data-[pressed]:text-on-primary",
      ...FOCUS_RING.split(" "),
    );
  });

  it("lays out the root as a flex row", () => {
    renderGroup({});
    expect(group()).toHaveClass("flex", "items-center");
  });

  it("merges a caller className over the toggle recipe", () => {
    renderGroup({});
    render(<Toggle className="w-full px-4">{STANDALONE_LABEL}</Toggle>);
    const el = chip(STANDALONE_LABEL);
    expect(el).toHaveClass("w-full", "px-4", "rounded-md");
    expect(el).not.toHaveClass("px-3");
  });

  it("merges a caller className on the root", () => {
    renderGroup({ className: "gap-1.5" });
    expect(group()).toHaveClass("gap-1.5", "flex");
  });

  it("supports a Base UI state-callback className on toggles", () => {
    render(
      <ToggleGroup.Root aria-label={GROUP_LABEL} defaultValue={["a"]}>
        <ToggleGroup.Toggle
          value="a"
          className={(state) => (state.pressed ? "ring-1" : undefined)}
        >
          {ALPHA}
        </ToggleGroup.Toggle>
      </ToggleGroup.Root>,
    );
    expect(chip(ALPHA)).toHaveClass("ring-1", "rounded-md");
  });

  it("forwards ref to the root and the toggle button", () => {
    const groupRef = createRef<HTMLDivElement>();
    const toggleRef = createRef<HTMLButtonElement>();
    render(
      <ToggleGroup.Root ref={groupRef} aria-label={GROUP_LABEL}>
        <ToggleGroup.Toggle ref={toggleRef} value="a">
          {ALPHA}
        </ToggleGroup.Toggle>
      </ToggleGroup.Root>,
    );
    expect(groupRef.current).toBe(group());
    expect(toggleRef.current).toBe(chip(ALPHA));
  });

  it("disables every toggle when the group is disabled", () => {
    const onValueChange = vi.fn();
    renderGroup({ disabled: true, onValueChange });
    for (const [, label] of CHIPS) {
      expect(chip(label)).toBeDisabled();
    }
    fireEvent.click(chip(ALPHA));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(chip(ALPHA)).toHaveAttribute("aria-pressed", "false");
  });
});

describe("Toggle", () => {
  it("toggles standalone outside a group", () => {
    const onPressedChange = vi.fn();
    render(
      <Toggle onPressedChange={onPressedChange}>{STANDALONE_LABEL}</Toggle>,
    );
    const el = chip(STANDALONE_LABEL);
    fireEvent.click(el);
    expect(onPressedChange).toHaveBeenCalledWith(true, expect.anything());
    expect(el).toHaveAttribute("aria-pressed", "true");
  });

  it("honours defaultPressed", () => {
    render(<Toggle defaultPressed>{STANDALONE_LABEL}</Toggle>);
    expect(chip(STANDALONE_LABEL)).toHaveAttribute("aria-pressed", "true");
  });
});
