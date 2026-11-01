import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { RadioGroup } from "./RadioGroup";
import { FOCUS_RING } from "./styles";

import type { RadioGroupRootProps } from "./RadioGroup";

const ALPHA = "Alpha";
const BETA = "Beta";
const GAMMA = "Gamma";
const GROUP_LABEL = "Pick one";
const DOT_A = "dot-a";
const DOT_B = "dot-b";

const OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["a", ALPHA],
  ["b", BETA],
  ["c", GAMMA],
];

const group = () => screen.getByRole("radiogroup", { name: GROUP_LABEL });
const radio = (name: string) => screen.getByRole("radio", { name });

function renderGroup({
  options = OPTIONS,
  ...props
}: RadioGroupRootProps & {
  options?: ReadonlyArray<readonly [string, string]>;
}) {
  return render(
    <RadioGroup.Root aria-label={GROUP_LABEL} {...props}>
      {options.map(([value, label]) => (
        <RadioGroup.Radio key={value} value={value}>
          {label}
        </RadioGroup.Radio>
      ))}
    </RadioGroup.Root>,
  );
}

describe("RadioGroup", () => {
  it("exposes a labelled radiogroup whose options are named radios", () => {
    renderGroup({});
    expect(group()).toBeInTheDocument();
    for (const [, label] of OPTIONS) {
      expect(radio(label)).toBeInTheDocument();
    }
  });

  it("checks a radio on click and keeps the group exclusive", () => {
    renderGroup({});
    fireEvent.click(radio(ALPHA));
    expect(radio(ALPHA)).toHaveAttribute("aria-checked", "true");
    fireEvent.click(radio(BETA));
    expect(radio(ALPHA)).toHaveAttribute("aria-checked", "false");
    expect(radio(BETA)).toHaveAttribute("aria-checked", "true");
    expect(radio(GAMMA)).toHaveAttribute("aria-checked", "false");
  });

  it("honours defaultValue as the initial checked radio", () => {
    renderGroup({ defaultValue: "b" });
    expect(radio(ALPHA)).toHaveAttribute("aria-checked", "false");
    expect(radio(BETA)).toHaveAttribute("aria-checked", "true");
  });

  it("reports the next value through onValueChange", () => {
    const onValueChange = vi.fn();
    renderGroup({ onValueChange });
    fireEvent.click(radio(BETA));
    expect(onValueChange).toHaveBeenCalledWith("b", expect.anything());
  });

  it("leaves rendering to the controlled value prop", () => {
    const onValueChange = vi.fn();
    renderGroup({ value: "a", onValueChange });
    fireEvent.click(radio(BETA));
    expect(onValueChange).toHaveBeenCalledWith("b", expect.anything());
    // Controlled: without a value update the checked radio must not move.
    expect(radio(ALPHA)).toHaveAttribute("aria-checked", "true");
    expect(radio(BETA)).toHaveAttribute("aria-checked", "false");
  });

  it("supports a fully controlled harness", () => {
    function Harness() {
      const [value, setValue] = useState("a");
      return (
        <RadioGroup.Root
          aria-label={GROUP_LABEL}
          value={value}
          onValueChange={setValue}
        >
          {OPTIONS.map(([v, label]) => (
            <RadioGroup.Radio key={v} value={v}>
              {label}
            </RadioGroup.Radio>
          ))}
        </RadioGroup.Root>
      );
    }
    render(<Harness />);
    fireEvent.click(radio(BETA));
    expect(radio(ALPHA)).toHaveAttribute("aria-checked", "false");
    expect(radio(BETA)).toHaveAttribute("aria-checked", "true");
  });

  it("roves focus with the arrow keys and checks the focused radio", async () => {
    renderGroup({ defaultValue: "a" });
    // Programmatic focus must be flushed through act() so the composite's
    // roving index tracks the focused item before the keydown lands.
    act(() => radio(ALPHA).focus());
    fireEvent.keyDown(radio(ALPHA), { key: "ArrowRight" });
    // Base UI's composite moves focus inside a queued microtask; standard
    // radio-group behaviour also selects the radio that gains focus.
    await waitFor(() => expect(radio(BETA)).toHaveFocus());
    await waitFor(() =>
      expect(radio(BETA)).toHaveAttribute("aria-checked", "true"),
    );
    fireEvent.keyDown(radio(BETA), { key: "ArrowRight" });
    await waitFor(() => expect(radio(GAMMA)).toHaveFocus());
    fireEvent.keyDown(radio(GAMMA), { key: "ArrowLeft" });
    await waitFor(() => expect(radio(BETA)).toHaveFocus());
  });

  it("ignores clicks on a disabled radio", () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup.Root aria-label={GROUP_LABEL} onValueChange={onValueChange}>
        <RadioGroup.Radio value="a">{ALPHA}</RadioGroup.Radio>
        <RadioGroup.Radio value="b" disabled>
          {BETA}
        </RadioGroup.Radio>
      </RadioGroup.Root>,
    );
    const disabledRadio = radio(BETA);
    expect(disabledRadio).toHaveAttribute("data-disabled");
    expect(disabledRadio).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(disabledRadio);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(disabledRadio).toHaveAttribute("aria-checked", "false");
  });

  it("disables every radio when the group is disabled", () => {
    const onValueChange = vi.fn();
    renderGroup({ disabled: true, onValueChange });
    for (const [, label] of OPTIONS) {
      expect(radio(label)).toHaveAttribute("aria-disabled", "true");
    }
    fireEvent.click(radio(ALPHA));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(radio(ALPHA)).toHaveAttribute("aria-checked", "false");
  });

  it("applies the base recipe to radios", () => {
    renderGroup({});
    expect(radio(ALPHA)).toHaveClass(
      "cursor-pointer",
      "select-none",
      "transition-colors",
      "data-[disabled]:opacity-50",
      ...FOCUS_RING.split(" "),
    );
  });

  it("lays out the root as a flex row", () => {
    renderGroup({});
    expect(group()).toHaveClass("flex", "items-center");
  });

  it("merges a caller className over the radio recipe", () => {
    render(
      <RadioGroup.Root aria-label={GROUP_LABEL}>
        <RadioGroup.Radio value="a" className="flex-1 cursor-default">
          {ALPHA}
        </RadioGroup.Radio>
      </RadioGroup.Root>,
    );
    const el = radio(ALPHA);
    expect(el).toHaveClass("flex-1", "cursor-default", "select-none");
    expect(el).not.toHaveClass("cursor-pointer");
  });

  it("merges a caller className on the root", () => {
    renderGroup({ className: "gap-1.5 flex-col" });
    expect(group()).toHaveClass("gap-1.5", "flex-col", "flex");
  });

  it("supports a Base UI state-callback className on radios", () => {
    render(
      <RadioGroup.Root aria-label={GROUP_LABEL} defaultValue="a">
        <RadioGroup.Radio
          value="a"
          className={(state) => (state.checked ? "ring-1" : undefined)}
        >
          {ALPHA}
        </RadioGroup.Radio>
      </RadioGroup.Root>,
    );
    expect(radio(ALPHA)).toHaveClass("ring-1", "select-none");
  });

  it("forwards ref to the root and the radio", () => {
    const groupRef = createRef<HTMLDivElement>();
    const radioRef = createRef<HTMLElement>();
    render(
      <RadioGroup.Root ref={groupRef} aria-label={GROUP_LABEL}>
        <RadioGroup.Radio ref={radioRef} value="a">
          {ALPHA}
        </RadioGroup.Radio>
      </RadioGroup.Root>,
    );
    expect(groupRef.current).toBe(group());
    expect(radioRef.current).toBe(radio(ALPHA));
  });
});

describe("RadioGroup.RadioIndicator", () => {
  it("renders only inside the checked radio", () => {
    render(
      <RadioGroup.Root aria-label={GROUP_LABEL} defaultValue="a">
        <RadioGroup.Radio value="a">
          {ALPHA}
          <RadioGroup.RadioIndicator data-testid={DOT_A} />
        </RadioGroup.Radio>
        <RadioGroup.Radio value="b">
          {BETA}
          <RadioGroup.RadioIndicator data-testid={DOT_B} />
        </RadioGroup.Radio>
      </RadioGroup.Root>,
    );
    expect(screen.getByTestId(DOT_A)).toBeInTheDocument();
    expect(screen.queryByTestId(DOT_B)).not.toBeInTheDocument();
  });
});
