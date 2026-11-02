import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MonthMode, Weekday } from "@/lib/enums";
import { REPEAT_NTH_OPTIONS, WEEKDAY_OPTIONS } from "@/lib/labels";

import { MonthlySection } from "./MonthlySection";

const PROPS = {
  idPrefix: "t",
  monthMode: MonthMode.Day,
  day: 15,
  nth: 1,
  weekday: Weekday.Monday,
  order: WEEKDAY_OPTIONS,
};

describe("MonthlySection", () => {
  it("patches weekday mode when a different nth chip is clicked", () => {
    const onPatch = vi.fn();
    render(
      <MonthlySection {...PROPS} onModeChange={vi.fn()} onPatch={onPatch} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: REPEAT_NTH_OPTIONS[1].aria }),
    );
    expect(onPatch).toHaveBeenCalledWith({
      monthMode: MonthMode.Weekday,
      nth: Number(REPEAT_NTH_OPTIONS[1].value),
    });
  });

  it("switches to weekday mode when the pressed nth chip is clicked on a day-mode schedule", () => {
    const onPatch = vi.fn();
    render(
      <MonthlySection {...PROPS} onModeChange={vi.fn()} onPatch={onPatch} />,
    );
    // The group's pressed member is the current nth — re-clicking it
    // reports an empty selection; it must still activate weekday mode.
    fireEvent.click(
      screen.getByRole("button", { name: REPEAT_NTH_OPTIONS[0].aria }),
    );
    expect(onPatch).toHaveBeenCalledWith({
      monthMode: MonthMode.Weekday,
      nth: PROPS.nth,
    });
  });

  it("swallows the deselect no-op on a weekday-mode schedule", () => {
    const onPatch = vi.fn();
    render(
      <MonthlySection
        {...PROPS}
        monthMode={MonthMode.Weekday}
        onModeChange={vi.fn()}
        onPatch={onPatch}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: REPEAT_NTH_OPTIONS[0].aria }),
    );
    expect(onPatch).not.toHaveBeenCalled();
  });
});
