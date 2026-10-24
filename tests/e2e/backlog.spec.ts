import { COMMANDS } from "@/api/commands";
import type {
  NewTask,
  Recurrence,
  UpdateSeries,
  UpdateTask,
} from "@/api/bindings";
import {
  CarryOverRule,
  RecurrenceKind,
  RepeatNth,
  RepeatUnit,
  TaskPlacement,
  TaskStatus,
  Weekday,
} from "@/lib/enums";
import {
  ADD_TASK_LABEL,
  CREATE_TASK_LABEL,
  EDIT_BUTTON_LABEL,
  NOTES_TAB_INSTANCE_LABEL,
  NOTES_TAB_SERIES_LABEL,
  NOTE_ADD_LABEL,
  NOTE_COMPOSER_PLACEHOLDER,
  NOTE_SAVE_LABEL,
  NOTES_EMPTY_MESSAGE,
  noteConfirmDeleteLabel,
  noteDeleteLabel,
  noteEditLabel,
  SCHEDULED_INSTANCE_PENDING_MESSAGE,
  CALENDAR_NEXT_LABEL,
  REPEAT_DAY_OF_MONTH_LABEL,
  REPEAT_ENDS_BEFORE_START_MESSAGE,
  REPEAT_ENDS_LABEL,
  REPEAT_NTH_OPTIONS,
  REPEAT_ON_THE_LABEL,
  REPEAT_SECTION_LABEL,
  REPEAT_UNIT_OPTIONS,
  WEEKDAY_OPTIONS,
  SAVE_BUTTON_LABEL,
  DELETE_BUTTON_LABEL,
  DELETE_SCOPE_FUTURE_LABEL,
  DELETE_TASK_HEADING,
  TASK_SCOPE_FUTURE_LABEL,
  TASK_SCOPE_SERIES_LABEL,
  deleteTaskLabel,
  editTaskLabel,
  EMPTY_BACKLOG_MESSAGE,
  ESTIMATED_HOURS_LABEL,
  ESTIMATED_MINUTES_LABEL,
  STATUS_LABELS,
  TITLE_REQUIRED_MESSAGE,
  formatMinutes,
  reorderLabel,
} from "@/lib/labels";
import {
  INSTANCE_DATE_NOT_SCHEDULED_MESSAGE,
  NOTE_BODY_TOO_LONG_MESSAGE,
} from "@/lib/errors";
import { ROUTES } from "@/lib/routes";

import { WEEKDAYS_BY_JS_DAY } from "@/lib/utils";

import { expect, test } from "./fixtures";
import type { Locator } from "@playwright/test";
import {
  getInvocations,
  stubApiError,
  stubSequence,
  stubTauriCommands,
} from "./stubs";

const TITLE_DRAFT_NOTES = "Draft weekly reflection notes";
const WEEK_UNIT = REPEAT_UNIT_OPTIONS.find((o) => o.value === RepeatUnit.Week)!;
const MONTH_UNIT = REPEAT_UNIT_OPTIONS.find(
  (o) => o.value === RepeatUnit.Month,
)!;
const FRIDAY = WEEKDAY_OPTIONS.find((w) => w.value === Weekday.Friday)!;
const NTH_SECOND = REPEAT_NTH_OPTIONS.find(
  (o) => o.value === RepeatNth.Second,
)!;
const REJECTION_MESSAGE = "schedule could not be understood";
const TITLE_MILESTONE = "Review quarterly milestone planning";

const backlogPath = ROUTES.find((r) => r.label === "Backlog")!.path;

const current = {
  id: 1,
  name: "Default",
  created_at: "2026-10-01 08:00:00",
  updated_at: "2026-10-10 09:14:00",
};

const tasks = [
  {
    id: 1,
    profile_id: 1,
    title: TITLE_DRAFT_NOTES,
    description: null,
    status: TaskStatus.Todo,
    carry_over_rule: null,
    estimated_minutes: 45,
    spent_minutes: null,
    placement: TaskPlacement.Backlog,
    scheduled_date: null,
    series_id: null,
    created_at: "2026-10-10 09:00:00",
    updated_at: "2026-10-10 09:00:00",
  },
  {
    id: 2,
    profile_id: 1,
    title: TITLE_MILESTONE,
    description: "Flag risks early",
    status: TaskStatus.InProgress,
    carry_over_rule: CarryOverRule.Carry,
    estimated_minutes: 180,
    spent_minutes: 30,
    placement: TaskPlacement.Backlog,
    scheduled_date: null,
    series_id: null,
    created_at: "2026-10-11 10:00:00",
    updated_at: "2026-10-11 10:00:00",
  },
];

test("backlog lists tasks with status and estimate", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: tasks,
    [COMMANDS.currentProfile]: current,
  });
  await page.goto(`/#${backlogPath}`);

  await expect(page.getByText(TITLE_DRAFT_NOTES)).toBeVisible();
  await expect(page.getByText(TITLE_MILESTONE)).toBeVisible();
  await expect(page.getByText(formatMinutes(45))).toBeVisible();
  await expect(page.getByText(formatMinutes(180))).toBeVisible();
  await expect(page.getByText(STATUS_LABELS.in_progress)).toBeVisible();
});

test("an empty backlog shows the empty state", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
  });
  await page.goto(`/#${backlogPath}`);

  await expect(page.getByText(EMPTY_BACKLOG_MESSAGE)).toBeVisible();
});

test("creating a task via the dialog adds it to the backlog", async ({
  page,
}) => {
  const created = {
    ...tasks[0],
    id: 3,
    title: "Plan the week",
    description: "Outline priorities",
    estimated_minutes: 90,
  };
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: stubSequence([[], [created]]),
    [COMMANDS.currentProfile]: current,
    [COMMANDS.createTask]: created,
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Title/).fill("  Plan the week  ");
  await dialog.getByLabel(/Description/).fill("Outline priorities");
  await dialog.getByLabel(ESTIMATED_HOURS_LABEL).fill("1");
  await dialog.getByLabel(ESTIMATED_MINUTES_LABEL).fill("30");
  await dialog.getByRole("button", { name: CREATE_TASK_LABEL }).click();

  await expect(page.getByText("Plan the week")).toBeVisible();
  await expect(dialog).not.toBeVisible();
});

test("creating a task with a category sends the association", async ({
  page,
}) => {
  const errands = { id: 1, title: "Errands", color: "#2dd4bf" };
  const created = { ...tasks[0], id: 3 };
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: stubSequence([[], [created]]),
    [COMMANDS.currentProfile]: current,
    [COMMANDS.createTask]: created,
    [COMMANDS.listCategories]: [errands],
    [COMMANDS.addTaskCategory]: null,
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").focus();
  await dialog
    .getByRole("option", { name: /Errands/ })
    .dispatchEvent("mousedown");
  await expect(
    dialog.getByRole("button", { name: "Remove Errands" }),
  ).toBeVisible();
  await dialog.getByLabel(/^Title/).fill("Groceries");
  await dialog.getByRole("button", { name: CREATE_TASK_LABEL }).click();
  const addCall = (await getInvocations(page)).find(
    (c) => c.cmd === COMMANDS.addTaskCategory,
  );
  expect(addCall?.args).toEqual({ taskId: 3, categoryId: errands.id });
});

test("a blank title shows validation without calling the backend", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
    // createTask intentionally unstubbed: a call would throw.
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: CREATE_TASK_LABEL }).click();

  await expect(dialog.getByRole("alert")).toHaveText(TITLE_REQUIRED_MESSAGE);
});

test("a blurred title shows validation before submit", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
    // createTask intentionally unstubbed: a call would throw.
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  const title = dialog.getByLabel(/Title/);
  await title.focus();
  await title.blur();

  await expect(dialog.getByRole("alert")).toHaveText(TITLE_REQUIRED_MESSAGE);
});

test("an out-of-range estimate shows validation on blur", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
    // createTask intentionally unstubbed: a call would throw.
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  const hours = dialog.getByLabel(ESTIMATED_HOURS_LABEL);
  await hours.fill("30");
  await hours.blur();

  await expect(dialog.locator("#new-task-estimate-error")).toHaveText(
    /24 hours/,
  );
});

test("the dialog closes on Escape without creating a task", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
    // createTask intentionally unstubbed: a call would throw.
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Title/).fill("Abandoned");
  await page.keyboard.press("Escape");

  await expect(dialog).not.toBeVisible();
});

test("the dialog closes on backdrop click and on Cancel", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await page.mouse.click(10, 10); // backdrop, top-left corner
  await expect(dialog).not.toBeVisible();

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).not.toBeVisible();
});

test("backend validation errors surface in the dialog", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.createTask]: stubApiError(
      "task_title_invalid_characters",
      "validation",
      "task title cannot contain control characters",
    ),
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Title/).fill("Trigger backend rejection");
  await dialog.getByRole("button", { name: CREATE_TASK_LABEL }).click();

  await expect(dialog.getByRole("alert")).toHaveText(
    "Task title cannot contain control characters",
  );
  await expect(dialog).toBeVisible(); // dialog stays open for correction
});

test("the estimate pair sends combined minutes on the wire", async ({
  page,
}) => {
  const created = { ...tasks[0], id: 3, estimated_minutes: 90 };
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: stubSequence([[], [created]]),
    [COMMANDS.currentProfile]: current,
    [COMMANDS.createTask]: created,
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Title/).fill("Timed task");
  await dialog.getByLabel(ESTIMATED_HOURS_LABEL).fill("1");
  await dialog.getByLabel(ESTIMATED_MINUTES_LABEL).fill("30");
  await dialog.getByRole("radio", { name: "Carry over" }).click();
  await dialog.getByRole("button", { name: CREATE_TASK_LABEL }).click();

  const createCall = (await getInvocations<{ input: NewTask }>(page)).find(
    (c) => c.cmd === COMMANDS.createTask,
  );
  expect(createCall?.args).toEqual({
    input: {
      title: "Timed task",
      description: null,
      estimated_minutes: 90,
      carry_over_rule: CarryOverRule.Carry,
      series: null,
    },
  });
});

test("minutes alone can exceed the 24-hour limit", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  const minutes = dialog.getByLabel(ESTIMATED_MINUTES_LABEL);
  await minutes.fill("1441");
  await minutes.blur();

  await expect(dialog.locator("#new-task-estimate-error")).toHaveText(
    /24 hours/,
  );
});

test("dragging a task reorders the backlog", async ({ page }) => {
  const reordered = [tasks[1], tasks[0]];
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: stubSequence([tasks, reordered]),
    [COMMANDS.currentProfile]: current,
    [COMMANDS.moveTask]: null,
  });
  await page.goto(`/#${backlogPath}`);

  const rows = page.locator("ul > li");
  const source = page.getByLabel(reorderLabel(TITLE_MILESTONE));
  const target = page.getByLabel(reorderLabel(TITLE_DRAFT_NOTES));
  const sourceBox = (await source.boundingBox())!;
  const targetBox = (await target.boundingBox())!;
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y - 10, {
    steps: 5,
  });
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();

  await expect(rows.first()).toContainText(TITLE_MILESTONE);
});

test("deleting a task removes it from the backlog", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: stubSequence([tasks, [tasks[1]]]),
    [COMMANDS.currentProfile]: current,
    [COMMANDS.deleteTask]: null,
  });
  await page.goto(`/#${backlogPath}`);

  await page
    .getByRole("button", { name: deleteTaskLabel(TITLE_DRAFT_NOTES) })
    .click();

  await expect(page.getByText(TITLE_DRAFT_NOTES)).not.toBeVisible();
  await expect(page.getByText(TITLE_MILESTONE)).toBeVisible();

  const deleteCall = (await getInvocations(page)).find(
    (c) => c.cmd === COMMANDS.deleteTask,
  );
  expect(deleteCall?.args).toEqual({ taskId: tasks[0].id });
});

test("editing a task updates the backlog row", async ({ page }) => {
  const updated = {
    ...tasks[0],
    title: TITLE_MILESTONE + " follow-up",
    status: TaskStatus.InProgress,
  };
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: stubSequence([tasks, [updated, tasks[1]]]),
    [COMMANDS.currentProfile]: current,
    [COMMANDS.updateTask]: updated,
    [COMMANDS.listTaskCategories]: [],
  });
  await page.goto(`/#${backlogPath}`);

  const titleButton = page.getByRole("button", {
    name: editTaskLabel(TITLE_DRAFT_NOTES),
  });
  await expect(titleButton).toHaveCSS("cursor", "pointer");
  await titleButton.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: EDIT_BUTTON_LABEL }).click();
  await expect(dialog.getByLabel(/Title/)).toHaveValue(TITLE_DRAFT_NOTES);
  await dialog.getByLabel(/Title/).fill(`${TITLE_MILESTONE} follow-up`);
  await dialog.getByRole("radio", { name: STATUS_LABELS.in_progress }).click();
  await dialog.getByRole("button", { name: SAVE_BUTTON_LABEL }).click();

  await expect(page.getByText(`${TITLE_MILESTONE} follow-up`)).toBeVisible();

  const updateCall = (await getInvocations<{ input: UpdateTask }>(page)).find(
    (c) => c.cmd === COMMANDS.updateTask,
  );
  expect(updateCall?.args).toEqual({
    taskId: tasks[0].id,
    input: {
      title: `${TITLE_MILESTONE} follow-up`,
      description: null,
      estimated_minutes: 45,
      spent_minutes: null,
      carry_over_rule: null,
      status: TaskStatus.InProgress,
      series: null,
    },
  });
});

test("creating a repeating task sends the series payload", async ({ page }) => {
  const created = { ...tasks[0], id: 3, series_id: 1 };
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: stubSequence([[], [created]]),
    [COMMANDS.currentProfile]: current,
    [COMMANDS.createTask]: created,
    [COMMANDS.listCategories]: [],
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Title/).fill("Weekly review");
  await dialog
    .getByRole("button", { name: new RegExp(REPEAT_SECTION_LABEL) })
    .click();
  await dialog.getByRole("button", { name: WEEK_UNIT.label }).click();
  // exact: the expanded toggle's summary also contains the weekday name.
  await dialog.getByRole("button", { name: FRIDAY.label, exact: true }).click();
  await dialog.getByLabel(REPEAT_ENDS_LABEL).fill("2027-01-01");
  await dialog.getByRole("button", { name: CREATE_TASK_LABEL }).click();

  const createCall = (await getInvocations<{ input: NewTask }>(page)).find(
    (c) => c.cmd === COMMANDS.createTask,
  );
  const { recurrence, end_date } = createCall!.args.input.series!;
  const weekly = recurrence as Extract<
    Recurrence,
    { kind: `${RecurrenceKind.Weekly}` }
  >;
  expect(weekly.kind).toBe(RecurrenceKind.Weekly);
  expect(weekly.interval_weeks).toBe(1);
  // The weekday set is today's weekday (auto-synced to the start date)
  // plus the Friday the user picked.
  expect(new Set(weekly.weekdays)).toEqual(
    new Set([WEEKDAYS_BY_JS_DAY[new Date().getDay()], Weekday.Friday]),
  );
  expect(end_date).toBe("2027-01-01");
  expect(createCall?.args.input.series?.start_date).toMatch(
    /^\d{4}-\d{2}-\d{2}$/,
  );
});

test("an invalid repeat schedule keeps the dialog open without a call", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
    // createTask intentionally unstubbed: a call would throw.
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Title/).fill("Backwards repeat");
  await dialog
    .getByRole("button", { name: new RegExp(REPEAT_SECTION_LABEL) })
    .click();
  await dialog.getByLabel(REPEAT_ENDS_LABEL).fill("2020-01-01");

  await expect(
    dialog.getByText(REPEAT_ENDS_BEFORE_START_MESSAGE),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: CREATE_TASK_LABEL }),
  ).toBeDisabled();
  await expect(dialog).toBeVisible();
});

test("a monthly nth-weekday repeat sends the mapped recurrence", async ({
  page,
}) => {
  const created = { ...tasks[0], id: 3, series_id: 1 };
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: stubSequence([[], [created]]),
    [COMMANDS.currentProfile]: current,
    [COMMANDS.createTask]: created,
    [COMMANDS.listCategories]: [],
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Title/).fill("Monthly sync");
  await dialog
    .getByRole("button", { name: new RegExp(REPEAT_SECTION_LABEL) })
    .click();
  await dialog.getByRole("button", { name: MONTH_UNIT.label }).click();
  await dialog.getByRole("radio", { name: REPEAT_ON_THE_LABEL }).click();
  await dialog.getByRole("button", { name: NTH_SECOND.aria }).click();
  await dialog.getByRole("button", { name: FRIDAY.label, exact: true }).click();
  await dialog.getByRole("button", { name: CREATE_TASK_LABEL }).click();

  const createCall = (await getInvocations<{ input: NewTask }>(page)).find(
    (c) => c.cmd === COMMANDS.createTask,
  );
  expect(createCall?.args.input.series?.recurrence).toEqual({
    kind: RecurrenceKind.MonthlyNthWeekday,
    interval_months: 1,
    nth: 2,
    weekday: Weekday.Friday,
  });
});

test("a monthly day repeat sends the picked day and interval", async ({
  page,
}) => {
  const created = { ...tasks[0], id: 3, series_id: 1 };
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: stubSequence([[], [created]]),
    [COMMANDS.currentProfile]: current,
    [COMMANDS.createTask]: created,
    [COMMANDS.listCategories]: [],
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Title/).fill("Quarterly-ish");
  await dialog
    .getByRole("button", { name: new RegExp(REPEAT_SECTION_LABEL) })
    .click();
  await dialog.getByLabel(/Every/).fill("3");
  await dialog.getByRole("button", { name: MONTH_UNIT.label }).click();
  await dialog.getByLabel(REPEAT_DAY_OF_MONTH_LABEL).fill("15");
  await dialog.getByRole("button", { name: CREATE_TASK_LABEL }).click();

  const createCall = (await getInvocations<{ input: NewTask }>(page)).find(
    (c) => c.cmd === COMMANDS.createTask,
  );
  expect(createCall?.args.input.series?.recurrence).toEqual({
    kind: RecurrenceKind.MonthlyDay,
    interval_months: 3,
    day: 15,
  });
});

test("a typed schedule rejection surfaces in the dialog", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.createTask]: stubApiError(
      "recurrence_invalid",
      "validation",
      REJECTION_MESSAGE,
    ),
    [COMMANDS.listCategories]: [],
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Title/).fill("Rejected repeat");
  await dialog
    .getByRole("button", { name: new RegExp(REPEAT_SECTION_LABEL) })
    .click();
  await dialog.getByRole("button", { name: CREATE_TASK_LABEL }).click();

  await expect(dialog.getByRole("alert")).toHaveText(REJECTION_MESSAGE);
  await expect(dialog).toBeVisible();
});

test("attaching a schedule while editing sends the series payload", async ({
  page,
}) => {
  const updated = { ...tasks[0], series_id: 1 };
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: stubSequence([tasks, [updated, tasks[1]]]),
    [COMMANDS.currentProfile]: current,
    [COMMANDS.updateTask]: updated,
    [COMMANDS.listTaskCategories]: [],
  });
  await page.goto(`/#${backlogPath}`);

  await page
    .getByRole("button", { name: editTaskLabel(TITLE_DRAFT_NOTES) })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: EDIT_BUTTON_LABEL }).click();
  await dialog
    .getByRole("button", { name: new RegExp(REPEAT_SECTION_LABEL) })
    .click();
  await dialog.getByRole("button", { name: SAVE_BUTTON_LABEL }).click();

  const updateCall = (await getInvocations<{ input: UpdateTask }>(page)).find(
    (c) => c.cmd === COMMANDS.updateTask,
  );
  expect(updateCall?.args.input.series).toMatchObject({
    recurrence: { kind: RecurrenceKind.Daily, interval_days: 1 },
    end_date: null,
  });
});

test("the edit dialog hides the repeat section for a series instance", async ({
  page,
}) => {
  const linked = { ...tasks[0], series_id: 1 };
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [linked],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTaskCategories]: [],
  });
  await page.goto(`/#${backlogPath}`);

  await page
    .getByRole("button", { name: editTaskLabel(TITLE_DRAFT_NOTES) })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: EDIT_BUTTON_LABEL }).click();
  await expect(
    dialog.getByRole("button", { name: new RegExp(REPEAT_SECTION_LABEL) }),
  ).not.toBeVisible();
});

const seriesFixture = {
  id: 7,
  profile_id: 1,
  title: TITLE_DRAFT_NOTES,
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
  created_at: "2026-10-11 10:00:00",
  updated_at: "2026-10-11 10:00:00",
};
// The opened instance must be a future occurrence — past instances are
// view-only (spec §232), and a fixed date would eventually age into the
// past and silently flip the dialog's editability.
const nextMondayIso = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
};
const shiftIsoDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const SERIES_OPENED = nextMondayIso();
const SERIES_PICK = shiftIsoDays(SERIES_OPENED, 7); // the following Monday
const seriesInstance = {
  ...tasks[0],
  series_id: seriesFixture.id,
  scheduled_date: SERIES_OPENED,
};
const SERIES_MONTH = new Date(`${SERIES_OPENED}T00:00:00Z`).toLocaleDateString(
  "en-US",
  { month: "long", year: "numeric", timeZone: "UTC" },
);
// A guaranteed-unscheduled day in the displayed month: its first Tuesday
// (the fixture recurs on Mondays only).
const UNSCHEDULED_DAY = (() => {
  const d = new Date(`${SERIES_OPENED}T00:00:00Z`);
  d.setUTCDate(1);
  while (d.getUTCDay() !== 2) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.getUTCDate();
})();

// Clicks a calendar date, navigating one month forward when the target
// spills into the next grid (a late-month Monday + one week).
const pickCalendarDate = async (dialog: Locator, iso: string) => {
  if ((await dialog.getByRole("button", { name: iso }).count()) === 0) {
    await dialog.getByRole("button", { name: CALENDAR_NEXT_LABEL }).click();
  }
  await dialog.getByRole("button", { name: iso }).click();
};

test("opening a task shows a read-only details view first", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [tasks[0]],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTaskCategories]: [],
  });
  await page.goto(`/#${backlogPath}`);

  await page
    .getByRole("button", { name: editTaskLabel(TITLE_DRAFT_NOTES) })
    .click();
  const dialog = page.getByRole("dialog");

  // Read-only: the only textbox is the notes composer — notes are handled
  // outside the task form, so they stay available in the view.
  await expect(dialog.getByRole("textbox")).toHaveCount(1);
  await expect(dialog.getByLabel(NOTE_COMPOSER_PLACEHOLDER)).toBeVisible();
  await expect(dialog.getByLabel(/Title/)).toHaveCount(0);
  await expect(
    dialog.getByRole("heading", { name: TITLE_DRAFT_NOTES }),
  ).toBeVisible();
  await expect(dialog.getByText(STATUS_LABELS.todo)).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: EDIT_BUTTON_LABEL }),
  ).toBeVisible();

  await dialog.getByRole("button", { name: EDIT_BUTTON_LABEL }).click();
  await expect(dialog.getByLabel(/Title/)).toHaveValue(TITLE_DRAFT_NOTES);
});

test("a series task shows audit info, calendar, and notes tabs", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [seriesInstance],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTaskCategories]: [],
    [COMMANDS.listTaskSeries]: [seriesFixture],
    [COMMANDS.listSeriesInstances]: [seriesInstance],
  });
  await page.goto(`/#${backlogPath}`);

  await page
    .getByRole("button", { name: editTaskLabel(TITLE_DRAFT_NOTES) })
    .click();
  const dialog = page.getByRole("dialog");

  await expect(dialog.getByText(/Repeats .* series created/)).toBeVisible();
  await expect(dialog.getByText(SERIES_MONTH)).toBeVisible();
  // Scheduled days carry the occurrence marker; unscheduled days don't.
  await expect(
    dialog
      .getByRole("button", { name: seriesInstance.scheduled_date! })
      .locator("[aria-hidden='true']"),
  ).toBeVisible();
  await expect(
    dialog
      .getByText(String(UNSCHEDULED_DAY), { exact: true })
      .locator("[aria-hidden='true']"),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("tab", { name: NOTES_TAB_INSTANCE_LABEL }),
  ).toHaveAttribute("aria-selected", "true");
  await dialog.getByRole("tab", { name: NOTES_TAB_SERIES_LABEL }).click();
  await expect(
    dialog.getByRole("tab", { name: NOTES_TAB_SERIES_LABEL }),
  ).toHaveAttribute("aria-selected", "true");
});

test("picking a scheduled date without an instance materializes it", async ({
  page,
}) => {
  const created = {
    ...seriesInstance,
    id: 88,
    description: "fresh occurrence",
    scheduled_date: SERIES_PICK,
  };
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [seriesInstance],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTaskCategories]: [],
    [COMMANDS.listTaskSeries]: [seriesFixture],
    [COMMANDS.listSeriesInstances]: [seriesInstance],
    [COMMANDS.getOrCreateInstance]: created,
  });
  await page.goto(`/#${backlogPath}`);

  await page
    .getByRole("button", { name: editTaskLabel(TITLE_DRAFT_NOTES) })
    .click();
  const dialog = page.getByRole("dialog");

  // The Monday after the opened one is scheduled but has no persisted
  // instance — picking it shows the pending panel without writing.
  await pickCalendarDate(dialog, SERIES_PICK);
  await expect(
    dialog.getByText(SCHEDULED_INSTANCE_PENDING_MESSAGE),
  ).toBeVisible();
  expect(
    (await getInvocations(page)).filter(
      (c) => c.cmd === COMMANDS.getOrCreateInstance,
    ),
  ).toHaveLength(0);

  // Only the explicit Edit click materializes the row.
  await dialog.getByRole("button", { name: EDIT_BUTTON_LABEL }).click();
  const call = (
    await getInvocations<{ seriesId: number; date: string }>(page)
  ).find((c) => c.cmd === COMMANDS.getOrCreateInstance);
  expect(call?.args).toMatchObject({
    seriesId: seriesFixture.id,
    date: SERIES_PICK,
  });
});

test("a rejected materialization keeps the pending panel and surfaces the error", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [seriesInstance],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTaskCategories]: [],
    [COMMANDS.listTaskSeries]: [seriesFixture],
    [COMMANDS.listSeriesInstances]: [seriesInstance],
    [COMMANDS.getOrCreateInstance]: stubApiError(
      "instance_date_not_scheduled",
      "validation",
      "the date is not a scheduled occurrence of this series",
    ),
  });
  await page.goto(`/#${backlogPath}`);

  await page
    .getByRole("button", { name: editTaskLabel(TITLE_DRAFT_NOTES) })
    .click();
  const dialog = page.getByRole("dialog");

  await pickCalendarDate(dialog, SERIES_PICK);
  await dialog.getByRole("button", { name: EDIT_BUTTON_LABEL }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    INSTANCE_DATE_NOT_SCHEDULED_MESSAGE,
  );
  await expect(
    dialog.getByText(SCHEDULED_INSTANCE_PENDING_MESSAGE),
  ).toBeVisible();
});

test("a series-scope save sends update_task_series with the schedule", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [seriesInstance],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTaskCategories]: [],
    [COMMANDS.listTaskSeries]: [seriesFixture],
    [COMMANDS.listSeriesInstances]: [seriesInstance],
    [COMMANDS.listSeriesCategories]: [],
    [COMMANDS.updateTaskSeries]: seriesFixture,
  });
  await page.goto(`/#${backlogPath}`);

  await page
    .getByRole("button", { name: editTaskLabel(TITLE_DRAFT_NOTES) })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: EDIT_BUTTON_LABEL }).click();
  await dialog.getByRole("radio", { name: TASK_SCOPE_SERIES_LABEL }).click();
  await dialog.getByRole("button", { name: SAVE_BUTTON_LABEL }).click();

  const call = (
    await getInvocations<{ seriesId: number; input: UpdateSeries }>(page)
  ).find((c) => c.cmd === COMMANDS.updateTaskSeries);
  expect(call?.args.seriesId).toBe(seriesFixture.id);
  expect(call?.args.input).toMatchObject({
    title: TITLE_DRAFT_NOTES,
    recurrence: seriesFixture.recurrence,
    start_date: seriesFixture.start_date,
    end_date: null,
    category_ids: [],
  });
  expect(
    (await getInvocations(page)).some((c) => c.cmd === COMMANDS.updateTask),
  ).toBe(false);
});

test("a this-and-future save splits the series at the viewed date", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [seriesInstance],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTaskCategories]: [],
    [COMMANDS.listTaskSeries]: [seriesFixture],
    [COMMANDS.listSeriesInstances]: [seriesInstance],
    [COMMANDS.listSeriesCategories]: [],
    [COMMANDS.updateTaskSeriesFrom]: {
      ...seriesFixture,
      id: 99,
      start_date: seriesInstance.scheduled_date,
    },
  });
  await page.goto(`/#${backlogPath}`);

  await page
    .getByRole("button", { name: editTaskLabel(TITLE_DRAFT_NOTES) })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: EDIT_BUTTON_LABEL }).click();
  await dialog.getByRole("radio", { name: TASK_SCOPE_FUTURE_LABEL }).click();
  await dialog.getByRole("button", { name: SAVE_BUTTON_LABEL }).click();

  const call = (
    await getInvocations<{
      seriesId: number;
      fromDate: string;
      input: UpdateSeries;
    }>(page)
  ).find((c) => c.cmd === COMMANDS.updateTaskSeriesFrom);
  expect(call?.args.seriesId).toBe(seriesFixture.id);
  // The split anchors on the viewed instance's date.
  expect(call?.args.fromDate).toBe(seriesInstance.scheduled_date);
  expect(call?.args.input).toMatchObject({
    title: TITLE_DRAFT_NOTES,
    recurrence: seriesFixture.recurrence,
  });
  expect(
    (await getInvocations(page)).some(
      (c) => c.cmd === COMMANDS.updateTaskSeries,
    ),
  ).toBe(false);
});

test("a rejected series-scope save surfaces the typed error", async ({
  page,
}) => {
  const SERIES_REJECT_MESSAGE = "the schedule is not a known rule";
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [seriesInstance],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTaskCategories]: [],
    [COMMANDS.listTaskSeries]: [seriesFixture],
    [COMMANDS.listSeriesInstances]: [seriesInstance],
    [COMMANDS.listSeriesCategories]: [],
    [COMMANDS.updateTaskSeries]: stubApiError(
      "recurrence_invalid",
      "validation",
      SERIES_REJECT_MESSAGE,
    ),
  });
  await page.goto(`/#${backlogPath}`);

  await page
    .getByRole("button", { name: editTaskLabel(TITLE_DRAFT_NOTES) })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: EDIT_BUTTON_LABEL }).click();
  await dialog.getByRole("radio", { name: TASK_SCOPE_SERIES_LABEL }).click();
  await dialog.getByRole("button", { name: SAVE_BUTTON_LABEL }).click();

  // The typed rejection reaches the dialog and keeps it open.
  await expect(dialog.getByRole("alert")).toHaveText(SERIES_REJECT_MESSAGE);
  await expect(dialog).toBeVisible();
});

test("the details view deletes the whole series after scope confirmation", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [seriesInstance],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTaskCategories]: [],
    [COMMANDS.listTaskSeries]: [seriesFixture],
    [COMMANDS.listSeriesInstances]: [seriesInstance],
    [COMMANDS.deleteTaskSeries]: null,
  });
  await page.goto(`/#${backlogPath}`);

  await page
    .getByRole("button", { name: editTaskLabel(TITLE_DRAFT_NOTES) })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: DELETE_BUTTON_LABEL })
    .first()
    .click();
  await expect(
    dialog.getByRole("heading", { name: DELETE_TASK_HEADING }),
  ).toBeVisible();
  await dialog.getByRole("radio", { name: TASK_SCOPE_SERIES_LABEL }).click();
  await dialog
    .getByRole("button", { name: DELETE_BUTTON_LABEL })
    .last()
    .click();

  const call = (await getInvocations<{ seriesId: number }>(page)).find(
    (c) => c.cmd === COMMANDS.deleteTaskSeries,
  );
  expect(call?.args.seriesId).toBe(seriesFixture.id);
});

test("the details view ends the series at the viewed date", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [seriesInstance],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTaskCategories]: [],
    [COMMANDS.listTaskSeries]: [seriesFixture],
    [COMMANDS.listSeriesInstances]: [seriesInstance],
    [COMMANDS.truncateTaskSeries]: null,
  });
  await page.goto(`/#${backlogPath}`);

  await page
    .getByRole("button", { name: editTaskLabel(TITLE_DRAFT_NOTES) })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: DELETE_BUTTON_LABEL })
    .first()
    .click();
  await dialog.getByRole("radio", { name: DELETE_SCOPE_FUTURE_LABEL }).click();
  await dialog
    .getByRole("button", { name: DELETE_BUTTON_LABEL })
    .last()
    .click();

  const call = (
    await getInvocations<{ seriesId: number; fromDate: string }>(page)
  ).find((c) => c.cmd === COMMANDS.truncateTaskSeries);
  expect(call?.args).toMatchObject({
    seriesId: seriesFixture.id,
    fromDate: seriesInstance.scheduled_date,
  });
});

const NOTE_BODY = "Call the venue";
const NOTE_BODY_EDITED = "Confirm chairs with venue";
const noteFixture = {
  id: 9,
  task_id: tasks[0].id,
  series_id: null,
  body: NOTE_BODY,
  created_at: "2026-10-11 10:00:00",
  updated_at: null,
};

test("adding a note to a task sends it on the wire and lists it", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: stubSequence([[], [noteFixture]]),
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [tasks[0]],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTaskCategories]: [],
    [COMMANDS.createTaskNote]: noteFixture,
  });
  await page.goto(`/#${backlogPath}`);

  await page
    .getByRole("button", { name: editTaskLabel(TITLE_DRAFT_NOTES) })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(NOTES_EMPTY_MESSAGE)).toBeVisible();

  await dialog.getByLabel(NOTE_COMPOSER_PLACEHOLDER).fill(NOTE_BODY);
  await dialog.getByRole("button", { name: NOTE_ADD_LABEL }).click();

  const call = (
    await getInvocations<{ taskId: number; body: string }>(page)
  ).find((c) => c.cmd === COMMANDS.createTaskNote);
  expect(call?.args).toMatchObject({ taskId: tasks[0].id, body: NOTE_BODY });
  await expect(dialog.getByText(NOTE_BODY)).toBeVisible();
});

test("editing and deleting a note goes through update_note and delete_note", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: stubSequence([
      [noteFixture],
      [
        {
          ...noteFixture,
          body: NOTE_BODY_EDITED,
          updated_at: "2026-10-11 11:00:00",
        },
      ],
      [],
    ]),
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [tasks[0]],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTaskCategories]: [],
    [COMMANDS.updateNote]: { ...noteFixture, body: NOTE_BODY_EDITED },
    [COMMANDS.deleteNote]: null,
  });
  await page.goto(`/#${backlogPath}`);

  await page
    .getByRole("button", { name: editTaskLabel(TITLE_DRAFT_NOTES) })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(NOTE_BODY)).toBeVisible();

  await dialog.getByRole("button", { name: noteEditLabel(NOTE_BODY) }).click();
  await dialog.getByLabel(NOTE_SAVE_LABEL).fill(NOTE_BODY_EDITED);
  await dialog.getByRole("button", { name: NOTE_SAVE_LABEL }).click();
  const update = (
    await getInvocations<{ noteId: number; body: string }>(page)
  ).find((c) => c.cmd === COMMANDS.updateNote);
  expect(update?.args).toMatchObject({
    noteId: noteFixture.id,
    body: NOTE_BODY_EDITED,
  });
  await expect(dialog.getByText(NOTE_BODY_EDITED)).toBeVisible();

  await dialog
    .getByRole("button", { name: noteDeleteLabel(NOTE_BODY_EDITED) })
    .click();
  // Deletion asks before it acts.
  expect(
    (await getInvocations(page)).some((c) => c.cmd === COMMANDS.deleteNote),
  ).toBe(false);
  await dialog
    .getByRole("button", {
      name: noteConfirmDeleteLabel(NOTE_BODY_EDITED),
    })
    .click();
  const del = (await getInvocations<{ noteId: number }>(page)).find(
    (c) => c.cmd === COMMANDS.deleteNote,
  );
  expect(del?.args).toMatchObject({ noteId: noteFixture.id });
});

test("the series tab writes series notes, not instance notes", async ({
  page,
}) => {
  const seriesNote = {
    ...noteFixture,
    task_id: null,
    series_id: seriesFixture.id,
  };
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: stubSequence([[], [seriesNote]]),
    [COMMANDS.listTasks]: [seriesInstance],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTaskCategories]: [],
    [COMMANDS.listTaskSeries]: [seriesFixture],
    [COMMANDS.listSeriesInstances]: [seriesInstance],
    [COMMANDS.listSeriesCategories]: [],
    [COMMANDS.createSeriesNote]: seriesNote,
  });
  await page.goto(`/#${backlogPath}`);

  await page
    .getByRole("button", { name: editTaskLabel(TITLE_DRAFT_NOTES) })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: NOTES_TAB_SERIES_LABEL }).click();
  await expect(
    dialog.getByRole("tabpanel").getByText(NOTES_EMPTY_MESSAGE),
  ).toBeVisible();

  const seriesPanel = dialog.getByRole("tabpanel");
  await seriesPanel.getByLabel(NOTE_COMPOSER_PLACEHOLDER).fill(NOTE_BODY);
  await seriesPanel.getByRole("button", { name: NOTE_ADD_LABEL }).click();

  const call = (
    await getInvocations<{ seriesId: number; body: string }>(page)
  ).find((c) => c.cmd === COMMANDS.createSeriesNote);
  expect(call?.args).toMatchObject({
    seriesId: seriesFixture.id,
    body: NOTE_BODY,
  });
  expect(
    (await getInvocations(page)).some((c) => c.cmd === COMMANDS.createTaskNote),
  ).toBe(false);
  await expect(dialog.getByText(NOTE_BODY)).toBeVisible();
});

test("a rejected note surfaces the typed error", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.listTasks]: [tasks[0]],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTaskCategories]: [],
    [COMMANDS.createTaskNote]: stubApiError(
      "note_body_too_long",
      "validation",
      "backend message differing from the mapped ui copy",
    ),
  });
  await page.goto(`/#${backlogPath}`);

  await page
    .getByRole("button", { name: editTaskLabel(TITLE_DRAFT_NOTES) })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(NOTE_COMPOSER_PLACEHOLDER).fill(NOTE_BODY);
  await dialog.getByRole("button", { name: NOTE_ADD_LABEL }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    NOTE_BODY_TOO_LONG_MESSAGE,
  );
});
