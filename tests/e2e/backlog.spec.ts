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
  SCHEDULED_INSTANCE_PENDING_MESSAGE,
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
import { ROUTES } from "@/lib/routes";

import { WEEKDAYS_BY_JS_DAY } from "@/lib/utils";

import { expect, test } from "./fixtures";
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
  await dialog.getByRole("button", { name: FRIDAY.label }).click();
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
  await dialog.getByRole("button", { name: FRIDAY.label }).click();
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
const seriesInstance = {
  ...tasks[0],
  series_id: seriesFixture.id,
  scheduled_date: "2026-10-19",
};
const SERIES_MONTH = new Date(Date.UTC(2026, 9, 1)).toLocaleDateString(
  "en-US",
  { month: "long", year: "numeric", timeZone: "UTC" },
);

test("opening a task shows a read-only details view first", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTasks]: [tasks[0]],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTaskCategories]: [],
  });
  await page.goto(`/#${backlogPath}`);

  await page
    .getByRole("button", { name: editTaskLabel(TITLE_DRAFT_NOTES) })
    .click();
  const dialog = page.getByRole("dialog");

  // Read-only: no form fields at all until Edit is pressed.
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
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
    dialog.getByText("20", { exact: true }).locator("[aria-hidden='true']"),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("tab", { name: NOTES_TAB_INSTANCE_LABEL }),
  ).toHaveAttribute("aria-selected", "true");
  await dialog.getByRole("tab", { name: NOTES_TAB_SERIES_LABEL }).click();
  await expect(
    dialog.getByRole("tab", { name: NOTES_TAB_SERIES_LABEL }),
  ).toHaveAttribute("aria-selected", "true");
});

test("picking a scheduled date without an instance shows the pending state", async ({
  page,
}) => {
  await stubTauriCommands(page, {
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

  // Mondays in Oct 2026: 5, 12, 19 (persisted), 26 — 26 has no instance.
  await dialog.getByRole("button", { name: "2026-10-26" }).click();
  await expect(
    dialog.getByText(SCHEDULED_INSTANCE_PENDING_MESSAGE),
  ).toBeVisible();
});

test("a series-scope save sends update_task_series with the schedule", async ({
  page,
}) => {
  await stubTauriCommands(page, {
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

test("the details view deletes the whole series after scope confirmation", async ({
  page,
}) => {
  await stubTauriCommands(page, {
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
