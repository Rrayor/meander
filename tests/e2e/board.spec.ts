import { COMMANDS } from "@/api/commands";
import { TaskPlacement, TaskStatus, Weekday } from "@/lib/enums";
import {
  BOARD_HEADING,
  WEEKLY_BACKLOG_LABEL,
  STATUS_LABELS,
  boardWeekRangeLabel,
  dayTotalsLabel,
  editTaskLabel,
  shortWeekdayLabel,
  taskCountLabel,
} from "@/lib/labels";
import { todayLocalIso, weekDates } from "@/lib/utils";

import { expect, test } from "./fixtures";
import { stubTauriCommands } from "./stubs";

const todayIso = todayLocalIso();
const days = weekDates(todayIso, Weekday.Monday);

const baseTask = {
  profile_id: 1,
  description: null,
  carry_over_rule: null,
  estimated_minutes: 60,
  spent_minutes: null,
  series_id: null,
  sort_order: 1,
  created_at: "2026-10-01 08:00:00",
  updated_at: "2026-10-01 08:00:00",
};

const backlogTask = {
  ...baseTask,
  id: 1,
  title: "Unassigned errand",
  status: TaskStatus.Todo,
  placement: TaskPlacement.WeeklyBacklog,
  scheduled_date: null,
};
const mondayTask = {
  ...baseTask,
  id: 2,
  title: "Monday chore",
  status: TaskStatus.InProgress,
  placement: TaskPlacement.Scheduled,
  scheduled_date: days[0],
  spent_minutes: 30,
};

const current = { id: 1, name: "Me", week_start: "monday" };

const stubBoard = (page: import("@playwright/test").Page) =>
  stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTaskSeries]: [],
    [COMMANDS.listSeriesInstances]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTasks]: [],
    [COMMANDS.weekStart]: "monday",
    [COMMANDS.listWeekTasks]: [backlogTask, mondayTask],
    [COMMANDS.listTaskCategories]: [],
  });

test("the board renders the weekly backlog, day columns, and state rows", async ({
  page,
}) => {
  await stubBoard(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: BOARD_HEADING }),
  ).toBeVisible();
  await expect(
    page.getByText(boardWeekRangeLabel(days[0], days[6])),
  ).toBeVisible();
  for (const day of days) {
    await expect(
      page.getByRole("columnheader", {
        name: new RegExp(`${shortWeekdayLabel(day)}`),
      }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("columnheader", { name: new RegExp(WEEKLY_BACKLOG_LABEL) }),
  ).toBeVisible();
  for (const status of Object.values(STATUS_LABELS)) {
    await expect(page.getByRole("rowheader", { name: status })).toBeVisible();
  }

  // Cards land in their column and row; totals reflect the fixtures.
  const card = page.getByRole("button", {
    name: editTaskLabel(mondayTask.title),
  });
  await expect(card).toBeVisible();
  await expect(
    page.getByRole("columnheader", {
      name: new RegExp(`${shortWeekdayLabel(days[0])}.*${taskCountLabel(1)}`),
    }),
  ).toBeVisible();
  await expect(
    page.getByText(`${taskCountLabel(2)} · ${dayTotalsLabel(120, 30)}`),
  ).toBeVisible();
});

test("clicking a board card opens the task details view", async ({ page }) => {
  await stubBoard(page);
  await page.goto("/");

  await page
    .getByRole("button", { name: editTaskLabel(backlogTask.title) })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: backlogTask.title }),
  ).toBeVisible();
});
