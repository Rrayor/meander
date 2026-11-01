import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { monthLabel, monthOfIso } from "@/lib/calendar";
import { Weekday } from "@/lib/enums";
import { formatIsoDay, todayLocalIso } from "@/lib/utils";

import { MonthCalendar } from "./MonthCalendar";

// November 2026 opens on a Sunday: a Monday-start grid pads with
// 2026-10-26…31 while a Sunday-start grid begins on the 1st itself.
const MONTH = new Date(Date.UTC(2026, 10, 1));
const NEXT_MONTH = new Date(Date.UTC(2026, 11, 1));
const MONTH_LABEL = monthLabel(2026, 10);
const IN_MONTH_ISO = "2026-11-16"; // a Monday
const PAD_ISO = "2026-10-26"; // leading padding cell, Monday-start
const OTHER_ISO = "2026-11-17";
const FALLBACK_ISO = "2026-11-18";

const HEADER_SHORTS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

// A cell inside the grid that is guaranteed neither marked nor today —
// today may land inside the displayed window on some runs.
const TODAY_ISO = todayLocalIso();
const UNMARKED_ISO = OTHER_ISO === TODAY_ISO ? FALLBACK_ISO : OTHER_ISO;

const day = (iso: string) =>
  screen.getByRole("button", { name: formatIsoDay(iso) });
// The marker dot is the only span inside a day cell.
const markerOf = (iso: string) => day(iso).querySelector("span");

function renderCalendar({
  month = MONTH,
  weekStart = Weekday.Monday,
  onSelect = vi.fn(),
  onMonthShift = vi.fn(),
  navLabels = { previous: "back", next: "forward" },
  ...rest
}: Partial<Parameters<typeof MonthCalendar>[0]> = {}) {
  return render(
    <MonthCalendar
      month={month}
      weekStart={weekStart}
      onSelect={onSelect}
      onMonthShift={onMonthShift}
      navLabels={navLabels}
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
    expect(day(PAD_ISO)).toHaveClass("text-text-muted");
    expect(day(IN_MONTH_ISO)).not.toHaveClass("text-text-muted");
  });

  it("shifts the month through onMonthShift", () => {
    const onMonthShift = vi.fn();
    renderCalendar({ onMonthShift });
    fireEvent.click(screen.getByRole("button", { name: "back" }));
    expect(onMonthShift).toHaveBeenCalledWith(-1);
    fireEvent.click(screen.getByRole("button", { name: "forward" }));
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

  it("marks selectedDate with aria-current and the soft highlight", () => {
    renderCalendar({ selectedDate: IN_MONTH_ISO });
    expect(day(IN_MONTH_ISO)).toHaveAttribute("aria-current", "date");
    expect(day(IN_MONTH_ISO)).toHaveClass("bg-primary/20");
    expect(day(UNMARKED_ISO)).not.toHaveAttribute("aria-current");
    expect(day(UNMARKED_ISO)).not.toHaveClass("bg-primary/20");
  });

  it("renders the dot on markedDates cells only", () => {
    renderCalendar({ markedDates: new Set([IN_MONTH_ISO]) });
    const marked = markerOf(IN_MONTH_ISO);
    expect(marked).toHaveClass("bg-primary");
    expect(marked).toHaveAttribute("aria-hidden", "true");
    expect(markerOf(UNMARKED_ISO)).toBeNull();
  });

  it("marks today's cell with the same dot", () => {
    renderCalendar({ month: new Date(monthOfIso(TODAY_ISO)) });
    const dot = markerOf(TODAY_ISO);
    expect(dot).toHaveClass("bg-primary");
    expect(dot).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps the primary dot on a marked selected date", () => {
    renderCalendar({
      selectedDate: IN_MONTH_ISO,
      markedDates: new Set([IN_MONTH_ISO]),
    });
    expect(markerOf(IN_MONTH_ISO)).toHaveClass("bg-primary");
  });

  it("lets callers restyle cells through dayClassName state", () => {
    renderCalendar({
      markedDates: new Set([IN_MONTH_ISO]),
      dayClassName: (cell, state) =>
        state.marked
          ? "font-semibold"
          : cell.iso === UNMARKED_ISO && !state.today
            ? "italic"
            : "",
    });
    expect(day(IN_MONTH_ISO)).toHaveClass("font-semibold");
    expect(day(UNMARKED_ISO)).toHaveClass("italic");
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
        navLabels={{ previous: "back", next: "forward" }}
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
