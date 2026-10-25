import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Weekday } from "@/lib/enums";
import {
  CALENDAR_NEXT_LABEL,
  CALENDAR_PREVIOUS_LABEL,
  weekdaysFrom,
} from "@/lib/labels";
import { WeekJumpCalendar } from "@/features/board/WeekJumpCalendar";
import { formatIsoDay, shiftDays, todayLocalIso, weekDates } from "@/lib/utils";

const todayIso = todayLocalIso();
const days = weekDates(todayIso, Weekday.Monday);
const onPick = vi.fn();

const renderCalendar = (
  props?: Partial<Parameters<typeof WeekJumpCalendar>[0]>,
) =>
  render(
    <WeekJumpCalendar
      anchorIso={todayIso}
      weekStart={Weekday.Monday}
      onPick={onPick}
      {...props}
    />,
  );

beforeEach(() => {
  onPick.mockClear();
});

describe("WeekJumpCalendar", () => {
  it("picks an enabled day and reports its iso date", () => {
    renderCalendar();
    fireEvent.click(
      screen.getByRole("button", { name: formatIsoDay(days[0]) }),
    );
    expect(onPick).toHaveBeenCalledWith(days[0]);
  });

  it("does not call onPick for a disabled future-week day", () => {
    renderCalendar();
    const future = weekDates(shiftDays(todayIso, 7), Weekday.Monday);
    const cell = screen.getByRole("button", { name: formatIsoDay(future[0]) });
    expect(cell).toBeDisabled();
    fireEvent.click(cell);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("marks every day of the viewed week as the selected band", () => {
    renderCalendar();
    for (const iso of days) {
      expect(
        screen.getByRole("button", { name: formatIsoDay(iso) }).className,
      ).toContain("bg-primary/20");
    }
    const other = weekDates(shiftDays(days[0], -7), Weekday.Monday);
    expect(
      screen.getByRole("button", { name: formatIsoDay(other[0]) }).className,
    ).not.toContain("bg-primary/20");
  });

  it("shows the marker only on today", () => {
    renderCalendar();
    const today = screen.getByRole("button", { name: formatIsoDay(todayIso) });
    expect(today.querySelector("span")).not.toBeNull();
    if (!days.includes(todayIso)) return;
    const notToday = screen.getByRole("button", {
      name: formatIsoDay(shiftDays(todayIso, -1)),
    });
    expect(notToday.querySelector("span")).toBeNull();
  });

  it("moves the highlight band to the week a new anchor lands in", () => {
    const twoWeeksAgo = weekDates(shiftDays(days[0], -14), Weekday.Monday);
    renderCalendar({ anchorIso: twoWeeksAgo[3] });
    for (const iso of twoWeeksAgo) {
      expect(
        screen.getByRole("button", { name: formatIsoDay(iso) }).className,
      ).toContain("bg-primary/20");
    }
    expect(
      screen.getByRole("button", { name: formatIsoDay(days[0]) }).className,
    ).not.toContain("bg-primary/20");
  });

  it("disables next-month navigation on the current month but allows going back", () => {
    renderCalendar();
    const next = screen.getByRole("button", { name: CALENDAR_NEXT_LABEL });
    expect(next).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: CALENDAR_PREVIOUS_LABEL }),
    );
    expect(
      screen.getByRole("button", { name: CALENDAR_NEXT_LABEL }),
    ).toBeEnabled();
  });

  it("picks a day from an older month after navigating back", () => {
    renderCalendar();
    fireEvent.click(
      screen.getByRole("button", { name: CALENDAR_PREVIOUS_LABEL }),
    );
    const older = weekDates(shiftDays(days[0], -35), Weekday.Monday);
    fireEvent.click(
      screen.getByRole("button", { name: formatIsoDay(older[0]) }),
    );
    expect(onPick).toHaveBeenCalledWith(older[0]);
  });

  it("orders the weekday header from the configured week start", () => {
    renderCalendar({ weekStart: Weekday.Wednesday });
    const headers = screen
      .getAllByText(/^(Mo|Tu|We|Th|Fr|Sa|Su)$/)
      .filter((e) => e.tagName === "SPAN")
      .map((e) => e.textContent);
    const expected = weekdaysFrom(Weekday.Wednesday).map((w) =>
      w.label.slice(0, 2),
    );
    expect(headers.slice(0, 7)).toEqual(expected);
  });

  it("gates future days by the configured week, not by the raw date", () => {
    // With a Saturday week start, this week's "last day" can already
    // sit on a later weekday than with a Monday start — the day is
    // still pickable because its week is not a future one.
    renderCalendar({ weekStart: Weekday.Saturday });
    const today = screen.getByRole("button", { name: formatIsoDay(todayIso) });
    expect(today).toBeEnabled();
  });
});
