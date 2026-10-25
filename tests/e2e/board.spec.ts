import { COMMANDS } from "@/api/commands";
import { TaskPlacement, TaskStatus, Weekday } from "@/lib/enums";
import {
  BOARD_HEADING,
  EDIT_BUTTON_LABEL,
  SAVE_BUTTON_LABEL,
  WEEKLY_BACKLOG_LABEL,
  STATUS_LABELS,
  boardWeekRangeLabel,
  dayTotalsLabel,
  editTaskLabel,
  shortDateLabel,
  shortWeekdayLabel,
  taskCountLabel,
} from "@/lib/labels";
import { todayLocalIso, weekDates } from "@/lib/utils";

import { expect, test } from "./fixtures";
import { stubError, stubSequence, stubTauriCommands } from "./stubs";

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

// The header row has a corner cell so each day header sits over its own
// data column — a card must render in the cell under the header naming
// its scheduled day, not the adjacent one.
test("a card renders in the cell under its day's column header", async ({
  page,
}) => {
  await stubBoard(page);
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: editTaskLabel(mondayTask.title) }),
  ).toBeVisible();
  const dayLabel = `${shortWeekdayLabel(days[0])} ${shortDateLabel(days[0])}`;
  const alignment = await page.evaluate(
    ({ dayLabel, cardLabel }) => {
      const header = [
        ...document.querySelectorAll<HTMLTableCellElement>("thead tr th"),
      ].find((th) => th.textContent?.includes(dayLabel));
      const cell = document
        .querySelector<HTMLButtonElement>(`button[aria-label="${cardLabel}"]`)
        ?.closest("td");
      return { headerIndex: header?.cellIndex, cellIndex: cell?.cellIndex };
    },
    { dayLabel, cardLabel: editTaskLabel(mondayTask.title) },
  );
  expect(alignment.cellIndex).toBe(alignment.headerIndex);
});

// A status change through the details view must refresh the board —
// the card moves rows without leaving the page.
test("a status edit moves the card to the matching row", async ({ page }) => {
  const boardTask = { ...mondayTask, status: TaskStatus.Todo };
  const progressed = { ...mondayTask, status: TaskStatus.Done };
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTaskSeries]: [],
    [COMMANDS.listSeriesInstances]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTasks]: [],
    [COMMANDS.weekStart]: "monday",
    [COMMANDS.listWeekTasks]: stubSequence([
      [backlogTask, boardTask],
      [backlogTask, progressed],
    ]),
    [COMMANDS.listTaskCategories]: [],
    [COMMANDS.updateTask]: progressed,
  });
  await page.goto("/");

  const todoRow = page.getByRole("row").filter({
    has: page.getByRole("rowheader", {
      name: STATUS_LABELS[TaskStatus.Todo],
    }),
  });
  await expect(
    todoRow.getByRole("button", {
      name: editTaskLabel(boardTask.title),
    }),
  ).toBeVisible();

  const dialog = page.getByRole("dialog");
  await page
    .getByRole("button", { name: editTaskLabel(boardTask.title) })
    .click();
  await dialog.getByRole("button", { name: EDIT_BUTTON_LABEL }).click();
  await dialog
    .getByRole("radio", { name: STATUS_LABELS[TaskStatus.Done] })
    .click();
  await dialog.getByRole("button", { name: SAVE_BUTTON_LABEL }).click();

  const doneRow = page.getByRole("row").filter({
    has: page.getByRole("rowheader", {
      name: STATUS_LABELS[TaskStatus.Done],
    }),
  });
  await expect(
    doneRow.getByRole("button", { name: editTaskLabel(boardTask.title) }),
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

test("the board orders columns from the configured week start", async ({
  page,
}) => {
  const wednesdayDays = weekDates(todayIso, Weekday.Wednesday);
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.currentProfile]: { ...current, week_start: "wednesday" },
    [COMMANDS.listTasks]: [],
    [COMMANDS.weekStart]: "wednesday",
    [COMMANDS.listWeekTasks]: [],
    [COMMANDS.listTaskCategories]: [],
  });
  await page.goto("/");

  await expect(
    page.getByText(boardWeekRangeLabel(wednesdayDays[0], wednesdayDays[6])),
  ).toBeVisible();
  const headers = page.getByRole("columnheader");
  await expect(headers.nth(1)).toContainText(
    shortWeekdayLabel(wednesdayDays[0]),
  );
  await expect(headers.nth(7)).toContainText(
    shortWeekdayLabel(wednesdayDays[6]),
  );
});

test("a failed board read surfaces an error alert", async ({ page }) => {
  const message = "the week listing failed";
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTasks]: [],
    [COMMANDS.weekStart]: Weekday.Monday,
    [COMMANDS.listWeekTasks]: stubError(message),
    [COMMANDS.listTaskCategories]: [],
  });
  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText(message);
});
