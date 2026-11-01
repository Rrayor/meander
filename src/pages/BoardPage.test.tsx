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
import { ApiError } from "@/api/transport";
import { INSTANCE_DATE_OCCUPIED_MESSAGE } from "@/lib/errors";
import { ADD_TASK_LABEL, CLOSE_LABEL, TASK_CARD_LABEL } from "@/lib/labels";
import { currentProfile, globalThreshold, weekStart } from "@/api/profiles";
import type { Task } from "@/api/bindings";
import {
  boardMove,
  listPendingCarryOver,
  listWeekTasks,
  resolveCarryOver,
} from "@/api/tasks";
import { BoardLayout, TaskPlacement, TaskStatus, Weekday } from "@/lib/enums";
import {
  CARRY_OVER_APPLY_LABEL,
  CARRY_OVER_CARRY_LABEL,
  BOARD_NEXT_WEEK_LABEL,
  BOARD_PREVIOUS_WEEK_LABEL,
  BOARD_THIS_WEEK_LABEL,
  STATUS_LABELS,
  TRANSPOSE_LAYOUT_LABEL,
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
  weekdayNameOf,
} from "@/lib/utils";
import { BoardPage } from "@/pages/BoardPage";
import { categoryFixture } from "@/test/fixtures";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/tasks")>()),
  listWeekTasks: vi.fn(),
  listPendingCarryOver: vi.fn(),
  resolveCarryOver: vi.fn(),
  boardMove: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/api/profiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/profiles")>()),
  weekStart: vi.fn(),
  globalThreshold: vi.fn(),
  currentProfile: vi.fn().mockResolvedValue({
    id: 1,
    name: "Profile",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  }),
}));
vi.mock("@/api/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/settings")>()),
  currentDatabasePath: vi.fn().mockResolvedValue("/data/main.db"),
}));
vi.mock("@/api/categories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/categories")>()),
  listTaskCategories: vi.fn(),
}));
// The dialog is covered by its own suite — a stub keeps this test on
// the board's own responsibilities.
let capturedDragEnd: (e: unknown) => void = () => {};
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: unknown;
      onDragEnd: (e: unknown) => void;
    }) => {
      capturedDragEnd = onDragEnd;
      return children;
    },
    useDraggable: () => ({
      attributes: {
        role: "button",
        tabIndex: 0,
        "aria-roledescription": "draggable",
      },
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      isDragging: false,
    }),
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

vi.mock("@/features/tasks/EditTaskDialog", () => ({
  EditTaskDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog">
      <button type="button" onClick={onClose}>
        {CLOSE_LABEL}
      </button>
    </div>
  ),
}));
vi.mock("@/features/tasks/NewTaskDialog", () => ({
  NewTaskDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog">
      <button type="button" onClick={onClose}>
        {CLOSE_LABEL}
      </button>
    </div>
  ),
}));

const mockedListWeekTasks = vi.mocked(listWeekTasks);
const mockedBoardMove = vi.mocked(boardMove);
const mockedPendingCarryOver = vi.mocked(listPendingCarryOver);
const mockedResolveCarryOver = vi.mocked(resolveCarryOver);
const mockedWeekStart = vi.mocked(weekStart);
const mockedGlobalThreshold = vi.mocked(globalThreshold);
const mockedCurrentProfile = vi.mocked(currentProfile);
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
  placement: TaskPlacement.WeeklyBacklog,
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
  localStorage.clear();
  mockedListWeekTasks.mockResolvedValue([baseTask, weeklyTask]);
  mockedPendingCarryOver.mockResolvedValue([]);
  mockedWeekStart.mockResolvedValue(Weekday.Monday);
  mockedGlobalThreshold.mockResolvedValue({
    minutes: null,
    color: null,
    day_minutes: {},
  });
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

  it("keeps a dated weekly-backlog row off the backlog column", async () => {
    // A dated task is a board entity — even one pooled weekly_backlog
    // renders under its day column, never the backlog column (§57).
    mockedListWeekTasks.mockResolvedValue([
      { ...weeklyTask, scheduled_date: todayIso },
    ]);
    renderBoard();

    const card = await screen.findByRole("button", {
      name: editTaskLabel(BACKLOG_TITLE),
    });
    const cell = card.closest("td")!;
    const headers =
      document.querySelectorAll<HTMLTableCellElement>("thead tr th");
    const headerText = [...headers].find(
      (th) => th.cellIndex === cell.cellIndex,
    )?.textContent;
    expect(headerText).not.toContain(WEEKLY_BACKLOG_LABEL);
    expect(headerText).toContain(shortWeekdayLabel(todayIso));
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
    fireEvent.click(screen.getByRole("button", { name: CLOSE_LABEL }));

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
      day_minutes: {},
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
      day_minutes: {},
    });
    renderBoard();
    const headers = await screen.findAllByRole("columnheader");
    await waitFor(() =>
      expect(headers[1]).not.toHaveStyle({
        backgroundColor: thresholdTint(THRESHOLD_COLOR_DEFAULT),
      }),
    );
  });

  it("tints at a weekday override below the global threshold", async () => {
    // 60m on days[0] (monday): under the 240 global but over its 30 override.
    mockedGlobalThreshold.mockResolvedValue({
      minutes: 240,
      color: THRESHOLD_COLOR_DEFAULT,
      day_minutes: { [Weekday.Monday]: 30 },
    });
    renderBoard();
    const headers = await screen.findAllByRole("columnheader");
    await waitFor(() =>
      expect(headers[1]).toHaveStyle({
        backgroundColor: thresholdTint(THRESHOLD_COLOR_DEFAULT),
      }),
    );
  });

  it("does not tint when the weekday override is above the total", async () => {
    // The override replaces the global — 60m is under monday's 300.
    mockedGlobalThreshold.mockResolvedValue({
      minutes: 60,
      color: THRESHOLD_COLOR_DEFAULT,
      day_minutes: { [Weekday.Monday]: 300 },
    });
    renderBoard();
    const headers = await screen.findAllByRole("columnheader");
    await waitFor(() =>
      expect(headers[1]).not.toHaveStyle({
        backgroundColor: thresholdTint(THRESHOLD_COLOR_DEFAULT),
      }),
    );
  });

  it("tints a day-only threshold and leaves other days untinted", async () => {
    // No global minutes — only monday has a limit; it is reached.
    mockedGlobalThreshold.mockResolvedValue({
      minutes: null,
      color: THRESHOLD_COLOR_DEFAULT,
      day_minutes: { [Weekday.Monday]: 30 },
    });
    renderBoard();
    const headers = await screen.findAllByRole("columnheader");
    await waitFor(() =>
      expect(headers[1]).toHaveStyle({
        backgroundColor: thresholdTint(THRESHOLD_COLOR_DEFAULT),
      }),
    );
    expect(headers[2]).not.toHaveStyle({
      backgroundColor: thresholdTint(THRESHOLD_COLOR_DEFAULT),
    });
  });

  it("does not tint a day without an effective limit on a day-only threshold", async () => {
    // tuesday has the override — monday has no limit at all.
    mockedGlobalThreshold.mockResolvedValue({
      minutes: null,
      color: THRESHOLD_COLOR_DEFAULT,
      day_minutes: { [Weekday.Tuesday]: 30 },
    });
    renderBoard();
    const headers = await screen.findAllByRole("columnheader");
    await waitFor(() =>
      expect(headers[1]).not.toHaveStyle({
        backgroundColor: thresholdTint(THRESHOLD_COLOR_DEFAULT),
      }),
    );
  });

  const CAT_COLOR = "#60a5fa";
  const WORK_CAT = categoryFixture({
    id: 11,
    title: "Work",
    threshold_minutes: 60,
    threshold_color: CAT_COLOR,
  });
  const OTHER_COLOR = "#f472b6";

  it("tints a column in the category threshold color when reached", async () => {
    mockedListTaskCategories.mockImplementation(async (id) =>
      id === baseTask.id ? [WORK_CAT] : [],
    );
    renderBoard();
    const headers = await screen.findAllByRole("columnheader");
    await waitFor(() =>
      expect(headers[1]).toHaveStyle({
        backgroundColor: thresholdTint(CAT_COLOR),
      }),
    );
    // The backlog column never tints from category thresholds.
    expect(headers[0]).not.toHaveStyle({
      backgroundColor: thresholdTint(CAT_COLOR),
    });
  });

  it("does not tint when the category estimate stays under its limit", async () => {
    mockedListTaskCategories.mockImplementation(async (id) =>
      id === baseTask.id
        ? [
            categoryFixture({
              id: 11,
              threshold_minutes: 120,
              threshold_color: CAT_COLOR,
            }),
          ]
        : [],
    );
    renderBoard();
    const headers = await screen.findAllByRole("columnheader");
    await waitFor(() =>
      expect(headers[1]).not.toHaveStyle({
        backgroundColor: thresholdTint(CAT_COLOR),
      }),
    );
  });

  it("blends the global and category tints into a gradient when both reach", async () => {
    mockedGlobalThreshold.mockResolvedValue({
      minutes: 60,
      color: THRESHOLD_COLOR_DEFAULT,
      day_minutes: {},
    });
    mockedListTaskCategories.mockImplementation(async (id) =>
      id === baseTask.id ? [WORK_CAT] : [],
    );
    renderBoard();
    const headers = await screen.findAllByRole("columnheader");
    await waitFor(() =>
      expect(headers[1]).toHaveStyle({
        backgroundImage: `linear-gradient(to bottom, ${thresholdTint(THRESHOLD_COLOR_DEFAULT)}, ${thresholdTint(CAT_COLOR)})`,
      }),
    );
  });

  it("tints the card of a reached category but not unrelated cards", async () => {
    mockedListTaskCategories.mockImplementation(async (id) =>
      id === baseTask.id ? [WORK_CAT] : [],
    );
    renderBoard();
    const card = await screen.findByLabelText(TASK_CARD_LABEL(TASK_TITLE));
    await waitFor(() =>
      expect(card).toHaveStyle({
        backgroundColor: thresholdTint(CAT_COLOR),
      }),
    );
    const other = await screen.findByLabelText(TASK_CARD_LABEL(BACKLOG_TITLE));
    expect(other).not.toHaveStyle({
      backgroundColor: thresholdTint(CAT_COLOR),
    });
  });

  it("honors a per-weekday override on the category threshold", async () => {
    const wd = weekdayNameOf(days[0]);
    // Minutes 120 would not reach (60 < 120) — the day's 60 override does.
    mockedListTaskCategories.mockImplementation(async (id) =>
      id === baseTask.id
        ? [
            categoryFixture({
              id: 11,
              threshold_minutes: 120,
              threshold_color: CAT_COLOR,
              threshold_day_minutes: { [wd]: 60 },
            }),
          ]
        : [],
    );
    renderBoard();
    const headers = await screen.findAllByRole("columnheader");
    await waitFor(() =>
      expect(headers[1]).toHaveStyle({
        backgroundColor: thresholdTint(CAT_COLOR),
      }),
    );
    // A different day column uses the fallback limit — no tint there.
    expect(headers[2]).not.toHaveStyle({
      backgroundColor: thresholdTint(CAT_COLOR),
    });
  });

  it("gradients a column when two categories both reach", async () => {
    const second = {
      ...baseTask,
      id: 3,
      title: "Fold the laundry",
    };
    mockedListWeekTasks.mockResolvedValue([baseTask, second, weeklyTask]);
    mockedListTaskCategories.mockImplementation(async (id) => {
      if (id === baseTask.id) return [WORK_CAT];
      if (id === second.id)
        return [
          categoryFixture({
            id: 12,
            threshold_minutes: 60,
            threshold_color: OTHER_COLOR,
          }),
        ];
      return [];
    });
    renderBoard();
    const headers = await screen.findAllByRole("columnheader");
    await waitFor(() =>
      expect(headers[1]).toHaveStyle({
        backgroundImage: `linear-gradient(to bottom, ${thresholdTint(CAT_COLOR)}, ${thresholdTint(OTHER_COLOR)})`,
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

  it("opens the create-task dialog from the header and closes it", async () => {
    renderBoard();
    fireEvent.click(
      await screen.findByRole("button", { name: ADD_TASK_LABEL }),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: CLOSE_LABEL }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});

describe("drag and drop", () => {
  const dragEnd = (taskId: number, cell: string) =>
    capturedDragEnd({ active: { id: taskId }, over: { id: cell } });

  it("dropping on a day cell moves placement, date and status together", async () => {
    renderBoard();
    await screen.findByText(TASK_TITLE);

    dragEnd(weeklyTask.id, `${days[1]}|${TaskStatus.InProgress}`);

    await waitFor(() =>
      expect(mockedBoardMove).toHaveBeenCalledWith(
        weeklyTask.id,
        TaskPlacement.WeeklyBacklog,
        days[1],
        TaskStatus.InProgress,
      ),
    );
  });

  it("dropping on the weekly backlog clears the date", async () => {
    renderBoard();
    await screen.findByText(TASK_TITLE);

    dragEnd(baseTask.id, `weekly-backlog|${TaskStatus.Done}`);

    await waitFor(() =>
      expect(mockedBoardMove).toHaveBeenCalledWith(
        baseTask.id,
        TaskPlacement.WeeklyBacklog,
        null,
        TaskStatus.Done,
      ),
    );
  });

  it("a drop on the same cell is a no-op", async () => {
    renderBoard();
    await screen.findByText(TASK_TITLE);

    dragEnd(baseTask.id, `${baseTask.scheduled_date}|${baseTask.status}`);

    expect(mockedBoardMove).not.toHaveBeenCalled();
  });

  it("a rejected drop surfaces its typed error", async () => {
    mockedBoardMove.mockRejectedValueOnce(
      new ApiError("instance_date_occupied", "validation", "occupied"),
    );
    renderBoard();
    await screen.findByText(TASK_TITLE);

    dragEnd(baseTask.id, `${days[1]}|${TaskStatus.Todo}`);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        INSTANCE_DATE_OCCUPIED_MESSAGE,
      ),
    );
  });
});

test("the layout toggle swaps rows and columns and persists the choice", async () => {
  renderBoard();

  // Default: day headers, status rows (spec §368 — normal is default).
  await waitFor(() =>
    expect(
      screen.getByRole("columnheader", {
        name: new RegExp(shortWeekdayLabel(days[0])),
      }),
    ).toBeInTheDocument(),
  );
  // The profile query must settle before the seed effect does —
  // toggling earlier would be re-read from the per-profile key.
  await waitFor(() => expect(mockedCurrentProfile).toHaveBeenCalled());

  fireEvent.click(screen.getByRole("button", { name: TRANSPOSE_LAYOUT_LABEL }));
  // Transposed: statuses become column headers, days become rowheaders.
  await waitFor(() => {
    expect(
      screen.getByRole("columnheader", { name: STATUS_LABELS.todo }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("rowheader", {
        name: new RegExp(shortWeekdayLabel(days[0])),
      }),
    ).toBeInTheDocument();
  });
  expect(localStorage.getItem("meander.boardLayout./data/main.db.1")).toBe(
    BoardLayout.DayRows,
  );

  // Toggling back restores the default orientation.
  fireEvent.click(screen.getByRole("button", { name: TRANSPOSE_LAYOUT_LABEL }));
  await waitFor(() =>
    expect(
      screen.getByRole("columnheader", {
        name: new RegExp(shortWeekdayLabel(days[0])),
      }),
    ).toBeInTheDocument(),
  );
});

test("transposed on mount when the saved layout is day-rows", async () => {
  localStorage.setItem(
    "meander.boardLayout./data/main.db.1",
    BoardLayout.DayRows,
  );
  renderBoard();

  await waitFor(() => {
    // 8 rowheaders — weekly backlog plus the seven days — and the
    // three statuses as column headers.
    expect(screen.getAllByRole("rowheader")).toHaveLength(8);
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
  });
});

it("dropping in the transposed grid sends the same combined move", async () => {
  localStorage.setItem(
    "meander.boardLayout./data/main.db.1",
    BoardLayout.DayRows,
  );
  renderBoard();
  await screen.findByText(TASK_TITLE);

  capturedDragEnd({
    active: { id: weeklyTask.id },
    over: { id: `${days[1]}|${TaskStatus.InProgress}` },
  });

  await waitFor(() =>
    expect(mockedBoardMove).toHaveBeenCalledWith(
      weeklyTask.id,
      TaskPlacement.WeeklyBacklog,
      days[1],
      TaskStatus.InProgress,
    ),
  );
});
