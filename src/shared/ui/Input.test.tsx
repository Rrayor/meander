import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Input } from "./Input";
import { FIELD_SURFACE, FOCUS_RING } from "./styles";

const NAME = "Estimate";

const input = () => screen.getByRole("textbox", { name: NAME });

describe("Input", () => {
  it("renders a textbox exposing its accessible name", () => {
    render(<Input aria-label={NAME} />);
    expect(input()).toBeInTheDocument();
  });

  it("applies the shared field surface and focus ring", () => {
    render(<Input aria-label={NAME} />);
    expect(input()).toHaveClass(
      ...FIELD_SURFACE.split(" "),
      ...FOCUS_RING.split(" "),
    );
  });

  it("is full-width by default", () => {
    render(<Input aria-label={NAME} />);
    expect(input()).toHaveClass("w-full");
  });

  it("styles the invalid state from aria and data markers", () => {
    render(<Input aria-label={NAME} />);
    expect(input()).toHaveClass(
      "aria-[invalid=true]:border-danger",
      "data-[invalid]:border-danger",
    );
  });

  it("merges a caller className on top of the recipe", () => {
    render(<Input aria-label={NAME} className="mt-1" />);
    expect(input()).toHaveClass("mt-1", "border-border");
  });

  it("lets a caller className override the default width", () => {
    render(<Input aria-label={NAME} className="w-28" />);
    const el = input();
    expect(el).toHaveClass("w-28");
    expect(el).not.toHaveClass("w-full");
  });

  it("forwards ref to the underlying input element", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input aria-label={NAME} ref={ref} />);
    expect(ref.current).toBe(input());
  });

  it("passes native input attributes through", () => {
    render(
      <Input
        aria-label={NAME}
        type="number"
        placeholder="0"
        disabled
        aria-invalid
      />,
    );
    // type="number" exposes the spinbutton role — select by label here.
    const el = screen.getByLabelText(NAME);
    expect(el).toHaveAttribute("type", "number");
    expect(el).toHaveAttribute("placeholder", "0");
    expect(el).toBeDisabled();
    expect(el).toHaveAttribute("aria-invalid", "true");
  });
});
