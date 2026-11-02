import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Weekday } from "@/lib/enums";

import { WeekdayPicker } from "./WeekdayPicker";

const GROUP_LABEL = "Days that count";

const MON = "Monday";
const TUE = "Tuesday";
const FRI = "Friday";

const MONDAY_FIRST: readonly Weekday[] = [
  Weekday.Monday,
  Weekday.Tuesday,
  Weekday.Wednesday,
  Weekday.Thursday,
  Weekday.Friday,
  Weekday.Saturday,
  Weekday.Sunday,
];

const SUNDAY_FIRST: readonly Weekday[] = [
  Weekday.Sunday,
  Weekday.Monday,
  Weekday.Tuesday,
  Weekday.Wednesday,
  Weekday.Thursday,
  Weekday.Friday,
  Weekday.Saturday,
];

const chip = (name: string) => screen.getByRole("button", { name });
const group = () => screen.getByRole("group", { name: GROUP_LABEL });

function renderPicker({
  value = [],
  onChange = vi.fn(),
  order = MONDAY_FIRST,
  ...rest
}: Partial<Parameters<typeof WeekdayPicker>[0]>) {
  return render(
    <WeekdayPicker
      aria-label={GROUP_LABEL}
      value={value}
      onChange={onChange}
      order={order}
      {...rest}
    />,
  );
}

describe("WeekdayPicker", () => {
  it("renders one chip per day in order sequence", () => {
    renderPicker({ order: SUNDAY_FIRST });
    expect(group()).toBeInTheDocument();
    const chips = screen.getAllByRole("button");
    expect(chips).toHaveLength(SUNDAY_FIRST.length);
    // Sunday-first order — the week-start rotation is caller-supplied.
    expect(chips.map((el) => el.textContent)).toEqual([
      "Su",
      "Mo",
      "Tu",
      "We",
      "Th",
      "Fr",
      "Sa",
    ]);
  });

  it("names each chip with the full day label, showing the short text", () => {
    renderPicker({ order: [Weekday.Monday] });
    const el = chip(MON);
    expect(el).toHaveAttribute("aria-label", MON);
    expect(el).toHaveTextContent("Mo");
  });

  it("mirrors the selection onto aria-pressed", () => {
    renderPicker({ value: [Weekday.Monday, Weekday.Friday] });
    expect(chip(MON)).toHaveAttribute("aria-pressed", "true");
    expect(chip(TUE)).toHaveAttribute("aria-pressed", "false");
    expect(chip(FRI)).toHaveAttribute("aria-pressed", "true");
  });

  it("reports the added day through onChange in order sequence", () => {
    const onChange = vi.fn();
    renderPicker({
      value: [Weekday.Friday],
      onChange,
      order: [Weekday.Friday, Weekday.Monday, Weekday.Tuesday],
    });
    fireEvent.click(chip(MON));
    // The emitted array follows `order`, not click order — WorkDaysSection
    // persists in canonical sequence.
    expect(onChange).toHaveBeenCalledWith([Weekday.Friday, Weekday.Monday]);
  });

  it("reports the deselected day removed through onChange", () => {
    const onChange = vi.fn();
    renderPicker({ value: [Weekday.Monday, Weekday.Tuesday], onChange });
    fireEvent.click(chip(MON));
    expect(onChange).toHaveBeenCalledWith([Weekday.Tuesday]);
  });

  it("blocks the deselect that would drop below minSelected", () => {
    const onChange = vi.fn();
    renderPicker({ value: [Weekday.Monday], onChange, minSelected: 1 });
    fireEvent.click(chip(MON));
    expect(onChange).not.toHaveBeenCalled();
    // Controlled: the chip stays pressed because value never moved.
    expect(chip(MON)).toHaveAttribute("aria-pressed", "true");
  });

  it("still allows deselects down to minSelected", () => {
    const onChange = vi.fn();
    renderPicker({
      value: [Weekday.Monday, Weekday.Tuesday],
      onChange,
      minSelected: 1,
    });
    fireEvent.click(chip(TUE));
    expect(onChange).toHaveBeenCalledWith([Weekday.Monday]);
  });

  it("still allows selecting while sitting at minSelected", () => {
    const onChange = vi.fn();
    renderPicker({ value: [Weekday.Monday], onChange, minSelected: 1 });
    fireEvent.click(chip(TUE));
    expect(onChange).toHaveBeenCalledWith([Weekday.Monday, Weekday.Tuesday]);
  });

  it("supports a fully controlled harness", () => {
    function Harness() {
      const [value, setValue] = useState<readonly Weekday[]>([Weekday.Monday]);
      return (
        <WeekdayPicker
          aria-label={GROUP_LABEL}
          value={value}
          onChange={setValue}
          order={MONDAY_FIRST}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(chip(TUE));
    expect(chip(TUE)).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip(TUE));
    expect(chip(TUE)).toHaveAttribute("aria-pressed", "false");
    expect(chip(MON)).toHaveAttribute("aria-pressed", "true");
  });

  it("disables every chip when disabled", () => {
    const onChange = vi.fn();
    renderPicker({ value: [Weekday.Monday], onChange, disabled: true });
    for (const el of screen.getAllByRole("button")) {
      expect(el).toBeDisabled();
    }
    fireEvent.click(chip(TUE));
    expect(onChange).not.toHaveBeenCalled();
    expect(chip(TUE)).toHaveAttribute("aria-pressed", "false");
  });

  it("takes chip text from formatDay when supplied", () => {
    const dayAriaLabel = (d: Weekday) => `pick-${d}`;
    renderPicker({
      order: [Weekday.Monday],
      formatDay: (d) => ({ label: dayAriaLabel(d), short: "1" }),
    });
    const el = chip(dayAriaLabel(Weekday.Monday));
    expect(el).toHaveTextContent("1");
  });

  it("merges a caller className on the group", () => {
    renderPicker({ className: "gap-1.5" });
    expect(group()).toHaveClass("gap-1.5", "flex");
  });
});
