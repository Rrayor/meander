import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Fieldset } from "./Fieldset";

const GROUP_LABEL = "Save scope";
const CONTROL_LABEL = "Series";

function renderFieldset() {
  return render(
    <Fieldset.Root>
      <Fieldset.Legend>{GROUP_LABEL}</Fieldset.Legend>
      <label>
        <input type="radio" name="scope" />
        {CONTROL_LABEL}
      </label>
    </Fieldset.Root>,
  );
}

describe("Fieldset", () => {
  it("exposes the legend as the group's accessible name", () => {
    renderFieldset();
    expect(
      screen.getByRole("group", { name: GROUP_LABEL }),
    ).toBeInTheDocument();
  });

  it("groups the contained controls", () => {
    renderFieldset();
    const group = screen.getByRole("group", { name: GROUP_LABEL });
    expect(
      group.contains(screen.getByRole("radio", { name: CONTROL_LABEL })),
    ).toBe(true);
  });

  it("applies the muted legend recipe", () => {
    renderFieldset();
    expect(screen.getByText(GROUP_LABEL)).toHaveClass(
      "text-xs",
      "font-medium",
      "text-text-muted",
    );
  });

  it("merges a caller className onto root and legend", () => {
    render(
      <Fieldset.Root className="mt-4">
        <Fieldset.Legend className="sr-only">{GROUP_LABEL}</Fieldset.Legend>
      </Fieldset.Root>,
    );
    expect(screen.getByRole("group", { name: GROUP_LABEL })).toHaveClass(
      "mt-4",
    );
    expect(screen.getByText(GROUP_LABEL)).toHaveClass("sr-only");
  });

  it("forwards ref to the fieldset element", () => {
    const ref = createRef<HTMLFieldSetElement>();
    render(
      <Fieldset.Root ref={ref}>
        <Fieldset.Legend>{GROUP_LABEL}</Fieldset.Legend>
      </Fieldset.Root>,
    );
    expect(ref.current).toBe(screen.getByRole("group", { name: GROUP_LABEL }));
  });

  it("passes the disabled attribute through", () => {
    render(
      <Fieldset.Root disabled>
        <Fieldset.Legend>{GROUP_LABEL}</Fieldset.Legend>
      </Fieldset.Root>,
    );
    expect(screen.getByRole("group", { name: GROUP_LABEL })).toBeDisabled();
  });
});
