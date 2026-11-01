import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Weekday } from "@/lib/enums";
import {
  CALENDAR_NEXT_LABEL,
  CALENDAR_PREVIOUS_LABEL,
  weekdaysFrom,
} from "@/lib/labels";
import { WeekJumpCalendar } from "@/features/board/WeekJumpCalendar";
import { monthCells, monthOfIso, shiftMonth } from "@/lib/calendar";
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

  it("picks a future-week day and reports its iso date", () => {
    renderCalendar();
    const future = weekDates(shiftDays(todayIso, 7), Weekday.Monday);
    fireEvent.click(
      screen.getByRole("button", { name: formatIsoDay(future[0]) }),
    );
    expect(onPick).toHaveBeenCalledWith(future[0]);
  });

  it("marks every day of the viewed week as the selected band", () => {
    renderCalendar();
    for (const iso of days) {
      expect(
        screen.getByRole("button", { name: formatIsoDay(iso) }).className,
      ).toContain("bg-primary/20");
    }
    // A rendered in-month day outside the selected week — derived from the
    // displayed grid so the assertion holds across month boundaries.
    const outside = monthCells(monthOfIso(todayIso), Weekday.Monday).find(
      (c) => c.inMonth && !days.includes(c.iso),
    )!.iso;
    expect(
      screen.getByRole("button", { name: formatIsoDay(outside) }).className,
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

  it("navigates months in both directions", () => {
    renderCalendar();
    const next = screen.getByRole("button", { name: CALENDAR_NEXT_LABEL });
    expect(next).toBeEnabled();
    fireEvent.click(next);
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
    // Any day inside the displayed (previous) month — derived from the
    // grid rather than a fixed offset so it stays valid at month edges.
    const older = monthCells(
      shiftMonth(monthOfIso(todayIso), -1),
      Weekday.Monday,
    ).find((c) => c.inMonth)!.iso;
    fireEvent.click(screen.getByRole("button", { name: formatIsoDay(older) }));
    expect(onPick).toHaveBeenCalledWith(older);
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

  it("highlights a picked future week as a band", () => {
    const future = weekDates(shiftDays(days[0], 14), Weekday.Monday);
    renderCalendar({ anchorIso: future[0] });
    for (const iso of future) {
      expect(
        screen.getByRole("button", { name: formatIsoDay(iso) }).className,
      ).toContain("bg-primary/20");
    }
  });
});
