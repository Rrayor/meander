import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { monthLabel } from "@/lib/calendar";
import { Weekday } from "@/lib/enums";
import { formatIsoDay } from "@/lib/utils";

import { MonthCalendar } from "./MonthCalendar";

// November 2026 opens on a Sunday: a Monday-start grid pads with
// 2026-10-26…31 while a Sunday-start grid begins on the 1st itself.
const MONTH = new Date(Date.UTC(2026, 10, 1));
const NEXT_MONTH = new Date(Date.UTC(2026, 11, 1));
const MONTH_LABEL = monthLabel(2026, 10);
const IN_MONTH_ISO = "2026-11-16"; // a Monday
const PAD_ISO = "2026-10-26"; // leading padding cell, Monday-start
const OTHER_ISO = "2026-11-17";

// The component's default nav copy mirrors CALENDAR_PREVIOUS_LABEL /
// CALENDAR_NEXT_LABEL; @/lib/labels is banned inside src/shared, so the
// expected copy is re-declared here rather than imported.
const PREVIOUS = "Previous month";
const NEXT = "Next month";

const HEADER_SHORTS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const day = (iso: string) =>
  screen.getByRole("button", { name: formatIsoDay(iso) });
// The marker row is the only span inside a day cell.
const markerOf = (iso: string) => day(iso).querySelector("span");

function renderCalendar({
  month = MONTH,
  weekStart = Weekday.Monday,
  onSelect = vi.fn(),
  onMonthShift = vi.fn(),
  ...rest
}: Partial<Parameters<typeof MonthCalendar>[0]> = {}) {
  return render(
    <MonthCalendar
      month={month}
      weekStart={weekStart}
      onSelect={onSelect}
      onMonthShift={onMonthShift}
      {...rest}
    />,
  );
}

describe("MonthCalendar", () => {
  it("renders the month label, weekday headers and a 42-cell grid", () => {
    renderCalendar();
    expect(screen.getByText(MONTH_LABEL)).toBeInTheDocument();
    const headers = screen.getAllByText(/^(Mo|Tu|We|Th|Fr|Sa|Su)$/);
    expect(headers.map((h) => h.textContent)).toEqual(HEADER_SHORTS);
    // 42 day cells plus the two nav buttons.
    expect(screen.getAllByRole("button")).toHaveLength(44);
  });

  it("labels every day cell with its formatted ISO date", () => {
    renderCalendar();
    expect(day(IN_MONTH_ISO)).toHaveTextContent("16");
    expect(day(PAD_ISO)).toHaveTextContent("26");
  });

  it("dims cells outside the displayed month", () => {
    renderCalendar();
    expect(day(PAD_ISO)).toHaveClass("opacity-50");
    expect(day(IN_MONTH_ISO)).not.toHaveClass("opacity-50");
  });

  it("shifts the month through onMonthShift", () => {
    const onMonthShift = vi.fn();
    renderCalendar({ onMonthShift });
    fireEvent.click(screen.getByRole("button", { name: PREVIOUS }));
    expect(onMonthShift).toHaveBeenCalledWith(-1);
    fireEvent.click(screen.getByRole("button", { name: NEXT }));
    expect(onMonthShift).toHaveBeenCalledWith(1);
  });

  it("uses caller-supplied nav labels", () => {
    renderCalendar({ navLabels: { previous: "back", next: "forward" } });
    expect(screen.getByRole("button", { name: "back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "forward" })).toBeInTheDocument();
  });

  it("reports the clicked date through onSelect", () => {
    const onSelect = vi.fn();
    renderCalendar({ onSelect });
    fireEvent.click(day(IN_MONTH_ISO));
    expect(onSelect).toHaveBeenCalledWith(IN_MONTH_ISO);
  });

  it("lets padding days from adjacent months fire onSelect", () => {
    const onSelect = vi.fn();
    renderCalendar({ onSelect });
    fireEvent.click(day(PAD_ISO));
    expect(onSelect).toHaveBeenCalledWith(PAD_ISO);
  });

  it("marks selectedDate with aria-current and the selected fill", () => {
    renderCalendar({ selectedDate: IN_MONTH_ISO });
    expect(day(IN_MONTH_ISO)).toHaveAttribute("aria-current", "date");
    expect(day(IN_MONTH_ISO)).toHaveClass("bg-primary", "text-on-primary");
    expect(day(OTHER_ISO)).not.toHaveAttribute("aria-current");
    expect(day(OTHER_ISO)).not.toHaveClass("bg-primary");
  });

  it("renders the marker dot on markedDates cells only", () => {
    renderCalendar({ markedDates: new Set([IN_MONTH_ISO]) });
    const marked = markerOf(IN_MONTH_ISO);
    expect(marked).toHaveClass("bg-primary");
    expect(marked).toHaveAttribute("aria-hidden", "true");
    expect(markerOf(OTHER_ISO)).toHaveClass("invisible");
  });

  it("inverts the marker on a marked selected date", () => {
    renderCalendar({
      selectedDate: IN_MONTH_ISO,
      markedDates: new Set([IN_MONTH_ISO]),
    });
    expect(markerOf(IN_MONTH_ISO)).toHaveClass("bg-on-primary");
  });

  it("rotates the weekday header row to weekStart", () => {
    renderCalendar({
      weekStart: Weekday.Sunday,
      formatDay: (d) => ({ label: d, short: d }),
    });
    const headers = screen.getAllByText(/day$/);
    expect(headers.map((h) => h.textContent)).toEqual([
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ]);
  });

  it("exposes the full weekday name as the header title", () => {
    renderCalendar({ formatDay: (d) => ({ label: `full-${d}`, short: d }) });
    expect(screen.getByText("monday")).toHaveAttribute("title", "full-monday");
  });

  it("follows the month prop when it changes", () => {
    const { rerender } = renderCalendar();
    rerender(
      <MonthCalendar
        month={NEXT_MONTH}
        weekStart={Weekday.Monday}
        onSelect={vi.fn()}
        onMonthShift={vi.fn()}
      />,
    );
    expect(screen.getByText(monthLabel(2026, 11))).toBeInTheDocument();
    expect(screen.queryByText(MONTH_LABEL)).not.toBeInTheDocument();
  });

  it("merges a caller className on the root", () => {
    const { container } = renderCalendar({ className: "w-72" });
    expect(container.firstElementChild).toHaveClass("w-72");
  });
});
