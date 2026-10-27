import { QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { listTaskCategories } from "@/api/categories";
import { globalThreshold, weekStart } from "@/api/profiles";
import type { Task } from "@/api/bindings";
import {
  listPendingCarryOver,
  listWeekTasks,
  resolveCarryOver,
} from "@/api/tasks";
import { TaskPlacement, TaskStatus, Weekday } from "@/lib/enums";
import {
  CARRY_OVER_APPLY_LABEL,
  CARRY_OVER_CARRY_LABEL,
  BOARD_NEXT_WEEK_LABEL,
  BOARD_PREVIOUS_WEEK_LABEL,
  BOARD_THIS_WEEK_LABEL,
  STATUS_LABELS,
  THRESHOLD_COLOR_DEFAULT,
  WEEKLY_BACKLOG_LABEL,
  boardWeekRangeLabel,
  dayTotalsLabel,
  editTaskLabel,
  shortWeekdayLabel,
  taskCountLabel,
} from "@/lib/labels";
import {
  formatIsoDay,
  shiftDays,
  thresholdTint,
  todayLocalIso,
  weekDates,
} from "@/lib/utils";
import { BoardPage } from "@/pages/BoardPage";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/tasks")>()),
  listWeekTasks: vi.fn(),
  listPendingCarryOver: vi.fn(),
  resolveCarryOver: vi.fn(),
}));
vi.mock("@/api/profiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/profiles")>()),
  weekStart: vi.fn(),
  globalThreshold: vi.fn(),
}));
vi.mock("@/api/categories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/categories")>()),
  listTaskCategories: vi.fn(),
}));
// The dialog is covered by its own suite — a stub keeps this test on
// the board's own responsibilities.
vi.mock("@/features/tasks/EditTaskDialog", () => ({
  EditTaskDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog">
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

const mockedListWeekTasks = vi.mocked(listWeekTasks);
const mockedPendingCarryOver = vi.mocked(listPendingCarryOver);
const mockedResolveCarryOver = vi.mocked(resolveCarryOver);
const mockedWeekStart = vi.mocked(weekStart);
const mockedGlobalThreshold = vi.mocked(globalThreshold);
const mockedListTaskCategories = vi.mocked(listTaskCategories);

const todayIso = todayLocalIso();
const days = weekDates(todayIso, Weekday.Monday);

const TASK_TITLE = "Sweep the porch";
const BACKLOG_TITLE = "Unassigned errand";

const baseTask: Task = {
  id: 1,
  profile_id: 1,
  title: TASK_TITLE,
  description: null,
  status: TaskStatus.Todo,
  carry_over_rule: null,
  estimated_minutes: 60,
  spent_minutes: 30,
  placement: TaskPlacement.Scheduled,
  scheduled_date: days[0],
  series_id: null,
  sort_order: 1,
  created_at: "2026-10-01 08:00:00",
  updated_at: "2026-10-01 08:00:00",
};
const weeklyTask: Task = {
  ...baseTask,
  id: 2,
  title: BACKLOG_TITLE,
  spent_minutes: null,
  placement: TaskPlacement.WeeklyBacklog,
  scheduled_date: null,
};

const renderBoard = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <BoardPage />
    </QueryClientProvider>,
  );

beforeEach(() => {
  mockedListWeekTasks.mockResolvedValue([baseTask, weeklyTask]);
  mockedPendingCarryOver.mockResolvedValue([]);
  mockedWeekStart.mockResolvedValue(Weekday.Monday);
  mockedGlobalThreshold.mockResolvedValue({ minutes: null, color: null });
  mockedListTaskCategories.mockResolvedValue([]);
});

describe("BoardPage", () => {
  it("renders the week range, eight columns, and three state rows", async () => {
    renderBoard();

    expect(
      await screen.findByText(boardWeekRangeLabel(days[0], days[6])),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: /Weekly backlog/ }),
    ).toBeInTheDocument();
    for (const status of Object.values(STATUS_LABELS)) {
      expect(
        screen.getByRole("rowheader", { name: status }),
      ).toBeInTheDocument();
    }
    expect(screen.getAllByRole("columnheader")).toHaveLength(8);
  });

  it("places cards under their day and status with weekly totals", async () => {
    renderBoard();

    const card = await screen.findByRole("button", {
      name: editTaskLabel(TASK_TITLE),
    });
    // The card's cell must sit under its own day's columnheader — index
    // equality is what the header corner cell guarantees.
    const headers =
      document.querySelectorAll<HTMLTableCellElement>("thead tr th");
    const cell = card.closest("td")!;
    expect(cell.cellIndex).toBeGreaterThan(0);
    expect(
      [...headers].find((th) => th.cellIndex === cell.cellIndex)?.textContent,
    ).toContain("Oct");
    // Weekly totals aggregate every visible task.
    expect(
      screen.getByText(`${taskCountLabel(2)} · ${dayTotalsLabel(120, 30)}`),
    ).toBeInTheDocument();
  });

  it("shows the weekly backlog task in the first column", async () => {
    renderBoard();
    expect(
      await screen.findByRole("button", {
        name: editTaskLabel(BACKLOG_TITLE),
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(WEEKLY_BACKLOG_LABEL)).toBeInTheDocument();
  });

  it("renders an empty week with zeroed totals", async () => {
    mockedListWeekTasks.mockResolvedValue([]);
    renderBoard();

    // Page header plus one line per column, all zeroed.
    expect(
      await screen.findAllByText(
        `${taskCountLabel(0)} · ${dayTotalsLabel(0, 0)}`,
      ),
    ).toHaveLength(9);
  });

  it("orders day columns from the configured week start", async () => {
    const wednesdayDays = weekDates(todayIso, Weekday.Wednesday);
    mockedWeekStart.mockResolvedValue(Weekday.Wednesday);
    renderBoard();

    expect(
      await screen.findByText(
        boardWeekRangeLabel(wednesdayDays[0], wednesdayDays[6]),
      ),
    ).toBeInTheDocument();
    const headers = screen.getAllByRole("columnheader").slice(1);
    expect(headers[0].textContent).toContain(
      shortWeekdayLabel(wednesdayDays[0]),
    );
    expect(headers[6].textContent).toContain(
      shortWeekdayLabel(wednesdayDays[6]),
    );
  });

  it("places a card in the row matching its status", async () => {
    mockedListWeekTasks.mockResolvedValue([
      { ...baseTask, status: TaskStatus.Done },
    ]);
    renderBoard();

    const card = await screen.findByRole("button", {
      name: editTaskLabel(TASK_TITLE),
    });
    const rowHeader = card.closest("tr")!.querySelector("th");
    expect(rowHeader?.textContent).toBe(STATUS_LABELS[TaskStatus.Done]);
  });

  it("aligns a weekly backlog card with the backlog columnheader", async () => {
    mockedListWeekTasks.mockResolvedValue([weeklyTask]);
    renderBoard();

    const card = await screen.findByRole("button", {
      name: editTaskLabel(BACKLOG_TITLE),
    });
    const cell = card.closest("td")!;
    const headers =
      document.querySelectorAll<HTMLTableCellElement>("thead tr th");
    expect(
      [...headers].find((th) => th.cellIndex === cell.cellIndex)?.textContent,
    ).toContain(WEEKLY_BACKLOG_LABEL);
  });

  it("totals tasks with missing estimate and spent values as zero", async () => {
    mockedListWeekTasks.mockResolvedValue([
      {
        ...baseTask,
        estimated_minutes: null,
        spent_minutes: null,
      },
    ]);
    renderBoard();

    // 1 task with nothing counted — the string appears once for the
    // page header and once for its day's columnheader.
    await screen.findByRole("button", {
      name: editTaskLabel(TASK_TITLE),
    });
    expect(
      screen.getAllByText(`${taskCountLabel(1)} · ${dayTotalsLabel(0, 0)}`),
    ).toHaveLength(2);
  });

  it("surfaces the board read error in an alert", async () => {
    const message = "the week listing failed";
    mockedListWeekTasks.mockRejectedValue(new Error(message));
    renderBoard();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("opens the task details dialog from a card", async () => {
    renderBoard();

    fireEvent.click(
      await screen.findByRole("button", {
        name: editTaskLabel(TASK_TITLE),
      }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes the dialog and returns to the board", async () => {
    renderBoard();

    fireEvent.click(
      await screen.findByRole("button", {
        name: editTaskLabel(TASK_TITLE),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The board still shows the task afterwards.
    expect(
      screen.getByRole("button", { name: editTaskLabel(TASK_TITLE) }),
    ).toBeInTheDocument();
  });

  it("steps back to a past week and hides the weekly backlog column", async () => {
    renderBoard();
    await screen.findByRole("columnheader", {
      name: new RegExp(WEEKLY_BACKLOG_LABEL),
    });
    fireEvent.click(
      screen.getByRole("button", { name: BOARD_PREVIOUS_WEEK_LABEL }),
    );

    // The weekly backlog is current-week state — past boards show
    // day columns only (spec §336/§354).
    await waitFor(() =>
      expect(
        screen.queryByRole("columnheader", {
          name: new RegExp(WEEKLY_BACKLOG_LABEL),
        }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: BOARD_NEXT_WEEK_LABEL }),
    ).toBeEnabled();
    const prior = weekDates(shiftDays(days[0], -7), Weekday.Monday);
    expect(
      screen.getByText(boardWeekRangeLabel(prior[0], prior[6])),
    ).toBeInTheDocument();
  });

  it("jumps straight back to the current week via This week", async () => {
    renderBoard();
    await screen.findByRole("columnheader", {
      name: new RegExp(WEEKLY_BACKLOG_LABEL),
    });
    const thisWeek = screen.getByRole("button", {
      name: BOARD_THIS_WEEK_LABEL,
    });
    expect(thisWeek).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", { name: BOARD_PREVIOUS_WEEK_LABEL }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: BOARD_PREVIOUS_WEEK_LABEL }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("columnheader", {
          name: new RegExp(WEEKLY_BACKLOG_LABEL),
        }),
      ).not.toBeInTheDocument(),
    );
    // Two weeks back — This week is not the same as clicking Next.
    const prior = weekDates(shiftDays(days[0], -14), Weekday.Monday);
    expect(
      screen.getByText(boardWeekRangeLabel(prior[0], prior[6])),
    ).toBeInTheDocument();
    expect(thisWeek).toBeEnabled();

    fireEvent.click(thisWeek);

    await screen.findByRole("columnheader", {
      name: new RegExp(WEEKLY_BACKLOG_LABEL),
    });
    expect(thisWeek).toBeDisabled();
  });

  it("jumps to a past week via the calendar popover", async () => {
    renderBoard();
    await screen.findByRole("columnheader", {
      name: new RegExp(WEEKLY_BACKLOG_LABEL),
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: boardWeekRangeLabel(days[0], days[6]),
      }),
    );
    const prior = weekDates(shiftDays(days[0], -14), Weekday.Monday);
    fireEvent.click(
      screen.getByRole("button", { name: formatIsoDay(prior[0]) }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("columnheader", {
          name: new RegExp(WEEKLY_BACKLOG_LABEL),
        }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText(boardWeekRangeLabel(prior[0], prior[6])),
    ).toBeInTheDocument();
  });

  it("disables days in future weeks inside the calendar popover", async () => {
    renderBoard();
    fireEvent.click(
      await screen.findByRole("button", {
        name: boardWeekRangeLabel(days[0], days[6]),
      }),
    );
    const future = weekDates(shiftDays(days[0], 7), Weekday.Monday);
    expect(
      screen.getByRole("button", { name: formatIsoDay(future[0]) }),
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", { name: formatIsoDay(future[0]) }),
    );

    // Future boards also drop the weekly backlog (spec §336/§354).
    await waitFor(() =>
      expect(
        screen.queryByRole("columnheader", {
          name: new RegExp(WEEKLY_BACKLOG_LABEL),
        }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText(boardWeekRangeLabel(future[0], future[6])),
    ).toBeInTheDocument();
  });

  it("prompts for undecided carry-over on the current week only", async () => {
    const stray = { ...baseTask, title: "Leftover" };
    mockedPendingCarryOver.mockResolvedValue([stray]);
    mockedResolveCarryOver.mockResolvedValue(undefined);
    renderBoard();
    const prompt = await screen.findByRole("dialog", {
      name: /week started/i,
    });
    expect(within(prompt).getByText("Leftover")).toBeInTheDocument();

    fireEvent.click(
      within(prompt).getByRole("button", { name: CARRY_OVER_CARRY_LABEL }),
    );
    fireEvent.click(
      within(prompt).getByRole("button", { name: CARRY_OVER_APPLY_LABEL }),
    );
    await waitFor(() =>
      expect(mockedResolveCarryOver).toHaveBeenCalledWith(stray.id, "carry"),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /week started/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows the carried task in the weekly backlog after applying", async () => {
    const stray = { ...baseTask, title: "Leftover" };
    const carried = {
      ...stray,
      carry_over_rule: "carry" as const,
      placement: TaskPlacement.WeeklyBacklog,
      scheduled_date: null,
    };
    mockedPendingCarryOver.mockResolvedValue([stray]);
    mockedResolveCarryOver.mockResolvedValue(undefined);
    mockedListWeekTasks.mockResolvedValueOnce([baseTask, weeklyTask]);
    mockedListWeekTasks.mockResolvedValue([baseTask, weeklyTask, carried]);
    renderBoard();
    const prompt = await screen.findByRole("dialog", {
      name: /week started/i,
    });
    fireEvent.click(
      within(prompt).getByRole("button", { name: CARRY_OVER_CARRY_LABEL }),
    );
    fireEvent.click(
      within(prompt).getByRole("button", { name: CARRY_OVER_APPLY_LABEL }),
    );
    // The refetched board shows the carried card under Weekly backlog.
    await waitFor(() =>
      expect(
        screen.getByRole("columnheader", {
          name: new RegExp(WEEKLY_BACKLOG_LABEL),
        }),
      ).toBeInTheDocument(),
    );
    await waitFor(() => {
      const backlogCol = screen
        .getByRole("columnheader", { name: new RegExp(WEEKLY_BACKLOG_LABEL) })
        .closest("th");
      expect(backlogCol).toBeInTheDocument();
    });
  });

  it("never prompts on a past board", async () => {
    // Pending decisions exist — they must still not surface on a past
    // board once the view navigates away from the current week.
    mockedPendingCarryOver.mockResolvedValue([
      { ...baseTask, title: "Leftover" },
    ]);
    renderBoard();
    fireEvent.click(
      screen.getByRole("button", { name: BOARD_PREVIOUS_WEEK_LABEL }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("columnheader", {
          name: new RegExp(WEEKLY_BACKLOG_LABEL),
        }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("dialog", { name: /week started/i }),
    ).not.toBeInTheDocument();
  });

  it("toggles aria-expanded and closes the popover on Escape", async () => {
    renderBoard();
    const trigger = await screen.findByRole("button", {
      name: boardWeekRangeLabel(days[0], days[6]),
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await screen.findByRole("dialog");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the popover on an outside click", async () => {
    renderBoard();
    const trigger = await screen.findByRole("button", {
      name: boardWeekRangeLabel(days[0], days[6]),
    });
    fireEvent.click(trigger);
    await screen.findByRole("dialog");

    // The invisible backdrop sits between the popover and the page.
    fireEvent.click(document.querySelector(".fixed.inset-0")!);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("tints a day column whose estimate total reaches the threshold", async () => {
    mockedGlobalThreshold.mockResolvedValue({
      minutes: 60,
      color: THRESHOLD_COLOR_DEFAULT,
    });
    renderBoard();
    const headers = await screen.findAllByRole("columnheader");
    // Column 0 is the weekly backlog; column 1 holds days[0]'s 60m task.
    // The tint lands once the threshold query resolves.
    await waitFor(() =>
      expect(headers[1]).toHaveStyle({
        backgroundColor: thresholdTint(THRESHOLD_COLOR_DEFAULT),
      }),
    );
    expect(headers[0]).not.toHaveStyle({
      backgroundColor: thresholdTint(THRESHOLD_COLOR_DEFAULT),
    });
  });

  it("does not tint a column under the threshold or when unset", async () => {
    // 61 > the day's 60m total.
    mockedGlobalThreshold.mockResolvedValue({
      minutes: 61,
      color: THRESHOLD_COLOR_DEFAULT,
    });
    renderBoard();
    const headers = await screen.findAllByRole("columnheader");
    await waitFor(() =>
      expect(headers[1]).not.toHaveStyle({
        backgroundColor: thresholdTint(THRESHOLD_COLOR_DEFAULT),
      }),
    );
  });

  it("steps forward again and the weekly backlog reappears", async () => {
    renderBoard();
    await screen.findByRole("columnheader", {
      name: new RegExp(WEEKLY_BACKLOG_LABEL),
    });
    fireEvent.click(
      screen.getByRole("button", { name: BOARD_PREVIOUS_WEEK_LABEL }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("columnheader", {
          name: new RegExp(WEEKLY_BACKLOG_LABEL),
        }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: BOARD_NEXT_WEEK_LABEL }),
    );

    await screen.findByRole("columnheader", {
      name: new RegExp(WEEKLY_BACKLOG_LABEL),
    });
  });
});
