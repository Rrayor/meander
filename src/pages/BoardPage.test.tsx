import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { listTaskCategories } from "@/api/categories";
import { weekStart } from "@/api/profiles";
import type { Task } from "@/api/bindings";
import { listWeekTasks } from "@/api/tasks";
import { TaskPlacement, TaskStatus, Weekday } from "@/lib/enums";
import {
  STATUS_LABELS,
  WEEKLY_BACKLOG_LABEL,
  boardWeekRangeLabel,
  dayTotalsLabel,
  editTaskLabel,
  shortWeekdayLabel,
  taskCountLabel,
} from "@/lib/labels";
import { todayLocalIso, weekDates } from "@/lib/utils";
import { BoardPage } from "@/pages/BoardPage";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/tasks")>()),
  listWeekTasks: vi.fn(),
}));
vi.mock("@/api/profiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/profiles")>()),
  weekStart: vi.fn(),
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
const mockedWeekStart = vi.mocked(weekStart);
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
  mockedWeekStart.mockResolvedValue(Weekday.Monday);
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

  it("opens the task details dialog from a card", async () => {
    renderBoard();

    fireEvent.click(
      await screen.findByRole("button", {
        name: editTaskLabel(TASK_TITLE),
      }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
