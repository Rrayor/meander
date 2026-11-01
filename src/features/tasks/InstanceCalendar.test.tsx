import {
  CarryOverRule,
  RecurrenceKind,
  TaskStatus,
  Weekday,
} from "@/lib/enums";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";

import type { Task, TaskSeries } from "@/api/bindings";
import { QUERY_KEYS } from "@/api/queryKeys";
import { InstanceCalendar } from "@/features/tasks/InstanceCalendar";
import { testQueryClient } from "@/test/queryClient";
import {
  CALENDAR_NEXT_LABEL,
  CALENDAR_PREVIOUS_LABEL,
  WEEKDAY_OPTIONS,
  weekdaysFrom,
} from "@/lib/labels";

const series: TaskSeries = {
  id: 3,
  profile_id: 1,
  title: "Standup",
  description: null,
  carry_over_rule: CarryOverRule.Return,
  estimated_minutes: null,
  recurrence: {
    kind: RecurrenceKind.Weekly,
    interval_weeks: 1,
    weekdays: [Weekday.Monday],
  },
  start_date: "2026-10-05",
  end_date: null,
  succeeded_by: null,
  created_at: "2026-10-11 10:00:00",
  updated_at: "2026-10-11 10:00:00",
};

// A Monday in the series' week schedule — also the calendar's fixed "today".
const TODAY_ISO = "2026-10-19";
const TODAY_TIME = `${TODAY_ISO}T12:00:00`;
// Wednesdays fall off the Monday-only schedule; 26th is a scheduled Monday.
const OFF_SCHEDULE_ISO = "2026-10-21";
const UNSAVED_SCHEDULED_ISO = "2026-10-26";
const SELECTED_ISO = "2026-10-12";

const instance = (iso: string): Task => ({
  id: 11,
  profile_id: 1,
  title: "Standup",
  description: null,
  status: TaskStatus.Todo,
  carry_over_rule: CarryOverRule.Return,
  estimated_minutes: null,
  spent_minutes: null,
  placement: "weekly_backlog",
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
  weekStart: Weekday = Weekday.Monday,
) => {
  // Fixed today so the calendar's initial month is deterministic.
  vi.useFakeTimers();
  vi.setSystemTime(new Date(TODAY_TIME));
  const client = testQueryClient();
  client.setQueryData(QUERY_KEYS.weekStart, weekStart);
  render(
    <QueryClientProvider client={client}>
      <InstanceCalendar
        series={[series]}
        instances={instances}
        selectedIso={selectedIso}
        onPick={onPick}
      />
    </QueryClientProvider>,
  );
  return onPick;
};

describe("InstanceCalendar", () => {
  afterEach(() => vi.useRealTimers());

  it("renders weekday headers Monday-first, matching the day cells", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(TODAY_TIME));
    const { container } = render(
      <QueryClientProvider client={testQueryClient()}>
        <InstanceCalendar
          series={[series]}
          instances={[]}
          selectedIso={null}
          onPick={vi.fn()}
        />
      </QueryClientProvider>,
    );
    const headerTexts = Array.from(container.querySelector(".grid")!.children)
      .slice(0, 7)
      .map((el) => el.textContent);
    expect(headerTexts).toEqual(WEEKDAY_OPTIONS.map((w) => w.short));
  });

  it.each([
    // Sunday start: Thu Oct 1 sits in the fifth column (Su Mo Tu We Th).
    [Weekday.Sunday, 4],
    // Saturday start exercises the index-based column mapping: Sa Su Mo
    // Tu We Th — the 1st sits under "Th" at index 5.
    [Weekday.Saturday, 5],
  ])(
    "rotates headers and anchors the grid on a %s week start",
    (weekStart, firstOfMonthColumn) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(TODAY_TIME));
      const client = testQueryClient();
      client.setQueryData(QUERY_KEYS.weekStart, weekStart);
      const { container } = render(
        <QueryClientProvider client={client}>
          <InstanceCalendar
            series={[series]}
            instances={[]}
            selectedIso={null}
            onPick={vi.fn()}
          />
        </QueryClientProvider>,
      );
      const grid = Array.from(container.querySelector(".grid")!.children);
      const headerTexts = grid.slice(0, 7).map((el) => el.textContent);
      expect(headerTexts).toEqual(weekdaysFrom(weekStart).map((w) => w.short));
      // October 2026 starts on a Thursday; the column depends on the
      // configured week start.
      expect(grid[7 + firstOfMonthColumn].textContent).toBe("1");
    },
  );

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
      screen.getByRole("button", { name: series.start_date }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: TODAY_ISO })).toBeInTheDocument();
    // A Tuesday is rendered but not selectable.
    expect(
      screen.queryByRole("button", { name: "2026-10-20" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("picking a persisted date returns its task", () => {
    const persisted = instance(TODAY_ISO);
    const onPick = renderCalendar([persisted]);
    fireEvent.click(screen.getByRole("button", { name: TODAY_ISO }));
    expect(onPick).toHaveBeenCalledWith(persisted, TODAY_ISO);
  });

  it("keeps a persisted instance selectable off the schedule", () => {
    // A Wednesday — not a scheduled date for a Monday series.
    const offSchedule = instance(OFF_SCHEDULE_ISO);
    const onPick = renderCalendar([offSchedule]);
    fireEvent.click(screen.getByRole("button", { name: OFF_SCHEDULE_ISO }));
    expect(onPick).toHaveBeenCalledWith(offSchedule, OFF_SCHEDULE_ISO);
  });

  it("picking a scheduled but unpersisted date returns null", () => {
    const onPick = renderCalendar([]);
    fireEvent.click(
      screen.getByRole("button", { name: UNSAVED_SCHEDULED_ISO }),
    );
    expect(onPick).toHaveBeenCalledWith(null, UNSAVED_SCHEDULED_ISO);
  });

  it("marks scheduled days with a dot and unscheduled days without one", () => {
    renderCalendar();
    const scheduled = screen.getByRole("button", { name: TODAY_ISO });
    // Stitch design: a primary dot under the day number marks an occurrence.
    expect(scheduled.querySelector("[aria-hidden='true']")).toBeInTheDocument();
    // An unscheduled day renders plain text — nothing to mark.
    const plain = screen.getByText("20").closest("span")!;
    expect(plain.querySelector("[aria-hidden='true']")).toBeNull();
  });

  it("distinguishes persisted instances from merely scheduled dates", () => {
    // Stitch design: filled dot = recorded instance, hollow ring =
    // scheduled-only occurrence.
    const persisted = instance(TODAY_ISO);
    renderCalendar([persisted]);
    const filled = screen
      .getByRole("button", { name: TODAY_ISO })
      .querySelector("[aria-hidden='true']")!;
    expect(filled).toHaveClass("bg-primary");
    const hollow = screen
      .getByRole("button", { name: UNSAVED_SCHEDULED_ISO })
      .querySelector("[aria-hidden='true']")!;
    expect(hollow).toHaveClass("border-primary", "bg-transparent");
    expect(hollow).not.toHaveClass("bg-primary");
  });

  it("keeps both markers visible on the selected day in the on-primary color", () => {
    const persisted = instance(TODAY_ISO);
    renderCalendar([persisted], vi.fn(), TODAY_ISO);
    const filled = screen
      .getByRole("button", { name: TODAY_ISO })
      .querySelector("[aria-hidden='true']")!;
    expect(filled).toHaveClass("bg-on-primary");
  });

  it("keeps the hollow ring visible on a selected scheduled-only day", () => {
    renderCalendar([], vi.fn(), UNSAVED_SCHEDULED_ISO);
    const hollow = screen
      .getByRole("button", { name: UNSAVED_SCHEDULED_ISO })
      .querySelector("[aria-hidden='true']")!;
    expect(hollow).toHaveClass("border-on-primary", "bg-transparent");
  });

  it("marks the selected date", () => {
    renderCalendar([], vi.fn(), SELECTED_ISO);
    expect(screen.getByRole("button", { name: SELECTED_ISO })).toHaveAttribute(
      "aria-current",
      "date",
    );
  });

  it("does not offer a vacated date after its instance moved away", () => {
    render(
      <QueryClientProvider client={testQueryClient()}>
        <InstanceCalendar
          series={[series]}
          instances={[]}
          skipped={[series.start_date]}
          selectedIso={series.start_date}
          onPick={vi.fn()}
        />
      </QueryClientProvider>,
    );
    // The cadence date still exists visually, but it is a plain day —
    // not a selectable expected occurrence.
    expect(
      screen.queryByRole("button", { name: series.start_date }),
    ).toBeNull();
  });
});
