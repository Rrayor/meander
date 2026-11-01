import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { FIELD_SURFACE, FOCUS_RING } from "./styles";
import { Textarea } from "./Textarea";

const NAME = "Description";

const textarea = () => screen.getByRole("textbox", { name: NAME });

describe("Textarea", () => {
  it("renders a textbox exposing its accessible name", () => {
    render(<Textarea aria-label={NAME} />);
    expect(textarea()).toBeInTheDocument();
  });

  it("applies the shared field surface and focus ring", () => {
    render(<Textarea aria-label={NAME} />);
    expect(textarea()).toHaveClass(
      ...FIELD_SURFACE.split(" "),
      ...FOCUS_RING.split(" "),
    );
  });

  it("blocks manual resize by default", () => {
    render(<Textarea aria-label={NAME} />);
    expect(textarea()).toHaveClass("resize-none");
  });

  it("styles the invalid state from aria and data markers", () => {
    render(<Textarea aria-label={NAME} />);
    expect(textarea()).toHaveClass(
      "aria-[invalid=true]:border-danger",
      "data-[invalid]:border-danger",
    );
  });

  it("lets a caller className override conflicting recipe classes", () => {
    render(<Textarea aria-label={NAME} className="resize-y" />);
    const el = textarea();
    expect(el).toHaveClass("resize-y");
    expect(el).not.toHaveClass("resize-none");
  });

  it("forwards ref to the underlying textarea element", () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea aria-label={NAME} ref={ref} />);
    expect(ref.current).toBe(textarea());
  });

  it("passes native textarea attributes through", () => {
    render(<Textarea aria-label={NAME} rows={3} disabled />);
    const el = textarea();
    expect(el).toHaveAttribute("rows", "3");
    expect(el).toBeDisabled();
  });
});
