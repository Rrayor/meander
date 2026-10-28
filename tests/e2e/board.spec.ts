import { COMMANDS } from "@/api/commands";
import { TaskPlacement, TaskStatus, Weekday } from "@/lib/enums";
import {
  CALENDAR_NEXT_LABEL,
  CARRY_OVER_DISMISS_LABEL,
  BOARD_HEADING,
  BOARD_NEXT_WEEK_LABEL,
  BOARD_PREVIOUS_WEEK_LABEL,
  BOARD_THIS_WEEK_LABEL,
  EDIT_BUTTON_LABEL,
  SAVE_BUTTON_LABEL,
  STATUS_LABELS,
  THRESHOLD_COLOR_DEFAULT,
  WEEKLY_BACKLOG_LABEL,
  boardWeekRangeLabel,
  dayTotalsLabel,
  editTaskLabel,
  shortDateLabel,
  shortWeekdayLabel,
  taskCountLabel,
} from "@/lib/labels";

import { formatIsoDay, shiftDays, todayLocalIso, weekDates } from "@/lib/utils";

import { expect, test } from "./fixtures";
import {
  getInvocations,
  stubError,
  stubSequence,
  stubTauriCommands,
} from "./stubs";

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

test("the previous-week arrow shows a past board without the weekly backlog", async ({
  page,
}) => {
  await stubBoard(page);
  await page.goto("/");

  const backlog = page.getByRole("columnheader", {
    name: new RegExp(WEEKLY_BACKLOG_LABEL),
  });
  await expect(backlog).toBeVisible();
  const next = page.getByRole("button", { name: BOARD_NEXT_WEEK_LABEL });
  await expect(next).toBeEnabled();

  await page.getByRole("button", { name: BOARD_PREVIOUS_WEEK_LABEL }).click();

  // The weekly backlog is current-week state — past boards show day
  // columns only (spec §336/§354).
  await expect(backlog).toBeHidden();
  const prior = weekDates(shiftDays(days[0], -7), Weekday.Monday);
  await expect(
    page.getByText(boardWeekRangeLabel(prior[0], prior[6])),
  ).toBeVisible();
  await expect(next).toBeEnabled();
});

test("This week jumps straight back to the current board", async ({ page }) => {
  await stubBoard(page);
  await page.goto("/");

  const backlog = page.getByRole("columnheader", {
    name: new RegExp(WEEKLY_BACKLOG_LABEL),
  });
  const thisWeek = page.getByRole("button", { name: BOARD_THIS_WEEK_LABEL });
  await expect(backlog).toBeVisible();
  await expect(thisWeek).toBeDisabled();

  await page.getByRole("button", { name: BOARD_PREVIOUS_WEEK_LABEL }).click();
  await expect(backlog).toBeHidden();
  await expect(thisWeek).toBeEnabled();

  await thisWeek.click();
  await expect(backlog).toBeVisible();
  await expect(thisWeek).toBeDisabled();
});

test("the calendar jumps the board to a picked past week", async ({ page }) => {
  await stubBoard(page);
  await page.goto("/");

  const backlog = page.getByRole("columnheader", {
    name: new RegExp(WEEKLY_BACKLOG_LABEL),
  });
  await expect(backlog).toBeVisible();

  await page
    .getByRole("button", { name: boardWeekRangeLabel(days[0], days[6]) })
    .click();
  const prior = weekDates(shiftDays(days[0], -14), Weekday.Monday);
  await page.getByRole("button", { name: formatIsoDay(prior[0]) }).click();

  await expect(backlog).toBeHidden();
  await expect(
    page.getByText(boardWeekRangeLabel(prior[0], prior[6])),
  ).toBeVisible();
});

test("the calendar popover closes on Escape and outside click", async ({
  page,
}) => {
  await stubBoard(page);
  await page.goto("/");

  const trigger = page.getByRole("button", {
    name: boardWeekRangeLabel(days[0], days[6]),
  });
  const popover = page.getByRole("dialog");
  await trigger.click();
  await expect(popover).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();

  await trigger.click();
  await expect(popover).toBeVisible();
  await page.locator(".fixed.inset-0").click({ position: { x: 1, y: 1 } });
  await expect(popover).toBeHidden();
});

test("the calendar jumps the board to a picked future week", async ({
  page,
}) => {
  await stubBoard(page);
  await page.goto("/");

  const backlog = page.getByRole("columnheader", {
    name: new RegExp(WEEKLY_BACKLOG_LABEL),
  });
  await expect(backlog).toBeVisible();

  await page
    .getByRole("button", { name: boardWeekRangeLabel(days[0], days[6]) })
    .click();
  const future = weekDates(shiftDays(days[0], 14), Weekday.Monday);
  // +14 days can land in a later month — navigate the calendar until
  // the target day is rendered before picking it.
  const target = page.getByRole("button", { name: formatIsoDay(future[0]) });
  for (let i = 0; i < 6 && !(await target.isVisible()); i++) {
    await page.getByRole("button", { name: CALENDAR_NEXT_LABEL }).click();
  }
  await target.click();

  // Future boards show day columns only (spec §336/§354).
  await expect(backlog).toBeHidden();
  await expect(
    page.getByText(boardWeekRangeLabel(future[0], future[6])),
  ).toBeVisible();
});

test("the carry-over prompt lists undecided tasks and applies the choice", async ({
  page,
}) => {
  const stray = { ...mondayTask, id: 9, title: "Leftover" };
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTaskSeries]: [],
    [COMMANDS.listSeriesInstances]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTasks]: [],
    [COMMANDS.weekStart]: "monday",
    [COMMANDS.listWeekTasks]: [backlogTask, mondayTask],
    [COMMANDS.listTaskCategories]: [],
    [COMMANDS.listPendingCarryOver]: [stray],
    [COMMANDS.resolveCarryOver]: null,
  });
  await page.goto("/");

  const prompt = page.getByRole("dialog", { name: /week started/i });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByText("Leftover")).toBeVisible();

  // Apply stays disabled until every listed task has a decision.
  const apply = prompt.getByRole("button", { name: "Apply decisions" });
  await expect(apply).toBeDisabled();
  await prompt.getByRole("button", { name: "Carry over" }).click();
  await apply.click();
  await expect(prompt).toBeHidden();
});

test("the carry-over prompt sends a return decision to the backend", async ({
  page,
}) => {
  const stray = { ...mondayTask, id: 9, title: "Leftover" };
  const dismissed = { ...mondayTask, id: 10, title: "Dropped" };
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTaskSeries]: [],
    [COMMANDS.listSeriesInstances]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTasks]: [],
    [COMMANDS.weekStart]: "monday",
    [COMMANDS.listWeekTasks]: [backlogTask, mondayTask],
    [COMMANDS.listTaskCategories]: [],
    [COMMANDS.listPendingCarryOver]: [stray, dismissed],
    [COMMANDS.resolveCarryOver]: null,
    [COMMANDS.deleteTask]: null,
  });
  await page.goto("/");

  const prompt = page.getByRole("dialog", { name: /week started/i });
  await prompt
    .getByRole("listitem")
    .filter({ hasText: "Leftover" })
    .getByRole("button", { name: "Backlog" })
    .click();
  // Dismiss is a per-task outcome — it deletes the task outright.
  await prompt
    .getByRole("listitem")
    .filter({ hasText: "Dropped" })
    .getByRole("button", { name: CARRY_OVER_DISMISS_LABEL })
    .click();
  await prompt.getByRole("button", { name: "Apply decisions" }).click();
  await expect(prompt).toBeHidden();
  const calls = await getInvocations(page);
  expect(
    calls.filter((c) => c.cmd === COMMANDS.resolveCarryOver).map((c) => c.args),
  ).toEqual([{ taskId: 9, rule: "return" }]);
  expect(
    calls.filter((c) => c.cmd === COMMANDS.deleteTask).map((c) => c.args),
  ).toEqual([{ taskId: 10 }]);
});

test("a day column tints when its estimates reach the threshold", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTaskSeries]: [],
    [COMMANDS.listSeriesInstances]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTasks]: [],
    [COMMANDS.weekStart]: "monday",
    [COMMANDS.listWeekTasks]: [backlogTask, mondayTask],
    [COMMANDS.listTaskCategories]: [],
    // 60m threshold vs the day's 60m total — reached, tinted per §287.
    [COMMANDS.globalThreshold]: { minutes: 60, color: THRESHOLD_COLOR_DEFAULT },
  });
  await page.goto("/");

  const monday = page.getByRole("columnheader", {
    name: new RegExp(shortWeekdayLabel(days[0])),
  });
  await expect(monday).toHaveCSS("background-color", /rgba\(248, 113, 113/);
  // The backlog column and under-threshold days stay untinted.
  await expect(
    page.getByRole("columnheader", { name: new RegExp(WEEKLY_BACKLOG_LABEL) }),
  ).not.toHaveCSS("background-color", /rgba\(248, 113, 113/);
});

test("a weekday override tints its own day only", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTaskSeries]: [],
    [COMMANDS.listSeriesInstances]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTasks]: [],
    [COMMANDS.weekStart]: "monday",
    [COMMANDS.listWeekTasks]: [backlogTask, mondayTask],
    [COMMANDS.listTaskCategories]: [],
    // Day-only threshold: monday has a 30m override — its 60m total
    // tints; every other day has no effective limit at all.
    [COMMANDS.globalThreshold]: {
      minutes: null,
      color: THRESHOLD_COLOR_DEFAULT,
      day_minutes: { [Weekday.Monday]: 30 },
    },
  });
  await page.goto("/");

  await expect(
    page.getByRole("columnheader", {
      name: new RegExp(shortWeekdayLabel(days[0])),
    }),
  ).toHaveCSS("background-color", /rgba\(248, 113, 113/);
  // The next day has no override and no global — untinted.
  await expect(
    page.getByRole("columnheader", {
      name: new RegExp(shortWeekdayLabel(days[1])),
    }),
  ).not.toHaveCSS("background-color", /rgba\(248, 113, 113/);
});
