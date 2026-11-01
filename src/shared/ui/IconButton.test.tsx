import { fireEvent, render, screen } from "@testing-library/react";
import { X } from "lucide-react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { ButtonVariant, ComponentSize } from "@/lib/enums";

import { IconButton } from "./IconButton";

const LABEL = "Close dialog";

const button = () => screen.getByRole("button", { name: LABEL });
const icon = () => button().querySelector("svg");

describe("IconButton", () => {
  it("exposes label as the accessible name", () => {
    render(<IconButton icon={X} label={LABEL} />);
    expect(button()).toBeInTheDocument();
  });

  it("renders the icon hidden from assistive technology", () => {
    render(<IconButton icon={X} label={LABEL} />);
    expect(icon()).toHaveAttribute("aria-hidden", "true");
  });

  it("defaults to type button so it never submits a form", () => {
    render(<IconButton icon={X} label={LABEL} />);
    expect(button()).toHaveAttribute("type", "button");
  });

  it("defaults to the ghost variant", () => {
    render(<IconButton icon={X} label={LABEL} />);
    const el = button();
    expect(el).toHaveClass("text-text-muted");
    expect(el).not.toHaveClass("bg-primary", "bg-danger", "border-border");
  });

  it("accepts another variant", () => {
    render(
      <IconButton icon={X} label={LABEL} variant={ButtonVariant.Danger} />,
    );
    expect(button()).toHaveClass("bg-danger", "text-on-primary");
  });

  it.each([
    [ComponentSize.Sm, "h-6 w-6", "14"],
    [ComponentSize.Md, "h-7 w-7", "16"],
  ])("renders size %s as a square icon box", (size, boxClass, iconSize) => {
    render(<IconButton icon={X} label={LABEL} size={size} />);
    const el = button();
    expect(el).toHaveClass(boxClass);
    // The square box replaces the text-button padding entirely.
    expect(el).not.toHaveClass("px-4", "px-3");
    expect(icon()).toHaveAttribute("width", iconSize);
  });

  it("merges a caller className on top of the recipe", () => {
    render(<IconButton icon={X} label={LABEL} className="shrink-0" />);
    expect(button()).toHaveClass("shrink-0", "text-text-muted");
  });

  it("forwards ref to the underlying button element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<IconButton icon={X} label={LABEL} ref={ref} />);
    expect(ref.current).toBe(button());
  });

  it("passes the disabled attribute through", () => {
    render(<IconButton icon={X} label={LABEL} disabled />);
    expect(button()).toBeDisabled();
  });

  it("invokes onClick", () => {
    const onClick = vi.fn();
    render(<IconButton icon={X} label={LABEL} onClick={onClick} />);
    fireEvent.click(button());
    expect(onClick).toHaveBeenCalledOnce();
  });
});
