import { fireEvent, render, screen } from "@testing-library/react";

import type { Task, TaskSeries } from "@/api/bindings";
import { InstanceCalendar } from "@/features/tasks/InstanceCalendar";
import {
  CALENDAR_NEXT_LABEL,
  CALENDAR_PREVIOUS_LABEL,
  WEEKDAY_OPTIONS,
} from "@/lib/labels";

const series: TaskSeries = {
  id: 3,
  profile_id: 1,
  title: "Standup",
  description: null,
  carry_over_rule: "return",
  estimated_minutes: null,
  recurrence: {
    kind: "weekly",
    interval_weeks: 1,
    weekdays: ["monday"],
  },
  start_date: "2026-10-05",
  end_date: null,
  created_at: "2026-10-11 10:00:00",
  updated_at: "2026-10-11 10:00:00",
};

const instance = (iso: string): Task => ({
  id: 11,
  profile_id: 1,
  title: "Standup",
  description: null,
  status: "todo",
  carry_over_rule: "return",
  estimated_minutes: null,
  spent_minutes: null,
  placement: "scheduled",
  scheduled_date: iso,
  series_id: series.id,
  sort_order: 0,
  created_at: "2026-10-11 10:00:00",
  updated_at: "2026-10-11 10:00:00",
});

const renderCalendar = (
  instances: Task[] = [],
  onPick = vi.fn(),
  selectedIso: string | null = null,
) => {
  // Fixed today so the calendar's initial month is deterministic.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-19T12:00:00"));
  render(
    <InstanceCalendar
      series={series}
      instances={instances}
      selectedIso={selectedIso}
      onPick={onPick}
    />,
  );
  return onPick;
};

describe("InstanceCalendar", () => {
  afterEach(() => vi.useRealTimers());

  it("renders weekday headers Monday-first, matching the day cells", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00"));
    const { container } = render(
      <InstanceCalendar
        series={series}
        instances={[]}
        selectedIso={null}
        onPick={vi.fn()}
      />,
    );
    const headerTexts = Array.from(container.querySelector(".grid")!.children)
      .slice(0, 7)
      .map((el) => el.textContent);
    expect(headerTexts).toEqual(WEEKDAY_OPTIONS.map((w) => w.short));
  });

  it("renders the current month with prev/next navigation", () => {
    renderCalendar();
    expect(screen.getByText(/October 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: CALENDAR_NEXT_LABEL }));
    expect(screen.getByText(/November 2026/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: CALENDAR_PREVIOUS_LABEL }),
    );
    expect(screen.getByText(/October 2026/)).toBeInTheDocument();
  });

  it("only scheduled dates are selectable", () => {
    renderCalendar();
    // Mondays in Oct 2026: 5, 12, 19, 26 — selectable buttons.
    expect(
      screen.getByRole("button", { name: "2026-10-05" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "2026-10-19" }),
    ).toBeInTheDocument();
    // A Tuesday is rendered but not selectable.
    expect(
      screen.queryByRole("button", { name: "2026-10-20" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("picking a persisted date returns its task", () => {
    const persisted = instance("2026-10-19");
    const onPick = renderCalendar([persisted]);
    fireEvent.click(screen.getByRole("button", { name: "2026-10-19" }));
    expect(onPick).toHaveBeenCalledWith(persisted, "2026-10-19");
  });

  it("keeps a persisted instance selectable off the schedule", () => {
    // A Wednesday — not a scheduled date for a Monday series.
    const offSchedule = instance("2026-10-21");
    const onPick = renderCalendar([offSchedule]);
    fireEvent.click(screen.getByRole("button", { name: "2026-10-21" }));
    expect(onPick).toHaveBeenCalledWith(offSchedule, "2026-10-21");
  });

  it("picking a scheduled but unpersisted date returns null", () => {
    const onPick = renderCalendar([]);
    fireEvent.click(screen.getByRole("button", { name: "2026-10-26" }));
    expect(onPick).toHaveBeenCalledWith(null, "2026-10-26");
  });

  it("marks scheduled days with a dot and unscheduled days without one", () => {
    renderCalendar();
    const scheduled = screen.getByRole("button", { name: "2026-10-19" });
    // Stitch design: a primary dot under the day number marks an occurrence.
    expect(scheduled.querySelector("[aria-hidden='true']")).toBeInTheDocument();
    // An unscheduled day renders plain text — nothing to mark.
    const plain = screen.getByText("20").closest("span")!;
    expect(plain.querySelector("[aria-hidden='true']")).toBeNull();
  });

  it("keeps the marker visible on the selected day in the on-primary color", () => {
    renderCalendar([], vi.fn(), "2026-10-19");
    const selected = screen.getByRole("button", { name: "2026-10-19" });
    const dot = selected.querySelector("[aria-hidden='true']")!;
    expect(dot).toHaveClass("bg-on-primary");
  });

  it("marks the selected date", () => {
    renderCalendar([], vi.fn(), "2026-10-12");
    expect(screen.getByRole("button", { name: "2026-10-12" })).toHaveAttribute(
      "aria-current",
      "date",
    );
  });
});
