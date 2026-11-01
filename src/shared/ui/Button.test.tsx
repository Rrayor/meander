import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { ButtonVariant, ComponentSize } from "@/lib/enums";

import { Button } from "./Button";
import { FOCUS_RING } from "./styles";

const BUTTON_TEXT = "Save changes";

const button = () => screen.getByRole("button", { name: BUTTON_TEXT });

const VARIANT_CASES: Array<[ButtonVariant, string[]]> = [
  [ButtonVariant.Primary, ["bg-primary", "font-semibold", "text-on-primary"]],
  [
    ButtonVariant.Secondary,
    ["border", "border-border", "hover:bg-surface-raised"],
  ],
  [ButtonVariant.Danger, ["bg-danger", "text-on-primary"]],
  [
    ButtonVariant.Ghost,
    ["text-text-muted", "hover:bg-surface-raised", "hover:text-text"],
  ],
];

const SIZE_CASES: Array<[ComponentSize, string[]]> = [
  [ComponentSize.Sm, ["px-3", "py-1.5"]],
  [ComponentSize.Md, ["px-4", "py-2"]],
];

describe("Button", () => {
  it("renders its children as the accessible name", () => {
    render(<Button>{BUTTON_TEXT}</Button>);
    expect(button()).toBeInTheDocument();
  });

  it("defaults to the primary variant at medium size", () => {
    render(<Button>{BUTTON_TEXT}</Button>);
    expect(button()).toHaveClass(
      "rounded-md",
      "bg-primary",
      "font-semibold",
      "text-on-primary",
      "px-4",
      "py-2",
      ...FOCUS_RING.split(" "),
    );
  });

  it.each(VARIANT_CASES)("applies the %s variant recipe", (variant, tokens) => {
    render(<Button variant={variant}>{BUTTON_TEXT}</Button>);
    expect(button()).toHaveClass(...tokens);
  });

  it("gives the ghost variant no background or border", () => {
    render(<Button variant={ButtonVariant.Ghost}>{BUTTON_TEXT}</Button>);
    expect(button()).not.toHaveClass(
      "bg-primary",
      "bg-danger",
      "border",
      "border-border",
    );
  });

  it.each(SIZE_CASES)("applies the %s size recipe", (size, tokens) => {
    render(<Button size={size}>{BUTTON_TEXT}</Button>);
    expect(button()).toHaveClass(...tokens);
  });

  it("merges a caller className on top of the recipe", () => {
    render(<Button className="w-full">{BUTTON_TEXT}</Button>);
    expect(button()).toHaveClass("w-full", "bg-primary");
  });

  it("lets a caller className override conflicting recipe classes", () => {
    render(<Button className="bg-danger">{BUTTON_TEXT}</Button>);
    const el = button();
    expect(el).toHaveClass("bg-danger");
    expect(el).not.toHaveClass("bg-primary");
  });

  it("forwards ref to the underlying button element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>{BUTTON_TEXT}</Button>);
    expect(ref.current).toBe(button());
  });

  it("passes the disabled attribute through", () => {
    render(<Button disabled>{BUTTON_TEXT}</Button>);
    expect(button()).toBeDisabled();
  });

  it("passes the type attribute through", () => {
    render(<Button type="submit">{BUTTON_TEXT}</Button>);
    expect(button()).toHaveAttribute("type", "submit");
  });

  it("invokes onClick", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>{BUTTON_TEXT}</Button>);
    fireEvent.click(button());
    expect(onClick).toHaveBeenCalledOnce();
  });
});
