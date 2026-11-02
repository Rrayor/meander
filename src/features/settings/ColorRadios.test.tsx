import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CUSTOM_COLOR_LABEL, CUSTOM_COLOR_PICKER_LABEL } from "@/lib/labels";

import { ColorRadios } from "./ColorRadios";

const GROUP_LABEL = "Threshold color";
const OFF_PALETTE = "#123456";

describe("ColorRadios", () => {
  it("reopens the picker when Space re-activates the selected custom swatch", () => {
    render(
      <ColorRadios
        label={GROUP_LABEL}
        value={OFF_PALETTE}
        onChange={vi.fn()}
      />,
    );
    const input = screen.getByLabelText(CUSTOM_COLOR_PICKER_LABEL);
    const click = vi.spyOn(input, "click");
    fireEvent.keyDown(screen.getByRole("radio", { name: CUSTOM_COLOR_LABEL }), {
      key: " ",
    });
    expect(click).toHaveBeenCalledTimes(1);
  });
});
